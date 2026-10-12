package com.avengers.endgame.account;

import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
public class AccountService {

    private final AccountRepository accountRepository;
    private final UserRepository userRepository;
    private final AccountMapper accountMapper;

    public AccountService(
            AccountRepository accountRepository,
            UserRepository userRepository,
            AccountMapper accountMapper
    ) {
        this.accountRepository = accountRepository;
        this.userRepository = userRepository;
        this.accountMapper = accountMapper;
    }

    public AccountResponseDto createAccount(CreateAccountRequestDto request) {

        UUID userId = request.userId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));

        Account account = accountMapper.toEntity(request, user);
        Account savedAccount = accountRepository.save(account);
        return accountMapper.toResponse(savedAccount);
    }
}


