package com.avengers.endgame.user;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.util.UUID;

// Owner: user domain (service layer). The one place that creates a caller's records in the trading DB.
// Used by: UserProvisioningInterceptor, once per /api/v1/** request, after Spring Security has
//   accepted the token. Controllers and other services never call it.
// Knows nothing about JWTs: it takes plain values, so it can be unit-tested without a token.
// When provision() returns:
//   - every signed-in user (any role) has a users row whose email, role and (when the token has them)
//     names match their token. Staff search reads the names through the reporting pipeline.
//   - client records are provisioned without opening an investment account
@Service
public class UserProvisioningService {

    private final UserRepository userRepository;
    // Constructor injection: Spring passes in the two repository beans when it creates this service.
    public UserProvisioningService(UserRepository userRepository) {
        this.userRepository = userRepository;
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
    }
}
