package com.identityworksllc.iiq.plugins.queryplugin.reporting.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;

import java.util.List;

@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
public class QueryReportSpec {
    
    private List<ArgumentSpec> arguments;
    private List<ColumnSpec> columns;
    private String name;
    private String sql;

    public List<ArgumentSpec> getArguments() {
        return arguments;
    }

    public List<ColumnSpec> getColumns() {
        return columns;
    }

    public String getName() {
        return name;
    }

    public String getSql() {
        return sql;
    }

    public void setArguments(List<ArgumentSpec> arguments) {
        this.arguments = arguments;
    }

    public void setColumns(List<ColumnSpec> columns) {
        this.columns = columns;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setSql(String sql) {
        this.sql = sql;
    }
}
