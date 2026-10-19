package com.avengers.endgame.exception;

import com.avengers.endgame.instrument.InstrumentNotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Unit test for OrderExceptionHandler: what the client receives for each kind of failure.
// How: a standalone MockMvc with one test-only controller (Failing, below) that throws each kind of
//   exception, and the real OrderExceptionHandler in front of it. No Spring context, no security, no
//   database. The real controllers throw the same exception types (checked in the services).
// What it pins down (docs/endgame-api.yaml, ApiError):
//   - every error is application/problem+json with the required "code"
//   - nothing internal leaks: an unexpected error's message stays in the log
//   - bad input is 400, never 500 (malformed UUID, unreadable body, @Valid failure)
//   - "detail" stays the user-facing message the frontend shows
class OrderExceptionHandlerTest {

    // Internal text that must never reach a client (like a Postgres constraint error).
    private static final String INTERNAL = "duplicate key value violates unique constraint \"users_email_key\"";

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new Failing())
                .setControllerAdvice(new OrderExceptionHandler())
                .build();
    }

    @Test
    void serviceRefusal_keepsItsStatusAndMessage_andGetsACode() throws Exception {
        // Services refuse with ResponseStatusException, e.g. OrderService's owner-scoped 404.
        mvc.perform(get("/failing/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("Order with ID 42 not found"))
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void aCodeSetByTheService_isKept() throws Exception {
        // BankAccountService's insufficient-funds refusal carries the spec's own code.
        mvc.perform(get("/failing/insufficient-cash"))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.detail").value("Insufficient funds"))
                .andExpect(jsonPath("$.code").value("INSUFFICIENT_CASH"));
    }

    @Test
    void brokenTradingRule_is400ValidationError() throws Exception {
        mvc.perform(get("/failing/order-rule"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid order"))
                .andExpect(jsonPath("$.detail").value("Order quantity must be greater than 0"))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void unknownInstrument_is404() throws Exception {
        mvc.perform(get("/failing/instrument"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("INSTRUMENT_NOT_FOUND"));
    }

    @Test
    void unexpectedErrors_are500_withAGenericMessage_andNoInternalText() throws Exception {
        // 1. A runtime failure (database, trigger, bug).
        mvc.perform(get("/failing/unexpected"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred"))
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(content().string(not(containsString("users_email_key"))));
        // 2. A checked exception gets the same treatment, instead of Spring Boot's default error page.
        mvc.perform(get("/failing/checked"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(content().string(not(containsString("users_email_key"))));
    }

    @Test
    void malformedUuidInThePath_is400_not500() throws Exception {
        // Spring's MethodArgumentTypeMismatchException is a RuntimeException; the old catch-all made it a 500.
        mvc.perform(get("/failing/orders/not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void badRequestBodies_are400ProblemDetails() throws Exception {
        // 1. Not JSON at all.
        mvc.perform(post("/failing/body").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        // 2. Valid JSON that fails @Valid. It used to skip this handler and get Spring Boot's default JSON.
        mvc.perform(post("/failing/body").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void wrongHttpMethod_is405_withItsStandardCode() throws Exception {
        mvc.perform(delete("/failing/not-found"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    // Test-only controller: each endpoint fails the way a real controller or service can.
    // Nested in a test class, so Spring Boot's component scan in other tests ignores it.
    @RestController
    @RequestMapping("/failing")
    static class Failing {

        record Body(@NotBlank String name) {}

        @GetMapping("/not-found")
        void notFound() {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order with ID 42 not found");
        }

        @GetMapping("/insufficient-cash")
        void insufficientCash() {
            ResponseStatusException exception = new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, "Insufficient funds");
            exception.getBody().setProperty("code", "INSUFFICIENT_CASH");
            throw exception;
        }

        @GetMapping("/order-rule")
        void orderRule() {
            throw new OrderValidationException("Order quantity must be greater than 0");
        }

        @GetMapping("/instrument")
        void instrument() {
            throw new InstrumentNotFoundException("Instrument not found: ZZZZ");
        }

        @GetMapping("/unexpected")
        void unexpected() {
            throw new IllegalStateException(INTERNAL);
        }

        @GetMapping("/checked")
        void checked() throws IOException {
            throw new IOException(INTERNAL);
        }

        @GetMapping("/orders/{orderId}")
        UUID order(@PathVariable UUID orderId) {
            return orderId;
        }

        @PostMapping("/body")
        Body body(@Valid @RequestBody Body body) {
            return body;
        }
    }
}
