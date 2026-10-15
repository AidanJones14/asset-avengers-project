package com.avengers.internal.exports;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import java.time.LocalDate;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class PdfExportControllerTest {
    @Test void downloadsHavePdfTypeSafeFilenameAndNoStore() {
        var service=mock(PdfExportService.class);
        var day=LocalDate.of(2026,10,1);
        byte[] data=new PdfDocument().render("Report",java.util.List.of("Total USD 100"));
        when(service.report(day)).thenReturn(data);
        var response=new PdfExportController(service).report(day);
        assertEquals(MediaType.APPLICATION_PDF,response.getHeaders().getContentType());
        assertTrue(response.getHeaders().getFirst("Content-Disposition").contains("report-2026-10-01.pdf"));
        assertEquals("no-store",response.getHeaders().getCacheControl());
        assertArrayEquals(data,response.getBody());
        verify(service).report(day);
    }
}
