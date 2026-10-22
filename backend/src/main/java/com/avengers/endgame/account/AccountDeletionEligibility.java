package com.avengers.endgame.account;

public record AccountDeletionEligibility(
        boolean cashEmpty,
        boolean activeOrdersEmpty,
        boolean holdingsEmpty
) {
    public boolean allowed() {
        return cashEmpty && activeOrdersEmpty && holdingsEmpty;
    }
}
