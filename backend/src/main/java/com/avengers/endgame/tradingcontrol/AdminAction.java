package com.avengers.endgame.tradingcontrol;

// Matches the admin_audit_log.action check constraint.
public enum AdminAction {
    view_client_account,
    view_trade,
    suspend_client,
    unsuspend_client,
    suspend_instrument,
    unsuspend_instrument
}
