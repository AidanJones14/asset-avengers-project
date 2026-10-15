package com.avengers.internal.common;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;

// Normalize JDBC timestamps and SQL column names for the JSON API contract.
public final class Rows {
    private Rows() {}

    public static Map<String,Object> read(ResultSet rs,int index) throws SQLException {
        var row=new LinkedHashMap<String,Object>();
        var metadata=rs.getMetaData();
        for(int i=1;i<=metadata.getColumnCount();i++) {
            String[] words=metadata.getColumnLabel(i).split("_");
            var key=new StringBuilder(words[0]);
            for(int j=1;j<words.length;j++) key.append(Character.toUpperCase(words[j].charAt(0))).append(words[j].substring(1));
            Object value=rs.getObject(i);
            if(value instanceof java.sql.Timestamp timestamp) value=timestamp.toInstant();
            if(value instanceof java.sql.Date date) value=date.toLocalDate();
            row.put(key.toString(),value);
        }
        return row;
    }
}
