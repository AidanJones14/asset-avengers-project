package com.avengers.endgame.account;

import com.avengers.endgame.security.CurrentUserId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.util.*;

@RestController
@RequestMapping("/api/v1/bank-accounts/history")
public class AccountHistoryController {
    private final AccountService accounts;
    private final JdbcTemplate jdbc;
    public AccountHistoryController(AccountService accounts,JdbcTemplate jdbc) { this.accounts=accounts;this.jdbc=jdbc; }
    @GetMapping
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public AccountHistory.Result history(@CurrentUserId UUID userId) {
        // Use the same owned-account selection as the trading-account snapshot.
        var account=accounts.getForUser(userId).stream().findFirst()
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND, "Trading account not found"));
        var holdings=new HashMap<UUID,BigDecimal>();
        jdbc.query("SELECT instrument_id,quantity FROM holdings WHERE account_id=?", rs -> { holdings.put(rs.getObject(1,UUID.class),rs.getBigDecimal(2)); },account.accountId());
        var movements=jdbc.query("SELECT occurred_at,instrument_id,cash_delta,holding_delta,movement_type FROM cash_ledger WHERE account_id=? ORDER BY occurred_at,movement_id",
            (rs,index)->new AccountHistory.Movement(rs.getTimestamp(1).toInstant(),rs.getObject(2,UUID.class),rs.getBigDecimal(3),rs.getBigDecimal(4),rs.getString(5)),account.accountId());
        return AccountHistory.calculate(account.cashBalance(),holdings,movements);
    }
}
