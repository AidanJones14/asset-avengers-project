package com.avengers.endgame.user;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.mockito.Mockito.verify;

// Unit test for UserProvisioningService.provision, the one place that creates a caller's records.
// Mockito, no database: H2 (the default test database) can't run the upsert (ON CONFLICT ... DO
//   UPDATE). So this pins down the decisions provision() makes, and the Postgres-only test in
//   OrderFlowIntegrationTest runs the real SQL.
// Every role gets its users row; investment accounts are created separately through the account API.
@ExtendWith(MockitoExtension.class)
class UserProvisioningServiceTest {

    private static final String EMAIL = "client@example.com";

    @Mock
    private UserRepository userRepository;

    private UserProvisioningService provisioning;

    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        provisioning = new UserProvisioningService(userRepository);
    }

    @Test
    void clientsFirstRequest_onlyCreatesTheirUserRow() {
        provisioning.provision(userId, EMAIL, UserRole.client, null, null);

        verify(userRepository).upsertFromToken(userId, EMAIL, "client", null, null, null);
    }

    @ParameterizedTest
    @EnumSource(value = UserRole.class, names = {"admin", "analyst"})
    void staff_getARowButNeverATradingAccount(UserRole role) {
        provisioning.provision(userId, "staff@example.com", role, null, null);

        verify(userRepository).upsertFromToken(userId, "staff@example.com", role.name(), null, null, null);
    }

    @Test
    void aTokenWithBothNames_passesThemAndTheFullName() {
        provisioning.provision(userId, EMAIL, UserRole.client, "Caméron", "O’Kelly");

        verify(userRepository).upsertFromToken(userId, EMAIL, "client", "Caméron", "O’Kelly", "Caméron O’Kelly");
    }

    @ParameterizedTest
    @CsvSource({"Ada,", ",Lovelace", "' ',Lovelace"})
    void aTokenMissingEitherName_passesNoNames_soTheStoredOnesAreKept(String firstName, String lastName) {
        provisioning.provision(userId, EMAIL, UserRole.client, firstName, lastName);

        verify(userRepository).upsertFromToken(userId, EMAIL, "client", null, null, null);
    }
}
