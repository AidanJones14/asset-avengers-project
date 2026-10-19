package com.avengers.endgame.user;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

// Unit test for UserProvisioningService.provision, the one place that creates a caller's records.
// Mockito, no database: H2 (the default test database) can't run the upsert (ON CONFLICT ... DO
//   UPDATE). So this pins down the decisions provision() makes, and the Postgres-only test in
//   OrderFlowIntegrationTest runs the real SQL.
// The four paths:
//   1. client, first request    -> users row, lock, one zero-cash account
//   2. client, account exists   -> users row only (the usual case: no lock, no write)
//   3. admin/analyst            -> users row only; accounts are never touched
//   4. client, lost race        -> lock, then the re-check finds the account: no second one
// And the names passed to the upsert: all three when the token has both names, otherwise none.
@ExtendWith(MockitoExtension.class)
class UserProvisioningServiceTest {

    private static final String EMAIL = "client@example.com";

    @Mock
    private UserRepository userRepository;

    @Mock
    private AccountRepository accountRepository;

    private UserProvisioningService provisioning;

    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        provisioning = new UserProvisioningService(userRepository, accountRepository);
    }

    @Test
    void clientsFirstRequest_createsTheirRowAndOneEmptyAccount() {
        // 1. No account before the lock, and still none after it.
        User user = new User(userId, null, UserRole.client);
        when(accountRepository.existsByUserUserId(userId)).thenReturn(false, false);
        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));

        provisioning.provision(userId, EMAIL, UserRole.client, null, null);

        // 2. Upsert the row, then lock it, then save the account, in that order.
        InOrder order = inOrder(userRepository, accountRepository);
        order.verify(userRepository).upsertFromToken(userId, EMAIL, "client", null, null, null);
        order.verify(userRepository).findByIdForUpdate(userId);
        ArgumentCaptor<Account> saved = ArgumentCaptor.forClass(Account.class);
        order.verify(accountRepository).save(saved.capture());
        // 3. The account belongs to the caller and starts with no cash.
        assertSame(user, saved.getValue().getUser());
        assertEquals(0, BigDecimal.ZERO.compareTo(saved.getValue().getCashBalance()));
    }

    @Test
    void clientWithAnAccount_isOnlySynced_noLockAndNoNewAccount() {
        when(accountRepository.existsByUserUserId(userId)).thenReturn(true);

        provisioning.provision(userId, EMAIL, UserRole.client, null, null);

        verify(userRepository).upsertFromToken(userId, EMAIL, "client", null, null, null);
        verify(userRepository, never()).findByIdForUpdate(any());
        verify(accountRepository, never()).save(any());
    }

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"admin", "analyst"})
    void staff_getARowButNeverATradingAccount(UserRole role) {
        provisioning.provision(userId, "staff@example.com", role, null, null);

        verify(userRepository).upsertFromToken(userId, "staff@example.com", role.name(), null, null, null);
        verify(userRepository, never()).findByIdForUpdate(any());
        verifyNoInteractions(accountRepository);
    }

    @Test
    void clientWhoLosesTheRace_waitsForTheLockAndDoesNotCreateASecondAccount() {
        // 1. No account before the lock. Another request created it while this one waited.
        when(accountRepository.existsByUserUserId(userId)).thenReturn(false, true);
        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(new User(userId, null, UserRole.client)));

        provisioning.provision(userId, EMAIL, UserRole.client, null, null);

        // 2. The lock was taken, and the re-check under it prevented a duplicate.
        verify(userRepository).findByIdForUpdate(userId);
        verify(accountRepository, never()).save(any());
    }

    @Test
    void aTokenWithBothNames_passesThemAndTheFullName() {
        when(accountRepository.existsByUserUserId(userId)).thenReturn(true);

        provisioning.provision(userId, EMAIL, UserRole.client, "Caméron", "O’Kelly");

        verify(userRepository).upsertFromToken(userId, EMAIL, "client", "Caméron", "O’Kelly", "Caméron O’Kelly");
    }

    @ParameterizedTest
    @CsvSource({"Ada,", ",Lovelace", "' ',Lovelace"})
    void aTokenMissingEitherName_passesNoNames_soTheStoredOnesAreKept(String firstName, String lastName) {
        when(accountRepository.existsByUserUserId(userId)).thenReturn(true);

        provisioning.provision(userId, EMAIL, UserRole.client, firstName, lastName);

        verify(userRepository).upsertFromToken(userId, EMAIL, "client", null, null, null);
    }
}
