package com.avengers.endgame.bankaccount;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.transaction.Transaction;
import com.avengers.endgame.transaction.TransactionRepository;
import com.avengers.endgame.transaction.TransactionType;
import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRepository;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

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
        // Validate that account numbers match
        if (!request.accountNumber().equals(request.confirmAccountNumber())) {
            throw new IllegalArgumentException("Account numbers do not match");
        }

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found"));

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

    public void deleteBankAccount(UUID bankAccountId, UUID userId) {
        BankAccount account = bankAccountRepository.findById(bankAccountId)
            .orElseThrow(() -> new RuntimeException("Bank account not found"));

        if (!account.getUser().getUserId().equals(userId)) {
            throw new RuntimeException("Unauthorized");
        }

        bankAccountRepository.deleteById(bankAccountId);
    }

    // One consistent view even when the execution worker commits a fill during this request.
    @org.springframework.transaction.annotation.Transactional(readOnly = true,
            isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public TradingAccountSnapshot getTradingAccount(UUID userId) {
        Account account = accountRepository.findByUserUserId(userId).stream().findFirst()
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
        // Verify bank account exists and belongs to user
        UUID bankAccountId = UUID.fromString(request.bankAccountId());
        BankAccount bankAccount = bankAccountRepository.findById(bankAccountId)
            .orElseThrow(() -> new RuntimeException("Bank account not found"));

        if (!bankAccount.getUser().getUserId().equals(userId)) {
            throw new RuntimeException("Unauthorized");
        }

        // Get user's trading account
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found"));
        
        Account tradingAccount = accountRepository.findByUserUserId(userId)
            .stream()
            .findFirst()
            .orElseThrow(() -> new RuntimeException("Trading account not found"));

        tradingAccount = accountRepository.findByIdForUpdate(tradingAccount.getAccountId()).orElseThrow();

        // Create transaction
        Transaction transaction = new Transaction(tradingAccount, TransactionType.deposit, request.amount());
        transactionRepository.save(transaction);

        // Update account balance
        BigDecimal newBalance = tradingAccount.getCashBalance().add(request.amount());
        tradingAccount.setCashBalance(newBalance);
        accountRepository.save(tradingAccount);
    }

    @org.springframework.transaction.annotation.Transactional
    public void withdraw(UUID userId, DepositWithdrawalRequestDto request) {
        // Verify bank account exists and belongs to user
        UUID bankAccountId = UUID.fromString(request.bankAccountId());
        BankAccount bankAccount = bankAccountRepository.findById(bankAccountId)
            .orElseThrow(() -> new RuntimeException("Bank account not found"));

        if (!bankAccount.getUser().getUserId().equals(userId)) {
            throw new RuntimeException("Unauthorized");
        }

        // Get user's trading account
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new RuntimeException("User not found"));
        
        Account tradingAccount = accountRepository.findByUserUserId(userId)
            .stream()
            .findFirst()
            .orElseThrow(() -> new RuntimeException("Trading account not found"));

        tradingAccount = accountRepository.findByIdForUpdate(tradingAccount.getAccountId()).orElseThrow();
        BigDecimal reserved = orders.findByAccountIdAndStatusIn(tradingAccount.getAccountId(), java.util.List.of(
                com.avengers.endgame.order.domain.OrderStatus.accepted, com.avengers.endgame.order.domain.OrderStatus.submitted))
                .stream().filter(order -> order.getOrderSide() == com.avengers.endgame.order.domain.OrderSide.buy)
                .map(order -> order.getReservedCash() == null ? BigDecimal.ZERO : order.getReservedCash())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        // Withdrawals cannot spend cash reserved by accepted orders.
        if (tradingAccount.getCashBalance().subtract(reserved).compareTo(request.amount()) < 0) {
            throw new IllegalArgumentException("Insufficient funds");
        }

        // Create transaction
        Transaction transaction = new Transaction(tradingAccount, TransactionType.withdrawal, request.amount());
        transactionRepository.save(transaction);

        // Update account balance
        BigDecimal newBalance = tradingAccount.getCashBalance().subtract(request.amount());
        tradingAccount.setCashBalance(newBalance);
        accountRepository.save(tradingAccount);
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
