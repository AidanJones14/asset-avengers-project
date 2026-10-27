package com.avengers.internal.exports;

import com.avengers.internal.admin.AdminActor;
import com.avengers.internal.security.CurrentActor;
import org.springframework.http.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;

/** Route prefixes keep the staff policy: /admin is ADMIN/SUPER_ADMIN, /analytics adds ANALYST (StaffSecurityConfig). */
@RestController
public class PdfExportController {
    private final PdfExportService exports;
    public PdfExportController(PdfExportService exports) { this.exports=exports; }
    private ResponseEntity<byte[]> download(String name,byte[] content) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(name).build().toString())
                .cacheControl(CacheControl.noStore()).body(content);
    }
    @GetMapping("/api/v1/analytics/reports/{day}/pdf")
    public ResponseEntity<byte[]> report(@PathVariable @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate day) {
        return download("report-"+day+".pdf",exports.report(day));
    }
    @GetMapping("/api/v1/admin/orders/{id}/pdf")
    public ResponseEntity<byte[]> order(@PathVariable UUID id, @CurrentActor AdminActor actor) {
        return download("order-"+id+"-audit.pdf",exports.order(id, actor));
    }
    @GetMapping("/api/v1/admin/audit-log/pdf")
    public ResponseEntity<byte[]> auditLog(@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to) {
        return download("audit-log-"+from+"-"+to+".pdf",exports.auditLog(from,to));
    }
}
