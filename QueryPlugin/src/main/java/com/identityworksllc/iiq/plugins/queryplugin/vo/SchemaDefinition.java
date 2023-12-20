package com.identityworksllc.iiq.plugins.queryplugin.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;

import java.util.ArrayList;
import java.util.List;

@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
public class SchemaDefinition {
    private final List<String> tables;

    private final List<String> views;

    public SchemaDefinition() {
        this.tables = new ArrayList<>();
        this.views = new ArrayList<>();
    }

    public List<String> getTables() {
        return tables;
    }

    public List<String> getViews() {
        return views;
    }
}
