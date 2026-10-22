package com.avengers.endgame.account;

import org.springframework.stereotype.Component;

// Owner: account domain. Turns an Account entity into the JSON shape the API returns.
// Used by: AccountService. There is deliberately no request-to-entity method: accounts are only
//   created by UserProvisioningService, with the owner taken from the token and zero cash.
//   (The old toEntity took the userId and starting cash from the request body.)
@Component
public class AccountMapper {

    public AccountResponseDto toResponse(Account account) {
        return new AccountResponseDto(
                account.getAccountId(),
                account.getUser().getUserId(),
                account.getAccountName(),
                account.getAccountType(),
                account.getCashBalance(),
                account.isSuspended(),
                account.isDeactivated(),
                account.getUpdatedAt()
        );
    }
}
