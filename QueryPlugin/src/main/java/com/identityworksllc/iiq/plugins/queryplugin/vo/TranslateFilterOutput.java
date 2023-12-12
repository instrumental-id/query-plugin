package com.identityworksllc.iiq.plugins.queryplugin.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import org.apache.commons.collections4.map.ListOrderedMap;

import java.util.Map;

@JsonAutoDetect(getterVisibility = JsonAutoDetect.Visibility.PUBLIC_ONLY)
public class TranslateFilterOutput {

    private String filter;
    private Map<String, Object> params;
    private String query;
    private String sql;
    private String xmlFilter;

    public TranslateFilterOutput() {
        this.params = new ListOrderedMap<>();
    }

    public String getFilter() {
        return filter;
    }

    public Map<String, Object> getParams() {
        return params;
    }

    public String getQuery() {
        return query;
    }

    public String getSql() {
        return sql;
    }

    public String getXmlFilter() {
        return xmlFilter;
    }

    public void setFilter(String filter) {
        this.filter = filter;
    }

    public void setParams(Map<String, Object> params) {
        this.params = params;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public void setSql(String sql) {
        this.sql = sql;
    }

    public void setXmlFilter(String xmlFilter) {
        this.xmlFilter = xmlFilter;
    }
}
