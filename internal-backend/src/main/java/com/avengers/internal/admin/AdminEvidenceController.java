package com.avengers.internal.admin;

import com.avengers.internal.common.Rows;
import com.avengers.internal.security.CurrentActor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

// Audit reads use the copied facts. Search times refer to order placement;
// the detailed timeline distinguishes a failed attempt from a terminal rejection.
@RestController
@RequestMapping("/api/v1/admin")
public class AdminEvidenceController {
    private final NamedParameterJdbcTemplate jdbc;
    private final AdminEvidenceService evidence;
    public AdminEvidenceController(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc,
        AdminEvidenceService evidence) {
        this.jdbc=jdbc;this.evidence=evidence;
    }
    // Viewing an order's evidence is audited as the calling admin (@CurrentActor, from the token).
    @GetMapping("/orders/{id}/timeline")
    public Map<String,Object> timeline(@PathVariable UUID id, @CurrentActor AdminActor actor) { return evidence.timeline(id, actor); }
    @GetMapping("/orders/{id}/pricing")
    public List<Map<String,Object>> pricing(@PathVariable UUID id, @CurrentActor AdminActor actor) { return evidence.pricing(id, actor); }
    @GetMapping("/orders/{id}/export")
    public org.springframework.http.ResponseEntity<Map<String,Object>> export(@PathVariable UUID id, @CurrentActor AdminActor actor) {
        return org.springframework.http.ResponseEntity.ok()
            .header("Content-Disposition","attachment; filename=order-"+id+"-audit.json")
            .header("Cache-Control","no-store")
            .body(evidence.export(id, actor));
    }

    @GetMapping("/trades")
    public AdminPage<Map<String,Object>> trades(@RequestParam(required=false) UUID clientId,
        @RequestParam(required=false) UUID orderId,@RequestParam(required=false) UUID fillId,
        @RequestParam(required=false) UUID instrumentId,@RequestParam(required=false) String symbol,
        @RequestParam(required=false) OrderStatus status,@RequestParam(required=false) Instant from,
        @RequestParam(required=false) Instant to,@RequestParam(defaultValue="0") int page,
        @RequestParam(defaultValue="20") int size) {
        var paging=new AdminPageRequest(page,size);
        if(from!=null&&to!=null&&!from.isBefore(to)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"from must be before to");
        var clauses=new ArrayList<String>();
        var params=new MapSqlParameterSource();
        if(clientId!=null){clauses.add("t.client_id=:client");params.addValue("client",clientId);}
        if(orderId!=null){clauses.add("t.order_id=:order");params.addValue("order",orderId);}
        if(fillId!=null){clauses.add("c.change_id=:fill");params.addValue("fill",fillId);}
        if(instrumentId!=null){clauses.add("r.instrument_id=:instrument");params.addValue("instrument",instrumentId);}
        if(symbol!=null&&!symbol.isBlank()){clauses.add("t.symbol=:symbol");params.addValue("symbol",symbol.trim().toUpperCase(Locale.ROOT));}
        if(status!=null){clauses.add("t.status=:status");params.addValue("status",status.name());}
        if(from!=null){clauses.add("t.placed_at>=:from");params.addValue("from",OffsetDateTime.ofInstant(from,ZoneOffset.UTC));}
        if(to!=null){clauses.add("t.placed_at<:to");params.addValue("to",OffsetDateTime.ofInstant(to,ZoneOffset.UTC));}
        String query=" FROM admin.trades t JOIN trade_records r USING(order_id) LEFT JOIN cash_holding_changes c ON c.order_id=t.order_id AND c.change_type='trade'";
        if(!clauses.isEmpty()) query+=" WHERE "+String.join(" AND ",clauses);
        long total=jdbc.queryForObject("SELECT count(*)"+query,params,Long.class);
        params.addValue("limit",size).addValue("offset",(long)page*size);
        var items=jdbc.query("SELECT t.*,c.change_id AS fill_id"+query+" ORDER BY t.placed_at DESC,t.order_id LIMIT :limit OFFSET :offset",params,Rows::read);
        return AdminPage.of(items,paging,total);
    }
}
