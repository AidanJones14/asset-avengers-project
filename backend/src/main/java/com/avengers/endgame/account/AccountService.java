package com.avengers.endgame.account;

import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;

// Owner: account domain (service layer). Reads and creates a client's trading accounts.
// Used by: AccountController.
@Service
public class AccountService {

    private final AccountRepository accountRepository;
    private final AccountMapper accountMapper;
    private final UserRepository userRepository;
    private static final Set<String> ACCOUNT_TYPES = Set.of(
            "Individual Brokerage", "Roth IRA", "Traditional IRA",
            "Health Savings Account (HSA)", "401(k)", "529 College Savings Plan");

    // Constructor injection: Spring passes in the repository and mapper beans.
    public AccountService(AccountRepository accountRepository, AccountMapper accountMapper, UserRepository userRepository) {
        this.accountRepository = accountRepository;
        this.accountMapper = accountMapper;
        this.userRepository = userRepository;
    }

    // Returns the caller's trading accounts. userId always comes from the token (@CurrentUserId),
    // never from the request, so a client can only ever see their own account.
    public List<AccountResponseDto> getForUser(UUID userId) {
        return accountRepository.findByUserUserId(userId).stream()
                .map(accountMapper::toResponse)
                .toList();
    }

    @Transactional
    public AccountResponseDto createForUser(UUID userId, CreateAccountRequestDto request) {
        String name = request.accountName().trim();
        String type = request.accountType().trim();
        if (!ACCOUNT_TYPES.contains(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported account type");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        return accountMapper.toResponse(accountRepository.save(
                new Account(user, name, type, java.math.BigDecimal.ZERO)));
    }
}
