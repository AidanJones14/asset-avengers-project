package com.avengers.endgame.admin;

import java.util.List;

public record AdminOrderLifecycleDto(
        AdminOrderDto order,
        List<AdminOrderEventDto> events
) {
}
