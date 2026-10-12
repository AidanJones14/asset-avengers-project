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

    public BankAccountService(
        BankAccountRepository bankAccountRepository,
        UserRepository userRepository,
        AccountRepository accountRepository,
        TransactionRepository transactionRepository
    ) {
        this.bankAccountRepository = bankAccountRepository;
        this.userRepository = userRepository;
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
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

        // Create transaction
        Transaction transaction = new Transaction(tradingAccount, TransactionType.deposit, request.amount());
        transactionRepository.save(transaction);

        // Update account balance
        BigDecimal newBalance = tradingAccount.getCashBalance().add(request.amount());
        tradingAccount.setCashBalance(newBalance);
        accountRepository.save(tradingAccount);
    }

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

        // Check sufficient funds
        if (tradingAccount.getCashBalance().compareTo(request.amount()) < 0) {
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
