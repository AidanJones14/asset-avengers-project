package com.avengers.endgame.admin;

import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.domain.OrderType;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.avengers.endgame.admin.AdminSql.instant;
import static com.avengers.endgame.admin.AdminSql.uuid;
import static com.avengers.endgame.config.AdminAnalyticsDataSourceConfig.ADMIN_ANALYTICS;

// Read-only client and trade lookups over the admin.* views in admin_analytics.
@Repository
public class AdminLookupRepository {

    private static final RowMapper<AdminClientAccountDto> CLIENT_ACCOUNT = (rs, row) -> new AdminClientAccountDto(
            uuid(rs, "client_id"),
            uuid(rs, "account_id"),
            rs.getString("email"),
            rs.getBigDecimal("cash_balance"),
            rs.getBoolean("is_suspended"),
            rs.getLong("open_positions"),
            instant(rs, "as_of"));

    private static final RowMapper<AdminPositionDto> POSITION = (rs, row) -> new AdminPositionDto(
            rs.getString("symbol"),
            rs.getString("instrument_name"),
            rs.getBigDecimal("quantity"),
            rs.getObject("is_tradable", Boolean.class),
            instant(rs, "as_of"));

    private static final RowMapper<AdminCashChangeDto> CASH_CHANGE = (rs, row) -> new AdminCashChangeDto(
            instant(rs, "occurred_at"),
            rs.getString("change_type"),
            rs.getString("symbol"),
            uuid(rs, "order_id"),
            rs.getBigDecimal("cash_delta"),
            rs.getBigDecimal("cash_balance_after"),
            rs.getBigDecimal("holding_delta"),
            rs.getBigDecimal("holding_quantity_after"));

    private static final RowMapper<AdminOrderDto> ORDER = (rs, row) -> new AdminOrderDto(
            uuid(rs, "order_id"),
            uuid(rs, "client_id"),
            uuid(rs, "account_id"),
            rs.getString("symbol"),
            OrderSide.valueOf(rs.getString("order_side")),
            OrderType.valueOf(rs.getString("order_type")),
            rs.getBigDecimal("quantity"),
            rs.getBigDecimal("limit_price"),
            rs.getBigDecimal("stop_price"),
            OrderStatus.valueOf(rs.getString("status")),
            instant(rs, "placed_at"),
            instant(rs, "accepted_at"),
            instant(rs, "submitted_at"),
            instant(rs, "filled_at"),
            rs.getBigDecimal("fill_price"),
            instant(rs, "rejected_at"),
            rs.getString("rejection_reason"),
            instant(rs, "cancelled_at"),
            rs.getBigDecimal("cash_change"),
            rs.getBigDecimal("holding_change"));

    private static final RowMapper<AdminOrderEventDto> ORDER_EVENT = (rs, row) -> new AdminOrderEventDto(
            rs.getString("step"),
            instant(rs, "occurred_at"),
            rs.getBigDecimal("quantity"),
            rs.getBigDecimal("price"),
            rs.getString("rejection_reason"),
            rs.getBigDecimal("cash_delta"),
            rs.getBigDecimal("cash_balance_after"),
            rs.getBigDecimal("holding_delta"),
            rs.getBigDecimal("holding_quantity_after"));

    private final NamedParameterJdbcTemplate jdbc;

    public AdminLookupRepository(@Qualifier(ADMIN_ANALYTICS) NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public AdminPage<AdminClientAccountDto> searchClientAccounts(String emailFragment, AdminPageRequest page) {
        MapSqlParameterSource params = new MapSqlParameterSource("pattern", "%" + escapeLike(emailFragment) + "%");
        return AdminSql.page(jdbc, "FROM admin.client_accounts WHERE email ILIKE :pattern ESCAPE '\\'",
                "email, account_id", params, page, CLIENT_ACCOUNT);
    }

    public Optional<AdminClientAccountDto> findClientAccount(UUID accountId) {
        return jdbc.query("SELECT * FROM admin.client_accounts WHERE account_id = :accountId",
                accountParam(accountId), CLIENT_ACCOUNT).stream().findFirst();
    }

    public List<AdminPositionDto> findPositions(UUID accountId) {
        return jdbc.query("SELECT * FROM admin.client_positions WHERE account_id = :accountId ORDER BY symbol",
                accountParam(accountId), POSITION);
    }

    public List<AdminCashChangeDto> findRecentCashChanges(UUID accountId, int limit) {
        return jdbc.query("""
                        SELECT * FROM admin.client_cash_history
                        WHERE account_id = :accountId
                        ORDER BY occurred_at DESC
                        LIMIT :limit
                        """,
                accountParam(accountId).addValue("limit", limit), CASH_CHANGE);
    }

    // Either filter may be null, but not both (the service checks).
    public AdminPage<AdminOrderDto> searchOrders(UUID clientId, String symbol, AdminPageRequest page) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        List<String> conditions = new ArrayList<>();
        if (clientId != null) {
            conditions.add("client_id = :clientId");
            params.addValue("clientId", clientId, Types.OTHER);
        }
        if (symbol != null) {
            conditions.add("symbol = :symbol");
            params.addValue("symbol", symbol);
        }
        return AdminSql.page(jdbc, "FROM admin.trades" + AdminSql.where(conditions),
                "placed_at DESC, order_id", params, page, ORDER);
    }

    public Optional<AdminOrderDto> findOrder(UUID orderId) {
        return jdbc.query("SELECT * FROM admin.trades WHERE order_id = :orderId",
                orderParam(orderId), ORDER).stream().findFirst();
    }

    // Oldest first; steps recorded at the same instant keep their lifecycle order.
    public List<AdminOrderEventDto> findOrderTimeline(UUID orderId) {
        return jdbc.query("""
                        SELECT * FROM admin.trade_timeline
                        WHERE order_id = :orderId
                        ORDER BY occurred_at,
                                 CASE step WHEN 'accepted' THEN 1 WHEN 'submitted' THEN 2
                                           WHEN 'filled' THEN 3 WHEN 'cash_and_holding_change' THEN 4
                                           ELSE 5 END
                        """,
                orderParam(orderId), ORDER_EVENT);
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static MapSqlParameterSource accountParam(UUID accountId) {
        return new MapSqlParameterSource().addValue("accountId", accountId, Types.OTHER);
    }

    private static MapSqlParameterSource orderParam(UUID orderId) {
        return new MapSqlParameterSource().addValue("orderId", orderId, Types.OTHER);
    }
}
