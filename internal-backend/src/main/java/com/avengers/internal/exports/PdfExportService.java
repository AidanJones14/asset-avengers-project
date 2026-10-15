package com.avengers.internal.exports;

import com.avengers.internal.admin.AdminEvidenceService;
import com.avengers.internal.common.Rows;
import com.avengers.internal.security.AdminActorResolver;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;

@Service
public class PdfExportService {
    private final NamedParameterJdbcTemplate jdbc;
    private final AdminEvidenceService evidence;
    private final AdminActorResolver actors;
    private final ObjectMapper json;
    private final PdfDocument pdf;
    public PdfExportService(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc,
            AdminEvidenceService evidence, AdminActorResolver actors, ObjectMapper json, PdfDocument pdf) {
        this.jdbc=jdbc;this.evidence=evidence;this.actors=actors;this.json=json;this.pdf=pdf;
    }
    private byte[] document(String title, Object data) {
        String text=json.writerWithDefaultPrettyPrinter().writeValueAsString(data);
        return pdf.render(title,Arrays.asList(text.split("\\R")));
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public byte[] report(LocalDate day) {
        var params=Map.of("day",day);
        var batches=jdbc.query("""
            SELECT b.batch_id,b.report_date,b.period_start,b.cutoff_at,b.completed_at,b.source_heartbeat_at
            FROM integration.report_batches b JOIN integration.published_reports p USING(batch_id)
            WHERE p.report_date=:day
            """,params,Rows::read);
        if(batches.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"No published report exists for this date");
        var result=new LinkedHashMap<String,Object>();
        result.put("report",batches.getFirst());result.put("currency","USD");
        result.put("generatedAt",Instant.now());
        result.put("businessOverview",jdbc.query("SELECT * FROM analytics.business_overview WHERE report_date=:day",params,Rows::read));
        var instruments=jdbc.query("SELECT * FROM analytics.instrument_activity WHERE report_date=:day ORDER BY symbol,instrument_id,order_side LIMIT 1001",params,Rows::read);
        if(instruments.size()>1000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"Report exceeds the 1000 instrument-group PDF limit");
        result.put("instrumentActivity",instruments);
        return document("Published daily report - "+day,result);
    }
    public byte[] order(UUID id) { return document("Order audit - "+id,evidence.export(id)); }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public byte[] auditLog(LocalDate from,LocalDate to) {
        actors.resolve();
        if(to.isBefore(from) || java.time.temporal.ChronoUnit.DAYS.between(from,to)>31)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose an inclusive date range of at most 32 days");
        var params=Map.of("from",from.atStartOfDay(ZoneOffset.UTC).toOffsetDateTime(),
                "to",to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toOffsetDateTime());
        var rows=jdbc.query("""
                SELECT audit_id,actor_id,actor_email,action,target_account_id,target_instrument_id,
                       target_order_id,reason,request_id,metadata::text AS metadata,occurred_at
                FROM admin_audit_log WHERE occurred_at>=:from AND occurred_at<:to
                ORDER BY occurred_at,audit_id LIMIT 1001
                """,params,(rs,index) -> {
                    var row=Rows.read(rs,index);
                    row.put("metadata",json.readTree(rs.getString("metadata")));
                    return row;
                });
        if(rows.size()>1000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"More than 1000 audit entries; choose a smaller date range");
        return document("Staff audit log - "+from+" through "+to,
                Map.of("dateTimezone","UTC","from",from,"through",to,"generatedAt",Instant.now(),"entries",rows));
    }
}
