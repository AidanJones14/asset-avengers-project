package com.avengers.endgame.dispute;

import com.avengers.endgame.account.AccountResponseDto;
import com.avengers.endgame.account.AccountService;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DisputeControllerTest {
    final AccountService current = mock(AccountService.class);
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final UUID userId = UUID.randomUUID();
    final DisputeController controller = new DisputeController(current, jdbc);
    final UUID accountId = UUID.randomUUID();
    void account() {
        AccountResponseDto account = mock(AccountResponseDto.class);
        when(account.accountId()).thenReturn(accountId);
        when(current.getForUser(userId)).thenReturn(account);
    }
    @Test void refusesOrdersOutsideTheVerifiedAccount() {
        account(); UUID orderId = UUID.randomUUID();
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(orderId), eq(accountId))).thenReturn(false);
        var error = assertThrows(ResponseStatusException.class, () -> controller.create(userId,
                new DisputeController.Request(orderId, "trade", "This order was not placed by me.")));
        assertEquals(404, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void storesTheAuthenticatedAccountAndReturnsAReference() {
        account();
        var result = controller.create(userId, new DisputeController.Request(null, "funding", "  My deposit is missing from my balance.  "));
        assertNotNull(result.disputeId()); assertEquals("submitted", result.status());
        assertEquals("My deposit is missing from my balance.", result.description());
        verify(jdbc).update(anyString(), eq(result.disputeId()), eq(accountId), isNull(), eq("funding"),
                eq(result.description()), any(java.sql.Timestamp.class));
    }
    @Test void rejectsBlankDescriptionsAndUnsupportedReasons() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertFalse(validator.validate(new DisputeController.Request(null, "invalid", " ")).isEmpty());
            assertTrue(validator.validate(new DisputeController.Request(null, "other", "Please investigate this account issue.")).isEmpty());
        }
        account();
        assertThrows(ResponseStatusException.class, () -> controller.create(userId,
                new DisputeController.Request(null, "other", "                      ")));
        verifyNoInteractions(jdbc);
    }
}
