package com.avengers.endgame.admin;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.UUID;

// Client and trade lookups for admins. Opening a single account or order is
// recorded in the audit log; searches are not.
@Service
public class AdminLookupService {

    static final int MIN_EMAIL_QUERY_LENGTH = 3;
    static final int RECENT_ACTIVITY_LIMIT = 50;

    private final AdminLookupRepository lookupRepository;
    private final AdminAuditRepository auditRepository;

    public AdminLookupService(AdminLookupRepository lookupRepository, AdminAuditRepository auditRepository) {
        this.lookupRepository = lookupRepository;
        this.auditRepository = auditRepository;
    }

    public AdminPage<AdminClientAccountDto> searchClients(String query, AdminPageRequest page) {
        String trimmed = query == null ? "" : query.trim();
        if (trimmed.length() < MIN_EMAIL_QUERY_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "q must be at least " + MIN_EMAIL_QUERY_LENGTH + " characters");
        }
        return lookupRepository.searchClientAccounts(trimmed, page);
    }

    public AdminAccountDetailDto getAccount(UUID accountId, AdminActor actor) {
        AdminClientAccountDto account = lookupRepository.findClientAccount(accountId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        AdminAccountDetailDto detail = new AdminAccountDetailDto(account,
                lookupRepository.findPositions(accountId),
                lookupRepository.findRecentCashChanges(accountId, RECENT_ACTIVITY_LIMIT));
        auditRepository.record(AdminAuditEntry.forAccount(actor, AdminAction.view_client_account, accountId, null));
        return detail;
    }

    public AdminPage<AdminOrderDto> searchOrders(UUID clientId, String symbol, AdminPageRequest page) {
        String normalizedSymbol = symbol == null || symbol.isBlank() ? null : symbol.trim().toUpperCase(Locale.ROOT);
        if (clientId == null && normalizedSymbol == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give clientId or symbol");
        }
        return lookupRepository.searchOrders(clientId, normalizedSymbol, page);
    }

    public AdminOrderLifecycleDto getOrderLifecycle(UUID orderId, AdminActor actor) {
        AdminOrderDto order = lookupRepository.findOrder(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
        AdminOrderLifecycleDto lifecycle = new AdminOrderLifecycleDto(order, lookupRepository.findOrderTimeline(orderId));
        auditRepository.record(AdminAuditEntry.forOrder(actor, AdminAction.view_trade, orderId, order.accountId()));
        return lifecycle;
    }

    public AdminPage<AdminAuditLogEntryDto> searchAuditLog(AuditLogFilter filter, AdminPageRequest page) {
        if (filter.from() != null && filter.to() != null && !filter.from().isBefore(filter.to())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must be before to");
        }
        return auditRepository.search(filter, page);
    }
}
