package com.avengers.endgame.account;

import com.avengers.endgame.user.User;
import org.springframework.stereotype.Component;

@Component
public class AccountMapper {

    public Account toEntity(CreateAccountRequestDto dto, User user) {
        return new Account(user, dto.cashBalance());
    }

    public AccountResponseDto toResponse(Account account) {
        return new AccountResponseDto(
                account.getAccountId(),
                account.getUser().getUserId(),
                account.getCashBalance(),
                account.isSuspended(),
                account.getUpdatedAt()
        );
    }
}


