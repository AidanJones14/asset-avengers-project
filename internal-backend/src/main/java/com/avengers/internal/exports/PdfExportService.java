package com.avengers.internal.exports;

import com.avengers.internal.admin.AdminEvidenceService;
import com.avengers.internal.common.Rows;
import com.avengers.internal.admin.AdminActor;
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
    private final ObjectMapper json;
    private final PdfDocument pdf;
    public PdfExportService(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc,
            AdminEvidenceService evidence, ObjectMapper json, PdfDocument pdf) {
        this.jdbc=jdbc;this.evidence=evidence;this.json=json;this.pdf=pdf;
    }
    /** Present saved facts as labelled financial sections, never as serialized API JSON. */
    private byte[] document(String title, Object data) {
        var lines=new ArrayList<String>();
        lines.add("CONFIDENTIAL | INTERNAL USE | SIMULATED TRADING");
        lines.add("Currency: USD | Generated: "+Instant.now());
        lines.add("");
        describe(lines, json.convertValue(data,Object.class), "");
        lines.add("");
        lines.add("REPORT NOTES");
        lines.add("Published reports reflect the recorded batch cutoff, not live market values.");
        lines.add("Traded notional is gross executed cash volume, not profit or portfolio value.");
        lines.add("Synthetic demonstration records are not actual investments or client assets.");
        return pdf.render(title,lines);
    }

    private static String label(String key) {
        String text=key.replaceAll("([a-z0-9])([A-Z])", "$1 $2").replace('_',' ').toLowerCase(Locale.ROOT);
        return text.isEmpty()?text:Character.toUpperCase(text.charAt(0))+text.substring(1);
    }

    private static void describe(List<String> lines,Object value,String key) {
        if(value instanceof Map<?,?> fields) {
            if(!key.isEmpty()) { lines.add(""); lines.add(label(key).toUpperCase(Locale.ROOT)); }
            fields.forEach((name,item)->describe(lines,item,String.valueOf(name)));
        } else if(value instanceof List<?> records) {
            lines.add(""); lines.add(label(key).toUpperCase(Locale.ROOT)+" | "+records.size()+" records");
            if(records.isEmpty()) lines.add("No recorded activity for this section.");
            for(int index=0;index<records.size();index++) {
                lines.add("-- Record "+(index+1)+" --"); describe(lines,records.get(index),"");
            }
        } else {
            String shown=value==null?"Not recorded":String.valueOf(value);
            // Only monetary fields receive currency formatting; counts and share quantities do not.
            if(value instanceof Number number && key.matches("(?i).*(notional|amount|price|balance|cashDelta|reservedCash).*"))
                shown="USD "+(key.toLowerCase(Locale.ROOT).contains("price")
                    ? new java.math.BigDecimal(number.toString()).toPlainString()
                    : String.format(Locale.US,"%,.2f",new java.math.BigDecimal(number.toString())));
            lines.add(label(key)+": "+shown);
        }
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
        var lines=new ArrayList<String>();
        lines.add("CONFIDENTIAL | INTERNAL USE | SIMULATED TRADING");
        lines.add("Reporting currency: USD | Generated: "+Instant.now());
        describe(lines,batches.getFirst(),"Publication controls");
        lines.add(""); lines.add("EXECUTIVE SUMMARY");
        var overview=(List<?>)result.get("businessOverview");
        if(overview.isEmpty()) lines.add("No executed trades in this publication.");
        overview.forEach(row -> describe(lines,row,""));
        lines.add(""); lines.add("INSTRUMENT ACTIVITY | "+instruments.size()+" groups");
        // Fixed-width columns use the renderer's table font; amounts remain right aligned.
        lines.add("@table "+String.format("%-8s %-5s %6s %10s %18s %7s","Symbol","Side","Trades","Shares","Notional (USD)","Clients"));
        for(var row:instruments) {
            lines.add("@table "+String.format(Locale.US,"%-8s %-5s %6s %10s %18s %7s",
                row.get("symbol"),row.get("orderSide"),row.get("tradeCount"),row.get("tradedQuantity"),
                String.format(Locale.US,"%,.2f",new java.math.BigDecimal(row.get("tradedNotional").toString())),row.get("activeClients")));
            lines.add("  Instrument: "+row.get("instrumentId")+" | Type: "+row.get("securityType"));
        }
        if(instruments.isEmpty()) lines.add("No executed instrument activity in this publication.");
        var accountRows=jdbc.query("""
                SELECT client_name,account_id,account_name,account_type,count(*) AS trade_count,
                       sum(cash_amount) AS traded_notional
                FROM analytics.named_published_trades WHERE report_date=:day
                GROUP BY client_name,account_id,account_name,account_type
                ORDER BY client_name,account_id LIMIT 1001
                """,params,Rows::read);
        if(accountRows.size()>1000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"Report exceeds the 1000 investment-account PDF limit");
        describe(lines,accountRows,"Investment account activity");
        lines.add(""); lines.add("METHODOLOGY & LIMITATIONS");
        lines.add("Gross notional sums executed trade cash amounts; it is not profit or asset value.");
        lines.add("Counts and amounts use the published batch and original cutoff shown above.");
        lines.add("This report contains simulated activity and is not a statement of real assets.");
        return pdf.render("Daily trading activity report - "+day,lines);
    }
    public byte[] order(UUID id, AdminActor actor) { return document("Order audit - "+id,evidence.export(id, actor)); }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public byte[] auditLog(LocalDate from,LocalDate to) {
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
