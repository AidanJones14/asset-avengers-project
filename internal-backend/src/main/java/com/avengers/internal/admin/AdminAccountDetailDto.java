package com.avengers.internal.admin;

import java.util.List;

public record AdminAccountDetailDto(
        AdminClientAccountDto account,
        List<AdminPositionDto> positions,
        List<AdminCashChangeDto> recentActivity
) {
}
