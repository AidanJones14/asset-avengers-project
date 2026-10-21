package com.avengers.endgame.account;

import com.avengers.endgame.holding.Holding;
import com.avengers.endgame.holding.HoldingRepository;
import com.avengers.endgame.order.domain.Order;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class AccountServiceTest {
    private final AccountRepository accounts = mock(AccountRepository.class);
    private final AccountMapper mapper = mock(AccountMapper.class);
    private final UserRepository users = mock(UserRepository.class);
    private final OrderRepository orders = mock(OrderRepository.class);
    private final HoldingRepository holdings = mock(HoldingRepository.class);
    private final AccountService service = new AccountService(accounts, mapper, users, orders, holdings);
    private final UUID userId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();

    private Account account(BigDecimal cash) {
        User user = new User(userId, "Client", com.avengers.endgame.user.UserRole.client);
        Account account = new Account(user, "Brokerage", "Individual Brokerage", cash);
        account.setAccountId(accountId);
        return account;
    }

    private void ready(Account account) {
        when(accounts.findByIdForUpdate(accountId)).thenReturn(Optional.of(account));
        when(orders.findByAccountIdAndStatusIn(eq(accountId), any())).thenReturn(List.of());
        when(holdings.findByAccountId(accountId)).thenReturn(List.of());
    }

    @Test
    void deactivatesAnEmptyAccount() {
        Account account = account(BigDecimal.ZERO);
        ready(account);

        service.deactivateForUser(userId, accountId);

        assertEquals(true, account.isDeactivated());
        verify(accounts).save(account);
    }

    @Test
    void rejectsNonZeroCash() {
        Account account = account(new BigDecimal("0.01"));
        ready(account);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.deactivateForUser(userId, accountId));

        assertEquals(409, error.getStatusCode().value());
        verify(accounts, never()).save(any());
    }

    @Test
    void rejectsActiveOrders() {
        Account account = account(BigDecimal.ZERO);
        ready(account);
        when(orders.findByAccountIdAndStatusIn(eq(accountId), any()))
                .thenReturn(List.of(mock(Order.class)));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.deactivateForUser(userId, accountId));

        assertEquals(409, error.getStatusCode().value());
    }

    @Test
    void rejectsPositiveHoldings() {
        Account account = account(BigDecimal.ZERO);
        ready(account);
        Holding holding = mock(Holding.class);
        when(holding.getQuantity()).thenReturn(new BigDecimal("0.0001"));
        when(holdings.findByAccountId(accountId)).thenReturn(List.of(holding));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.deactivateForUser(userId, accountId));

        assertEquals(409, error.getStatusCode().value());
    }

    @Test
    void doesNotAllowAnotherUserToDeactivateTheAccount() {
        Account account = account(BigDecimal.ZERO);
        when(accounts.findByIdForUpdate(accountId)).thenReturn(Optional.of(account));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.deactivateForUser(UUID.randomUUID(), accountId));

        assertEquals(404, error.getStatusCode().value());
    }

    @Test
    void reportsEachDeletionRuleIndependently() {
        for (boolean cashEmpty : List.of(false, true)) {
            for (boolean activeOrdersEmpty : List.of(false, true)) {
                for (boolean holdingsEmpty : List.of(false, true)) {
                    Account account = account(cashEmpty ? BigDecimal.ZERO : BigDecimal.ONE);
                    ready(account);
                    when(orders.findByAccountIdAndStatusIn(eq(accountId), any()))
                            .thenReturn(activeOrdersEmpty ? List.of() : List.of(mock(Order.class)));
                    Holding holding = mock(Holding.class);
                    when(holding.getQuantity()).thenReturn(BigDecimal.ONE);
                    when(holdings.findByAccountId(accountId))
                            .thenReturn(holdingsEmpty ? List.of() : List.of(holding));

                    AccountDeletionEligibility result = service.getDeletionEligibility(userId, accountId);

                    assertEquals(cashEmpty, result.cashEmpty());
                    assertEquals(activeOrdersEmpty, result.activeOrdersEmpty());
                    assertEquals(holdingsEmpty, result.holdingsEmpty());
                    assertEquals(cashEmpty && activeOrdersEmpty && holdingsEmpty, result.allowed());
                }
            }
        }
    }
}
