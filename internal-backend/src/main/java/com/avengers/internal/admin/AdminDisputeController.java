package com.avengers.internal.admin;

import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/disputes")
public class AdminDisputeController {
    private final TradingAdminClient trading;
    public AdminDisputeController(TradingAdminClient trading) { this.trading = trading; }
    @GetMapping
    public List<Map<String,Object>> list(@RequestParam(defaultValue="0") int page) {
        if (page < 0 || page > 1000000)
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Invalid page");
        return trading.disputes(page);
    }
}
