package com.avengers.endgame.order;

import com.avengers.endgame.session.CurrentUserService;
import com.avengers.endgame.account.*;
import com.avengers.endgame.user.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.math.BigDecimal;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class CurrentUserServiceTest {
 @Test void firstLoginLinksTheAuthIdAndCreatesAnEmptyAccountOnlyOnce() {
    UUID id = UUID.randomUUID();
    var user = new User(id, "Client", UserRole.client);
    var users = mock(UserRepository.class);
    var accounts = mock(AccountRepository.class);
    when(users.existsById(id)).thenReturn(false, true);
    when(users.findByIdForUpdate(id)).thenReturn(Optional.of(user));
    when(accounts.findByUserUserId(id)).thenReturn(List.of());
    when(accounts.save(any())).thenAnswer(call -> { Account account = call.getArgument(0); account.setAccountId(id); return account; });
    var jwt = Jwt.withTokenValue("test").header("alg", "HS256").subject(id.toString())
        .claim("email", "client@example.com").claim("roles", List.of("CLIENT")).build();
    var current = new CurrentUserService(users, accounts);
    var first = current.account(jwt);
    assertEquals(BigDecimal.ZERO, first.getCashBalance());
    assertEquals(id, first.getUser().getUserId());
    when(accounts.findByUserUserId(id)).thenReturn(List.of(first));
    assertSame(first, current.account(jwt));
    verify(accounts, times(1)).save(any());
    verify(users).insertIfAbsent(id, "client@example.com", "client");
 }
}
