package com.avengers.endgame.exception;

import com.avengers.endgame.instrument.InstrumentNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

// Owner: web layer, cross-cutting. The one place that turns an exception from any controller into the
//   error response the client sees: RFC 9457 Problem Details (application/problem+json), the shape the
//   spec calls ApiError (docs/endgame-api.yaml): title, status, detail, code.
// The name says "Order" for history only. It handles every controller, and keeps its name so code that
//   constructs it (OrderFlowIntegrationTest) keeps compiling.
// When it runs: after a controller, its argument binding, or the provisioning interceptor throws.
//   It never sees 401/403: Spring Security answers those in the filter chain, before Spring MVC runs.
// How Spring uses it:
//   - @RestControllerAdvice applies it to every @RestController. For each exception, Spring MVC picks the
//     @ExceptionHandler whose declared type is the closest match (inherited handlers included).
//   - ResponseEntityExceptionHandler is Spring's base class for this. Its handlers answer every Spring
//     MVC exception with the right 4xx: unreadable or invalid (@Valid) bodies, a malformed UUID in the
//     path, an unknown route, a wrong HTTP method. They also answer every ResponseStatusException the
//     services throw (e.g. 404 "Order with ID ... not found").
//   - createResponseEntity (bottom) is where those inherited handlers finish, so the "code" the spec
//     requires is added in one place. The handlers written here set their own code.
// The frontend shows "detail" to users (trade dialog, market watch, stock search), so detail is always
//   a message meant for them, never internal text.
@RestControllerAdvice
public class OrderExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(OrderExceptionHandler.class);

    // A broken trading rule found by OrderValidator, e.g. "Order quantity must be greater than 0".
    @ExceptionHandler(OrderValidationException.class)
    public ProblemDetail handleValidation(OrderValidationException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problem.setTitle("Invalid order");
        problem.setProperty("code", "VALIDATION_ERROR");
        return problem;
    }

    // An unknown stock symbol. Nothing on this branch throws InstrumentNotFoundException any more
    // (InstrumentService now answers with ResponseStatusException), but the 404 it was given is kept
    // for any code that still throws it.
    @ExceptionHandler(InstrumentNotFoundException.class)
    public ProblemDetail handleInstrumentNotFound(InstrumentNotFoundException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Stock symbol not found in database");
        problem.setTitle("Instrument not found");
        problem.setProperty("code", "INSTRUMENT_NOT_FOUND");
        return problem;
    }

    // Everything no other handler claims: a bug or an outage (e.g. a database or trigger error), never
    // the caller's fault.
    // Roles are checked only in SecurityConfig's URL rules. If method security (@PreAuthorize) is ever
    // added, its AccessDeniedException must be let through here, or it would turn into a 500.
    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception exception, HttpServletRequest request) {
        // 1. Log everything for us, with the stack trace. The message can hold SQL, constraint or trigger
        //    names, so it stays in the log.
        log.error("Unhandled exception on {} {}", request.getMethod(), request.getRequestURI(), exception);
        // 2. Tell the caller only that it failed.
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");
        problem.setTitle("Internal server error");
        problem.setProperty("code", "INTERNAL_ERROR");
        return problem;
    }

    // Every response from the inherited handlers passes through here.
    @Override
    protected ResponseEntity<Object> createResponseEntity(@Nullable Object body, HttpHeaders headers,
                                                          HttpStatusCode statusCode, WebRequest request) {
        // 1. Add the spec's required "code", unless the exception already set one
        //    (e.g. BankAccountService's INSUFFICIENT_CASH).
        if (body instanceof ProblemDetail problem
                && (problem.getProperties() == null || !problem.getProperties().containsKey("code"))) {
            problem.setProperty("code", defaultCode(statusCode));
        }
        // 2. Spring builds the response as usual.
        return super.createResponseEntity(body, headers, statusCode, request);
    }

    // 400 is VALIDATION_ERROR, as in the spec. Every other status uses its standard name
    // (404 -> NOT_FOUND, as in the spec; 405 -> METHOD_NOT_ALLOWED; 502 -> BAD_GATEWAY).
    private static String defaultCode(HttpStatusCode statusCode) {
        if (statusCode.value() == HttpStatus.BAD_REQUEST.value()) {
            return "VALIDATION_ERROR";
        }
        HttpStatus status = HttpStatus.resolve(statusCode.value());
        return status != null ? status.name() : "HTTP_" + statusCode.value();
    }
}
