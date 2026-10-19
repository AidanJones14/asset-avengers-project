package com.avengers.internal.admin;

import java.util.List;

public record AdminOrderLifecycleDto(
        AdminOrderDto order,
        List<AdminOrderEventDto> events
) {
}
