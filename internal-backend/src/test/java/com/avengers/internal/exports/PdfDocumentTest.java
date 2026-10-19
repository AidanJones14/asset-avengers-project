package com.avengers.internal.exports;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PdfDocumentTest {
    @Test void producesReadablePaginatedPdfWithoutLosingEvidence() throws Exception {
        var lines=new ArrayList<String>();
        for(int i=0;i<120;i++) lines.add("Evidence row "+i+" paid USD 105.00");
        lines.add("Actor: Ren\u00e9e");
        byte[] bytes=new PdfDocument().render("Order audit",lines);
        try(var pdf=Loader.loadPDF(bytes)) {
            assertTrue(pdf.getNumberOfPages()>=3);
            String text=new PDFTextStripper().getText(pdf);
            assertTrue(text.contains("Evidence row 0 paid USD 105.00"));
            assertTrue(text.contains("Evidence row 119 paid USD 105.00"));
            assertTrue(text.contains("Ren\\u00E9e"));
            assertTrue(text.contains("Order audit"));
        }
    }
}
