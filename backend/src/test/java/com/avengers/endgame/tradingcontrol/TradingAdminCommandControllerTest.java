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
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The admin command endpoints without the security filters (standaloneSetup), with the app's one error
// handler. Who may call them is checked in EndpointAccessTest; this checks what they do with a request.
@ExtendWith(MockitoExtension.class)
class TradingAdminCommandControllerTest {
    @Mock
    private AdminSuspensionService commands;
    @Mock
    private AdminActorResolver actors;
    private MockMvc mvc;
    private final UUID adminId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        // 1. The admin's validated token, as the security chain leaves it. @CurrentUserId reads its sub.
        var jwt = Jwt.withTokenValue("test").header("alg", "HS256")
                .subject(adminId.toString()).claim("email", "admin@example.invalid").build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
                jwt, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        // 2. standaloneSetup doesn't register Spring Security's resolver for @CurrentUserId, so add it.
        mvc = MockMvcBuilders.standaloneSetup(new TradingAdminCommandController(commands, actors, org.mockito.Mockito.mock(AccountSuspensionSchedules.class)))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new OrderExceptionHandler()).build();
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void theAuditedActorIsTheCaller() throws Exception {
        UUID id = UUID.randomUUID();
        AdminActor actor = new AdminActor(adminId, "admin@example.invalid");
        when(actors.resolve(adminId)).thenReturn(actor);
        mvc.perform(post("/api/v1/admin/accounts/{id}/suspend", id)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Review\"}"))
                .andExpect(status().isOk());
        verify(commands).setAccountSuspended(id, true, "Review", actor);
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
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("reason"));
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
