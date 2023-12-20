package com.identityworksllc.iiq.plugins.queryplugin.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;

import java.util.ArrayList;
import java.util.List;

@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
public class EnumeratedTable {
    private final List<String> columns;
    private String schema;
    private String table;

    public EnumeratedTable() {
        this.columns = new ArrayList<>();
    }

    public List<String> getColumns() {
        return columns;
    }

    public String getSchema() {
        return schema;
    }

    public String getTable() {
        return table;
    }

    public void setSchema(String schema) {
        this.schema = schema;
    }

    public void setTable(String table) {
        this.table = table;
    }
}
