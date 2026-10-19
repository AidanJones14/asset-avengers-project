package com.avengers.internal.exports;

import com.avengers.internal.admin.AdminEvidenceService;
import com.avengers.internal.security.AdminActorResolver;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class PdfExportServiceTest {
    @Test void reportUsesPublishedBatchAndOriginalCutoff() throws Exception {
        var jdbc=mock(NamedParameterJdbcTemplate.class);
        when(jdbc.query(anyString(),anyMap(),any(RowMapper.class))).thenAnswer(call -> {
            String sql=call.getArgument(0);
            if(sql.contains("integration.report_batches"))return List.of(Map.of("batchId","saved-batch",
                "cutoffAt",Instant.parse("2026-10-01T23:00:00Z")));
            if(sql.contains("business_overview"))return List.of(Map.of("tradeCount",2,"tradedNotional",200));
            if(sql.contains("instrument_activity")) return List.of(Map.of("symbol","AAPL","orderSide","buy",
                "tradeCount",2,"tradedQuantity",2,"tradedNotional",200,"activeClients",1,
                "instrumentId","saved-instrument","securityType","equity"));
            return List.of();
        });
        var service=new PdfExportService(jdbc,mock(AdminEvidenceService.class),mock(AdminActorResolver.class),new JsonMapper(),new PdfDocument());
        try(var pdf=Loader.loadPDF(service.report(LocalDate.of(2026,10,1)))) {
            String text=new PDFTextStripper().getText(pdf);
            assertTrue(text.contains("saved-batch"));assertTrue(text.contains("2026-10-01T23:00:00Z"));
            assertTrue(text.contains("USD"));assertTrue(text.contains("Traded notional: USD 200.00"));
            assertFalse(text.contains("\"tradedNotional\""));
            assertTrue(text.contains("CONFIDENTIAL"));
            assertTrue(text.contains("Notional (USD)"));
            assertTrue(text.contains("saved-instrument"));
            assertFalse(text.contains("@table"));
        }
    }
    @Test void doesNotInventAnUnpublishedReportAndRejectsWideAuditRanges() {
        var jdbc=mock(NamedParameterJdbcTemplate.class);
        var service=new PdfExportService(jdbc,mock(AdminEvidenceService.class),mock(AdminActorResolver.class),new JsonMapper(),new PdfDocument());
        assertEquals(404,assertThrows(ResponseStatusException.class,()->service.report(LocalDate.of(2026,10,1))).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->service.auditLog(LocalDate.of(2026,1,1),LocalDate.of(2026,3,1))).getStatusCode().value());
    }
}
