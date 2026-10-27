package com.avengers.internal.exports;

import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.font.*;
import org.springframework.stereotype.Component;
import java.io.*;
import java.util.*;

/** Branded, paginated exports. Evidence is wrapped by measured font width, never truncated. */
@Component
public class PdfDocument {
    private static final float LEFT=44, WIDTH=524;
    private record Row(String text, int kind, float size, float height) {}
    private static String safe(String value) {
        var result=new StringBuilder();
        value.codePoints().forEach(c -> {
            if(c>=32 && c<=126) result.appendCodePoint(c);
            else if(c=='\t') result.append("    ");
            else result.append(c<=65535?String.format("\\u%04X",c):String.format("\\U%08X",c));
        });
        return result.toString();
    }
    private static List<String> wrap(String text, PDFont font, float size, float width) throws IOException {
        var result=new ArrayList<String>();
        while(!text.isEmpty()) {
            int end=0;
            while(end<text.length() && font.getStringWidth(text.substring(0,end+1))/1000*size<=width) end++;
            if(end==0) end=1;
            if(end<text.length()) { int space=text.lastIndexOf(' ',end); if(space>end/2) end=space; }
            result.add(text.substring(0,end)); text=text.substring(end).stripLeading();
        }
        return result.isEmpty()?List.of(""):result;
    }
    private static void text(PDPageContentStream c, PDFont font,float size,float x,float y,String text) throws IOException {
        c.beginText();c.setFont(font,size);c.newLineAtOffset(x,y);c.showText(text);c.endText();
    }
    public byte[] render(String title,List<String> lines) {
        try(var document=new PDDocument();var bytes=new ByteArrayOutputStream()) {
            document.getDocumentInformation().setTitle(title);
            document.getDocumentInformation().setAuthor("Endgame");
            var regular=new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            var bold=new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
            var mono=new PDType1Font(Standard14Fonts.FontName.COURIER);
            var rows=new ArrayList<Row>();
            for(String original:lines) {
                String value=safe(original);
                boolean table=value.startsWith("@table ");
                if(table) value=value.substring(7);
                boolean heading=!value.isBlank() && !table && value.equals(value.toUpperCase(Locale.ROOT)) && value.matches(".*[A-Z].*") && !value.contains(":") && !value.startsWith("CONFIDENTIAL");
                int kind=table?2:heading?1:original.startsWith("  Instrument:")?3:0;
                float size=table?9:heading?11:kind==3?8:10;
                if(value.isBlank()) { rows.add(new Row("",0,10,10));continue; }
                if(heading) rows.add(new Row("",0,10,10));
                for(String part:wrap(value,table?mono:heading?bold:regular,size,table?WIDTH-20:WIDTH))
                    rows.add(new Row(part,kind,size,heading?27:table?24:kind==3?19:17));
            }
            var pages=new ArrayList<List<Row>>();
            float capacity=590-21*(wrap(safe(title),bold,17,WIDTH).size()-1);
            float available=capacity;var pageRows=new ArrayList<Row>();
            Row tableHeader=null;
            for(int i=0;i<rows.size();i++) {
                Row row=rows.get(i);
                if(row.kind()==2 && row.text().startsWith("Symbol")) tableHeader=row;
                if(row.kind()==1) tableHeader=null;
                float required=row.height();
                if(row.kind()==2 && i+1<rows.size() && rows.get(i+1).kind()==3) required+=rows.get(i+1).height();
                if(row.kind()==1) required+=i+1<rows.size()?rows.get(i+1).height():0;
                if(required>available && !pageRows.isEmpty()) { pages.add(pageRows);pageRows=new ArrayList<>();available=capacity;
                    if(row.kind()==2 && tableHeader!=null && row!=tableHeader) { pageRows.add(tableHeader);available-=tableHeader.height(); }
                }
                pageRows.add(row);available-=row.height();
            }
            if(!pageRows.isEmpty() || pages.isEmpty()) pages.add(pageRows);
            for(int index=0;index<pages.size();index++) {
                var page=new PDPage();document.addPage(page);
                try(var c=new PDPageContentStream(document,page)) {
                    c.setNonStrokingColor(.07f,.11f,.10f);c.addRect(0,708,612,84);c.fill();
                    c.setNonStrokingColor(.70f,.96f,.41f);text(c,bold,19,LEFT,754,"Endgame");
                    c.setNonStrokingColor(.83f,.88f,.85f);text(c,regular,8,LEFT,735,"RESEARCH & OPERATIONS  /  INTERNAL REPORT");
                    float y=681;
                    c.setNonStrokingColor(.09f,.15f,.13f);
                    var titles=wrap(safe(title),bold,17,WIDTH);
                    for(String line:titles) { text(c,bold,17,LEFT,y,line);y-=21; }
                    y-=14;
                    // Reserve room for wrapped titles on every page.
                    for(Row row:pages.get(index)) {
                        if(row.text().isEmpty()) { y-=row.height();continue; }
                        if(row.kind()==1) {
                            c.setNonStrokingColor(.91f,.94f,.92f);c.addRect(LEFT-8,y-9,WIDTH+16,24);c.fill();
                            c.setNonStrokingColor(.12f,.26f,.19f);text(c,bold,row.size(),LEFT,y,row.text());
                        } else if(row.kind()==2) {
                            boolean header=row.text().startsWith("Symbol");
                            c.setNonStrokingColor(header?.13f:.96f,header?.24f:.97f,header?.19f:.96f);
                            c.addRect(LEFT-8,y-8,WIDTH+16,24);c.fill();
                            c.setNonStrokingColor(header?1f:.12f,header?1f:.18f,header?1f:.15f);
                            text(c,mono,row.size(),LEFT+2,y,row.text());
                        } else {
                            c.setNonStrokingColor(row.kind()==3?.40f:.20f,row.kind()==3?.45f:.25f,row.kind()==3?.43f:.23f);
                            text(c,regular,row.size(),LEFT,y,row.text());
                        }
                        y-=row.height();
                    }
                    c.setStrokingColor(.80f,.85f,.82f);c.moveTo(LEFT,46);c.lineTo(568,46);c.stroke();
                    c.setNonStrokingColor(.40f,.45f,.43f);
                    text(c,regular,8,LEFT,30,"CONFIDENTIAL  |  Simulated trading  |  Endgame");
                    text(c,regular,8,490,30,"Page "+(index+1)+" of "+pages.size());
                }
            }
            document.save(bytes);return bytes.toByteArray();
        } catch(IOException exception) { throw new UncheckedIOException("Unable to generate PDF",exception); }
    }
}
