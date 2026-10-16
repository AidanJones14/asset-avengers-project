package com.avengers.internal.exports;

import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.*;
import org.springframework.stereotype.Component;
import java.io.*;
import java.util.*;

/** Generates actual PDF bytes with pagination; no browser printing or upstream credentials. */
@Component
public class PdfDocument {
    public byte[] render(String title, List<String> lines) {
        try (var document = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            document.getDocumentInformation().setTitle(title);
            var font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            var tableFont = new PDType1Font(Standard14Fonts.FontName.COURIER);
            var wrapped = new ArrayList<String>();
            wrapped.add(title); wrapped.add("");
            if(lines.stream().anyMatch(line -> line.codePoints().anyMatch(c -> c > 126)))
                wrapped.add("Unicode evidence outside the report font is preserved using escapes.");
            wrapped.add("");
            for (String line : lines) {
                StringBuilder safe = new StringBuilder();
                line.codePoints().forEach(c -> {
                    if (c >= 32 && c <= 126) safe.appendCodePoint(c);
                    else if (c == '\t') safe.append("    ");
                    else safe.append(c <= 65535 ? String.format("\\u%04X",c) : String.format("\\U%08X",c));
                });
                String text = safe.toString();
                if(text.isEmpty()) wrapped.add("");
                for(int start=0;start<text.length();start+=90)
                    wrapped.add(text.substring(start,Math.min(start+90,text.length())));
            }
            for(int offset=0;offset<wrapped.size();offset+=46) {
                var page=new PDPage(); document.addPage(page);
                try(var content=new PDPageContentStream(document,page)) {
                    // Repeated institutional header and page footer keep exported pages identifiable.
                    content.setNonStrokingColor(23/255f,63/255f,80/255f);
                    content.addRect(0,750,612,42);content.fill();
                    content.setNonStrokingColor(1f,1f,1f);
                    content.beginText();content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD),14);
                    content.newLineAtOffset(36,766);content.showText("ASSET AVENGERS | RESEARCH & OPERATIONS");content.endText();
                    content.setNonStrokingColor(0.12f,0.18f,0.22f);
                    content.beginText();content.setFont(font,10);content.setLeading(14);content.newLineAtOffset(36,726);
                    for(String line:wrapped.subList(offset,Math.min(offset+46,wrapped.size()))) {
                        boolean tableRow=line.startsWith("@table ");
                        content.setFont(tableRow?tableFont:font,tableRow?9:10);
                        content.showText(tableRow?line.substring(7):line);content.newLine();
                    }
                    content.endText();
                    content.beginText();content.setFont(font,8);content.newLineAtOffset(36,26);
                    content.showText("Confidential | Simulated trading | Asset Avengers | Page "+document.getNumberOfPages());content.endText();
                }
            }
            document.save(bytes);return bytes.toByteArray();
        } catch(IOException exception) { throw new UncheckedIOException("Unable to generate PDF",exception); }
    }
}
