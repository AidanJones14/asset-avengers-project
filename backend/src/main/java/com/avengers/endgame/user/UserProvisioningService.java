package com.avengers.endgame.user;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.math.BigDecimal;
import java.util.UUID;

// Owner: user domain (service layer). The one place that creates a caller's records in the trading DB.
// Used by: UserProvisioningInterceptor, once per /api/v1/** request, after Spring Security has
//   accepted the token. Controllers and other services never call it.
// Knows nothing about JWTs: it takes plain values, so it can be unit-tested without a token.
// When provision() returns:
//   - every signed-in user (any role) has a users row whose email, role and (when the token has them)
//     names match their token. Staff search reads the names through the reporting pipeline.
//   - every client also has exactly one trading account (zero cash the first time)
@Service
public class UserProvisioningService {

    private final UserRepository userRepository;
    private final AccountRepository accountRepository;

    // Constructor injection: Spring passes in the two repository beans when it creates this service.
    public UserProvisioningService(UserRepository userRepository, AccountRepository accountRepository) {
        this.userRepository = userRepository;
        this.accountRepository = accountRepository;
    }

    // @Transactional: everything below commits or rolls back together, and the row lock in step 4
    //   is held until this method returns. The upsert is a @Modifying query, which needs a transaction.
    // The interceptor calls this from another bean, so Spring's transaction proxy is applied.
    @Transactional
    public void provision(UUID userId, String email, UserRole role, String firstName, String lastName) {
        // 1. Names count only when the token has both (auth-server sends given_name/family_name when the
        //    user has them). Otherwise all three are null, which the upsert reads as "keep the stored names".
        boolean named = StringUtils.hasText(firstName) && StringUtils.hasText(lastName);
        // 2. Insert the users row, or update it if the token's values changed.
        //    One atomic statement, so two first requests can't both insert. Usually writes nothing.
        userRepository.upsertFromToken(userId, email, role.name(),
                named ? firstName : null, named ? lastName : null, named ? firstName + " " + lastName : null);
        // 3. Staff (admin/analyst) stop here: they never get trading accounts, and the DB triggers
        //    trg_prevent_staff_account / trg_prevent_staff_role_with_account enforce that too.
        //    For a client whose account already exists (the usual case), this is one cheap check, no lock.
        if (role == UserRole.client && !accountRepository.existsByUserUserId(userId)) {
            // 4. First request for this client: lock their users row (SELECT ... FOR UPDATE).
            //    Another request for the same client arriving now waits here until we commit.
            User user = userRepository.findByIdForUpdate(userId).orElseThrow();
            // 5. Check again under the lock: the request we waited for may have just created it.
            //    accounts.user_id isn't UNIQUE in the schema, so this lock is what keeps it to one account.
            if (!accountRepository.existsByUserUserId(userId)) {
                // 6. Create the empty trading account. Money comes in later through the bank-account deposit endpoint.
                accountRepository.save(new Account(user, BigDecimal.ZERO));
            }
        }
    }
}
