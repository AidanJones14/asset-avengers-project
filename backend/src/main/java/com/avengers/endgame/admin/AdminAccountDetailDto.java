package com.avengers.endgame.admin;

import java.util.List;

public record AdminAccountDetailDto(
        AdminClientAccountDto account,
        List<AdminPositionDto> positions,
        List<AdminCashChangeDto> recentActivity
) {
}
