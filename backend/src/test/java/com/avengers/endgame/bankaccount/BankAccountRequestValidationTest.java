package com.avengers.endgame.bankaccount;

import com.avengers.endgame.exception.OrderExceptionHandler;
import com.avengers.endgame.session.CurrentUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BankAccountRequestValidationTest {
    private BankAccountService banking;
    private CurrentUserService current;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        banking = mock(BankAccountService.class);
        current = mock(CurrentUserService.class);
        mvc = MockMvcBuilders.standaloneSetup(new BankAccountController(banking, current))
                .setControllerAdvice(new OrderExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();
    }

    @ParameterizedTest
    @CsvSource({"deposit,null", "withdraw,null", "deposit,-1", "withdraw,0",
            "deposit,1.001", "withdraw,10000000000000000"})
    void invalidCashAmountReturns400WithoutCallingFinancialService(String operation, String amount) throws Exception {
        mvc.perform(post("/api/v1/bank-accounts/" + operation).contentType("application/json")
                .content("{\"bankAccountId\":\"00000000-0000-0000-0000-000000000001\",\"amount\":" + amount + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("errors[0].field").value("amount"));
        verifyNoInteractions(banking, current);
    }

    @Test
    void invalidBankUuidIsAValidationErrorRatherThanA500() throws Exception {
        mvc.perform(post("/api/v1/bank-accounts/deposit").contentType("application/json")
                .content("{\"bankAccountId\":\"not-a-uuid\",\"amount\":10}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("errors[0].field").value("bankAccountId"));
        verifyNoInteractions(banking, current);
    }

    @Test
    void invalidPathUuidUsesSpringMvcBadRequestHandling() throws Exception {
        mvc.perform(delete("/api/v1/bank-accounts/not-a-uuid"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(banking, current);
    }
}
