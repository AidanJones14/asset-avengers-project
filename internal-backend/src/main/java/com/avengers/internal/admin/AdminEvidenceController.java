package com.avengers.internal.admin;

import com.avengers.internal.common.Rows;
import com.avengers.internal.security.AdminActorResolver;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
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
    private final AdminLookupService lookup;
    private final AdminActorResolver actors;
    private final ObjectMapper json;
    public AdminEvidenceController(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc,
        AdminLookupService lookup,AdminActorResolver actors,ObjectMapper json) {
        this.jdbc=jdbc;this.lookup=lookup;this.actors=actors;this.json=json;
    }
    @GetMapping("/orders/{id}/timeline")
    public Map<String,Object> timeline(@PathVariable UUID id) {
        var lifecycle=lookup.getOrderLifecycle(id,actors.resolve());
        var events=jdbc.query("""
            SELECT event_id,event_type,event_at,quantity,price,rejection_reason,terminal,provenance
            FROM trade_lifecycle_events WHERE order_id=:id ORDER BY event_at,event_id
            """,Map.of("id",id),Rows::read);
        return Map.of("order",lifecycle.order(),"events",events);
    }
    @GetMapping("/orders/{id}/pricing")
    public List<Map<String,Object>> pricing(@PathVariable UUID id) {
        lookup.getOrderLifecycle(id,actors.resolve());
        return jdbc.query("SELECT evidence_id,order_id,phase,decision,reason,observed_at,quote::text AS quote FROM audit.pricing_evidence WHERE order_id=:id ORDER BY observed_at,evidence_id",
            Map.of("id",id),(rs,n) -> {
                var row=Rows.read(rs,n);
                String quote=rs.getString("quote");
                row.put("quote",quote==null?null:json.readTree(quote));
                return row;
            });
    }
    // A self-contained download uses recorded evidence, never a new market quote.
    // As with opening a detail page, the lookup records the authenticated viewer.
    @GetMapping("/orders/{id}/export")
    public org.springframework.http.ResponseEntity<Map<String,Object>> export(@PathVariable UUID id) {
        var evidence=new LinkedHashMap<String,Object>(timeline(id));
        evidence.put("pricing",pricing(id));
        evidence.put("cashMovements",jdbc.query(
            "SELECT change_id,change_type,cash_delta,holding_delta,occurred_at FROM cash_holding_changes WHERE order_id=:id ORDER BY occurred_at",
            Map.of("id",id),Rows::read));
        evidence.put("exportedAt",Instant.now());
        return org.springframework.http.ResponseEntity.ok()
            .header("Content-Disposition","attachment; filename=order-"+id+"-audit.json")
            .body(evidence);
    }

    @GetMapping("/trades")
    public AdminPage<Map<String,Object>> trades(@RequestParam(required=false) UUID clientId,
        @RequestParam(required=false) UUID orderId,@RequestParam(required=false) UUID fillId,
        @RequestParam(required=false) UUID instrumentId,@RequestParam(required=false) String symbol,
        @RequestParam(required=false) OrderStatus status,@RequestParam(required=false) Instant from,
        @RequestParam(required=false) Instant to,@RequestParam(defaultValue="0") int page,
        @RequestParam(defaultValue="20") int size) {
        actors.resolve();
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
