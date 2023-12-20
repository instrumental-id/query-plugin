package com.identityworksllc.iiq.plugins.queryplugin.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.identityworksllc.iiq.plugins.queryplugin.QueryType;

import java.util.ArrayList;
import java.util.List;

@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
public class EnumerateTablesInput {

    private String application;
    private QueryType type;


    public String getApplication() {
        return application;
    }


    public QueryType getType() {
        return type;
    }

    public void setApplication(String application) {
        this.application = application;
    }

    public void setType(QueryType type) {
        this.type = type;
    }
}
