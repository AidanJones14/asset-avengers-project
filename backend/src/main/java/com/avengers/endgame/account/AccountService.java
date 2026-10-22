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
import com.avengers.endgame.holding.HoldingRepository;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.repository.OrderRepository;

// Owner: account domain (service layer). Reads and creates a client's trading accounts.
// Used by: AccountController.
@Service
public class AccountService {

    private final AccountRepository accountRepository;
    private final AccountMapper accountMapper;
    private final UserRepository userRepository;
    private final OrderRepository orderRepository;
    private final HoldingRepository holdingRepository;
    private static final Set<String> ACCOUNT_TYPES = Set.of(
            "Individual Brokerage", "Roth IRA", "Traditional IRA",
            "Health Savings Account (HSA)", "401(k)", "529 College Savings Plan");

    // Constructor injection: Spring passes in the repository and mapper beans.
    public AccountService(AccountRepository accountRepository, AccountMapper accountMapper, UserRepository userRepository,
                          OrderRepository orderRepository, HoldingRepository holdingRepository) {
        this.accountRepository = accountRepository;
        this.accountMapper = accountMapper;
        this.userRepository = userRepository;
        this.orderRepository = orderRepository;
        this.holdingRepository = holdingRepository;
    }

    // Returns the caller's trading accounts. userId always comes from the token (@CurrentUserId),
    // never from the request, so a client can only ever see their own account.
    public List<AccountResponseDto> getForUser(UUID userId) {
        return accountRepository.findByUserUserIdAndDeactivatedFalse(userId).stream()
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

    @Transactional
    public void deactivateForUser(UUID userId, UUID accountId) {
        Account account = findOwnedActiveAccount(userId, accountId);
        AccountDeletionEligibility eligibility = getEligibility(account);
        if (!eligibility.cashEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Account must have a zero cash balance");
        }
        if (!eligibility.activeOrdersEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Account has active orders");
        }
        if (!eligibility.holdingsEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Account has holdings");
        }
        account.setDeactivated(true);
        account.setUpdatedAt(java.time.Instant.now());
        accountRepository.save(account);
    }

    @Transactional
    public AccountDeletionEligibility getDeletionEligibility(UUID userId, UUID accountId) {
        return getEligibility(findOwnedActiveAccount(userId, accountId));
    }

    private AccountDeletionEligibility getEligibility(Account account) {
        boolean activeOrdersEmpty = orderRepository.findByAccountIdAndStatusIn(account.getAccountId(),
                List.of(OrderStatus.submitted, OrderStatus.accepted)).isEmpty();
        boolean holdingsEmpty = holdingRepository.findByAccountId(account.getAccountId()).stream()
                .noneMatch(holding -> holding.getQuantity().signum() > 0);
        return new AccountDeletionEligibility(account.getCashBalance().signum() == 0,
                activeOrdersEmpty, holdingsEmpty);
    }

    private Account findOwnedActiveAccount(UUID userId, UUID accountId) {
        return accountRepository.findByIdForUpdate(accountId)
                .filter(candidate -> candidate.getUser().getUserId().equals(userId)
                        && !candidate.isDeactivated())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
    }
}
