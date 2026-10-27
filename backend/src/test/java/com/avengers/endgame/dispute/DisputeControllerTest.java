package com.avengers.endgame.dispute;

import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DisputeControllerTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final UUID userId = UUID.randomUUID();
    final DisputeController controller = new DisputeController(jdbc);
    final UUID accountId = UUID.randomUUID();
    void account() {
        when(jdbc.queryForList(anyString(),eq(UUID.class),eq(userId))).thenReturn(java.util.List.of(accountId));
    }
    @Test void refusesOrdersOutsideTheVerifiedAccount() {
        account(); UUID orderId = UUID.randomUUID();
        when(jdbc.queryForList(anyString(),eq(UUID.class),eq(orderId),eq(userId))).thenReturn(java.util.List.of());
        var error = assertThrows(ResponseStatusException.class, () -> controller.create(userId,
                new DisputeController.Request(orderId, "trade", "This order was not placed by me.",null)));
        assertEquals(404, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void storesTheAuthenticatedAccountAndReturnsAReference() {
        account();
        var result = controller.create(userId, new DisputeController.Request(null, "funding", "  My deposit is missing from my balance.  ",null));
        assertNotNull(result.disputeId()); assertEquals("submitted", result.status());
        assertEquals("My deposit is missing from my balance.", result.description());
        verify(jdbc).update(anyString(), eq(result.disputeId()), eq(accountId), isNull(), eq("funding"),
                eq(result.description()), any(java.sql.Timestamp.class));
    }
    @Test void rejectsBlankDescriptionsAndUnsupportedReasons() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertFalse(validator.validate(new DisputeController.Request(null, "invalid", " ",null)).isEmpty());
            assertTrue(validator.validate(new DisputeController.Request(null, "other", "Please investigate this account issue.",null)).isEmpty());
        }
        assertThrows(ResponseStatusException.class, () -> controller.create(userId,
                new DisputeController.Request(null, "other", "                      ",null)));
        verifyNoInteractions(jdbc);
    }
}
