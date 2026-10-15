package com.avengers.endgame.tradingcontrol;

import com.avengers.endgame.exception.OrderExceptionHandler;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class TradingAdminCommandControllerTest {
    @Mock
    private AdminSuspensionService commands;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        var jwt = Jwt.withTokenValue("test").header("alg", "HS256")
                .subject(UUID.randomUUID().toString()).claim("email", "admin@example.invalid").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
                jwt, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        mvc = MockMvcBuilders.standaloneSetup(new TradingAdminCommandController(commands, new AdminActorResolver()))
                .setControllerAdvice(new TradingAdminExceptionHandler(), new OrderExceptionHandler()).build();
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void malformedIdIsAClientErrorAndDoesNotExecuteACommand() throws Exception {
        mvc.perform(post("/api/v1/admin/accounts/not-a-uuid/suspend")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Review\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(commands);
    }

    @Test
    void blankReasonDoesNotExecuteACommand() throws Exception {
        mvc.perform(post("/api/v1/admin/accounts/{id}/suspend", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\" \"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(commands);
    }

    @Test
    void businessConflictRetainsItsStatusAndExplanation() throws Exception {
        UUID id = UUID.randomUUID();
        when(commands.setAccountSuspended(eq(id), eq(true), eq("Review"), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Account is already suspended"));
        mvc.perform(post("/api/v1/admin/accounts/{id}/suspend", id)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Review\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Account is already suspended"));
    }
}
