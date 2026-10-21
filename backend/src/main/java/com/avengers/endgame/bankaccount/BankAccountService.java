package com.avengers.endgame.bankaccount;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.transaction.Transaction;
import com.avengers.endgame.transaction.TransactionRepository;
import com.avengers.endgame.transaction.TransactionType;
import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

// Owner: bank-account domain (service layer). Simulated funding: linked bank accounts and
//   deposits/withdrawals between them and the trading account. Also the trading-account snapshot
//   that Angular's PortfolioStore reads.
// Used by: BankAccountController (/api/v1/bank-accounts), which always passes the caller's userId
//   from the token (@CurrentUserId).
// Ownership: every method works only on the caller's own data. Bank accounts named by id (delete,
//   deposit, withdraw) go through findOwnedBankAccount, so another client's bank account is a 404,
//   exactly like one that doesn't exist.
// Errors: every refusal is a ResponseStatusException with a message meant for the user (400 bad input,
//   404 not found or not yours, 422 insufficient cash). OrderExceptionHandler turns it into the response.
@Service
public class BankAccountService {
    private final BankAccountRepository bankAccountRepository;
    private final UserRepository userRepository;
    private final AccountRepository accountRepository;
    private final TransactionRepository transactionRepository;
    private final com.avengers.endgame.watchlist.WatchlistService watchlists;
    private final com.avengers.endgame.order.repository.TradeFillRepository fills;
    private final com.avengers.endgame.holding.HoldingRepository holdings;
    private final com.avengers.endgame.instrument.InstrumentRepository instruments;
    private final com.avengers.endgame.order.repository.OrderRepository orders;
    private final com.avengers.endgame.order.mapper.OrderMapper orderMapper;

    public BankAccountService(
        BankAccountRepository bankAccountRepository,
        UserRepository userRepository,
        AccountRepository accountRepository,
        TransactionRepository transactionRepository,
        com.avengers.endgame.holding.HoldingRepository holdings,
        com.avengers.endgame.instrument.InstrumentRepository instruments,
        com.avengers.endgame.order.repository.OrderRepository orders,
        com.avengers.endgame.order.mapper.OrderMapper orderMapper,
        com.avengers.endgame.order.repository.TradeFillRepository fills,
        com.avengers.endgame.watchlist.WatchlistService watchlists
    ) {
        this.bankAccountRepository = bankAccountRepository;
        this.userRepository = userRepository;
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
        this.fills = fills;
        this.watchlists = watchlists;
        this.holdings = holdings;
        this.instruments = instruments;
        this.orders = orders;
        this.orderMapper = orderMapper;
    }

    public BankAccountResponseDto createBankAccount(UUID userId, CreateBankAccountRequestDto request) {
        // 1. The two account numbers must match: the caller's mistake, so 400 (code VALIDATION_ERROR).
        if (!request.accountNumber().equals(request.confirmAccountNumber())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Account numbers do not match");
        }

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        BankAccount bankAccount = new BankAccount(
            user,
            request.bankName(),
            request.routingNumber(),
            request.accountNumber()
        );

        BankAccount saved = bankAccountRepository.save(bankAccount);
        return toResponseDto(saved);
    }

    public List<BankAccountResponseDto> getUserBankAccounts(UUID userId) {
        List<BankAccount> accounts = bankAccountRepository.findByUserUserId(userId);
        return accounts.stream().map(this::toResponseDto).toList();
    }

    // Unlinks one of the caller's bank accounts.
    public void deleteBankAccount(UUID bankAccountId, UUID userId) {
        // 1. Owner-scoped lookup: 404 unless it exists AND is the caller's.
        BankAccount account = findOwnedBankAccount(bankAccountId, userId);
        // 2. Delete the row we just confirmed is theirs.
        bankAccountRepository.delete(account);
    }

    // One consistent view even when the execution worker commits a fill during this request.
    @org.springframework.transaction.annotation.Transactional(readOnly = true,
            isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public TradingAccountSnapshot getTradingAccount(UUID userId) {
        Account account = accountRepository.findByUserUserIdAndDeactivatedFalse(userId).stream().findFirst()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Trading account not found"));
        var accountOrders = orders.findByAccountIdOrderByOrderDateDesc(account.getAccountId());
        BigDecimal reserved = accountOrders.stream()
                .filter(order -> (order.getStatus() == com.avengers.endgame.order.domain.OrderStatus.accepted
                        || order.getStatus() == com.avengers.endgame.order.domain.OrderStatus.submitted)
                        && order.getOrderSide() == com.avengers.endgame.order.domain.OrderSide.buy)
                .map(order -> order.getReservedCash() == null ? BigDecimal.ZERO : order.getReservedCash())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        var accountFills = fills.findByAccountIdOrderByExecutedAtAsc(account.getAccountId());
        var held = holdings.findByAccountId(account.getAccountId());
        var returns = new java.util.HashMap<UUID, PositionReturns>();
        for (var holding : held) {
            var trades = accountFills.stream().filter(fill -> fill.getInstrumentId().equals(holding.getInstrumentId()))
                    .map(fill -> new PositionReturns.Trade(fill.getOrderSide(), fill.getQuantity(), fill.getCashAmount())).toList();
            returns.put(holding.getInstrumentId(), PositionReturns.calculate(holding.getQuantity(), trades));
        }
        var positions = held.stream().map(holding -> {
            var instrument = instruments.findById(holding.getInstrumentId()).orElseThrow();
            return new TradingAccountSnapshot.Position(holding.getInstrumentId(), instrument.getSymbol(),
                    instrument.getName(), holding.getQuantity(), returns.get(holding.getInstrumentId()).averageCost(),
                    accountFills.stream().filter(fill -> fill.getInstrumentId().equals(holding.getInstrumentId())
                            && fill.getOrderSide() == com.avengers.endgame.order.domain.OrderSide.buy)
                            .sorted(java.util.Comparator.comparing(com.avengers.endgame.order.domain.TradeFill::getExecutedAt).reversed())
                            .map(fill -> new TradingAccountSnapshot.Purchase(fill.getFillId(), fill.getExecutedAt(),
                                    fill.getQuantity(), fill.getPrice(), fill.getCashAmount())).toList());
        }).toList();
        return new TradingAccountSnapshot(account.getAccountId(), account.getCashBalance(),
                account.getCashBalance().subtract(reserved).max(BigDecimal.ZERO),
                returns.values().stream().map(PositionReturns::realized).reduce(BigDecimal.ZERO, BigDecimal::add), positions,
                accountOrders.stream().map(orderMapper::toResponse).toList(), watchlists.symbols(userId));
    }

    @org.springframework.transaction.annotation.Transactional
    public void deposit(UUID userId, DepositWithdrawalRequestDto request) {
        // 1. The bank account named in the body must be the caller's: 404 otherwise (owner-scoped lookup).
        //    The id is already a valid UUID: a malformed one was rejected with 400 while reading the body.
        findOwnedBankAccount(request.bankAccountId(), userId);

        // 2. The caller's trading account. Provisioning created it on their first request.
        Account tradingAccount = accountRepository.findByUserUserIdAndDeactivatedFalse(userId)
            .stream()
            .findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trading account not found"));

        // 3. Lock the account row so concurrent cash changes (and order fills) apply one at a time.
        tradingAccount = accountRepository.findByIdForUpdate(tradingAccount.getAccountId()).orElseThrow();

        // 4. Record the deposit and raise the balance in this one transaction, so neither can exist without
        //    the other. PostgreSQL triggers also append the cash_ledger and outbox rows (staff reporting
        //    receives them asynchronously).
        Transaction transaction = new Transaction(tradingAccount, TransactionType.deposit, request.amount());
        transactionRepository.save(transaction);

        BigDecimal newBalance = tradingAccount.getCashBalance().add(request.amount());
        tradingAccount.setCashBalance(newBalance);
        accountRepository.save(tradingAccount);
    }

    @org.springframework.transaction.annotation.Transactional
    public void withdraw(UUID userId, DepositWithdrawalRequestDto request) {
        // 1. The bank account named in the body must be the caller's: 404 otherwise (owner-scoped lookup).
        findOwnedBankAccount(request.bankAccountId(), userId);

        // 2. The caller's trading account. Provisioning created it on their first request.
        Account tradingAccount = accountRepository.findByUserUserIdAndDeactivatedFalse(userId)
            .stream()
            .findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trading account not found"));

        // 3. Lock the account row so concurrent cash changes (and order fills) apply one at a time.
        tradingAccount = accountRepository.findByIdForUpdate(tradingAccount.getAccountId()).orElseThrow();
        BigDecimal reserved = orders.findByAccountIdAndStatusIn(tradingAccount.getAccountId(), java.util.List.of(
                com.avengers.endgame.order.domain.OrderStatus.accepted, com.avengers.endgame.order.domain.OrderStatus.submitted))
                .stream().filter(order -> order.getOrderSide() == com.avengers.endgame.order.domain.OrderSide.buy)
                .map(order -> order.getReservedCash() == null ? BigDecimal.ZERO : order.getReservedCash())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        // 4. Withdrawals cannot spend cash reserved by accepted orders. Too little left: 422, nothing changes.
        if (tradingAccount.getCashBalance().subtract(reserved).compareTo(request.amount()) < 0) {
            throw insufficientFunds();
        }

        // 5. As for deposits: the record and the lower balance commit together, so a ledger entry can't
        //    survive without its cash change, or the other way round.
        Transaction transaction = new Transaction(tradingAccount, TransactionType.withdrawal, request.amount());
        transactionRepository.save(transaction);

        BigDecimal newBalance = tradingAccount.getCashBalance().subtract(request.amount());
        tradingAccount.setCashBalance(newBalance);
        accountRepository.save(tradingAccount);
    }

    // The bank account, only if it belongs to this user. "Doesn't exist" and "someone else's" give the
    // same 404, so a caller can't learn that another client's bank account exists.
    private BankAccount findOwnedBankAccount(UUID bankAccountId, UUID userId) {
        return bankAccountRepository.findByBankAccountIdAndUserUserId(bankAccountId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bank account not found"));
    }

    // The spec's answer to a withdrawal larger than the available cash: 422 with code INSUFFICIENT_CASH.
    // The code goes on the exception's own Problem Details body; OrderExceptionHandler keeps it.
    private static ResponseStatusException insufficientFunds() {
        ResponseStatusException exception = new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, "Insufficient funds");
        exception.getBody().setProperty("code", "INSUFFICIENT_CASH");
        return exception;
    }

    private BankAccountResponseDto toResponseDto(BankAccount bankAccount) {
        String maskedAccountNumber = maskAccountNumber(bankAccount.getAccountNumber());
        return new BankAccountResponseDto(
            bankAccount.getBankAccountId(),
            bankAccount.getBankName(),
            bankAccount.getRoutingNumber(),
            maskedAccountNumber,
            bankAccount.getCreatedAt()
        );
    }

    private String maskAccountNumber(String accountNumber) {
        if (accountNumber.length() <= 4) {
            return "****";
        }
        return "*".repeat(accountNumber.length() - 4) + accountNumber.substring(accountNumber.length() - 4);
    }
}
