package com.avengers.endgame.dispute;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DisputeAccountSelectionTest {
    private static final String DESCRIPTION="Please investigate this order and its recorded execution price.";
    @Test void multipleAccountsRequireAnExplicitAccountForGeneralDisputes() {
        var jdbc=mock(JdbcTemplate.class);
        var user=UUID.randomUUID();
        when(jdbc.queryForList(anyString(),eq(UUID.class),eq(user))).thenReturn(List.of(UUID.randomUUID(),UUID.randomUUID()));
        var error=assertThrows(ResponseStatusException.class,()->new DisputeController(jdbc).create(user,
                new DisputeController.Request(null,"other",DESCRIPTION,null)));
        assertEquals(400,error.getStatusCode().value());
        verify(jdbc,never()).update(anyString(),any(Object[].class));
    }
    @Test void anotherClientsOrderCannotBeUsedToSelectAnAccount() {
        var jdbc=mock(JdbcTemplate.class);
        var user=UUID.randomUUID(); var order=UUID.randomUUID();
        when(jdbc.queryForList(anyString(),eq(UUID.class),eq(order),eq(user))).thenReturn(List.of());
        var error=assertThrows(ResponseStatusException.class,()->new DisputeController(jdbc).create(user,
                new DisputeController.Request(order,"trade",DESCRIPTION,null)));
        assertEquals(404,error.getStatusCode().value());
    }
    @Test void orderMustBelongToTheExplicitlySelectedAccount() {
        var jdbc=mock(JdbcTemplate.class);
        var user=UUID.randomUUID();var order=UUID.randomUUID();
        when(jdbc.queryForList(anyString(),eq(UUID.class),eq(order),eq(user))).thenReturn(List.of(UUID.randomUUID()));
        var error=assertThrows(ResponseStatusException.class,()->new DisputeController(jdbc).create(user,
                new DisputeController.Request(order,"trade",DESCRIPTION,UUID.randomUUID())));
        assertEquals(404,error.getStatusCode().value());
    }
    @Test void ownedOrderSelectsItsAccountWithoutRequiringTheClientToKnowItsId() {
        var jdbc=mock(JdbcTemplate.class);
        var user=UUID.randomUUID();var order=UUID.randomUUID();var account=UUID.randomUUID();
        when(jdbc.queryForList(anyString(),eq(UUID.class),eq(order),eq(user))).thenReturn(List.of(account));
        var response=new DisputeController(jdbc).create(user,new DisputeController.Request(order,"trade",DESCRIPTION,null));
        assertEquals(order,response.orderId());
        verify(jdbc).update(contains("INSERT INTO client_disputes"),any(UUID.class),eq(account),eq(order),eq("trade"),eq(DESCRIPTION),any(java.sql.Timestamp.class));
    }
}
