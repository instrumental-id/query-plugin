package com.identityworksllc.iiq.plugins.queryplugin.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.identityworksllc.iiq.plugins.queryplugin.QueryType;
import sailpoint.api.SailPointContext;
import sailpoint.object.Application;
import sailpoint.tools.GeneralException;
import sailpoint.tools.Util;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.StringJoiner;

/**
 * The input to the /query endpoint in {@link com.identityworksllc.iiq.plugins.queryplugin.QueryPluginResource}
 */
@JsonAutoDetect(getterVisibility = JsonAutoDetect.Visibility.ANY, setterVisibility = JsonAutoDetect.Visibility.ANY)
@JsonIgnoreProperties(ignoreUnknown = true)
public class RunQueryInput {

    /**
     * If type == application, this is the name of the JDBC application to use to query
     */
    private String application;

    /**
     * If a mergeMaps config is used, this is where it's stored
     */
    private MergeMapsConfig mergeMaps;

    /**
     * The named parameters to the query, if any are defined
     */
    private Map<String, Object> namedParams;

    /**
     * The query itself, either HQL, SQL, or an IIQ Filter
     */
    private String query;

    /**
     * The query class, used for Filter and XMLFilter types
     */
    private String queryClass;

    /**
     * The query type
     */
    private QueryType type;

    public RunQueryInput() {
        this.namedParams = new HashMap<>();
        this.mergeMaps = new MergeMapsConfig();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        RunQueryInput that = (RunQueryInput) o;
        return Objects.equals(application, that.application) && Objects.equals(mergeMaps, that.mergeMaps) && Objects.equals(namedParams, that.namedParams) && Objects.equals(query, that.query) && Objects.equals(queryClass, that.queryClass) && type == that.type;
    }

    public String getApplication() {
        return application;
    }

    public MergeMapsConfig getMergeMaps() {
        return mergeMaps;
    }

    public Map<String, Object> getNamedParams() {
        return namedParams;
    }

    public String getQuery() {
        return query;
    }

    public String getQueryClass() {
        return queryClass;
    }

    public QueryType getType() {
        return type;
    }

    @Override
    public int hashCode() {
        return Objects.hash(application, mergeMaps, namedParams, query, queryClass, type);
    }

    public void setApplication(String application) {
        this.application = application;
    }

    public void setMergeMaps(MergeMapsConfig mergeMaps) {
        this.mergeMaps = mergeMaps;
    }

    public void setNamedParams(Map<String, Object> namedParams) {
        this.namedParams = namedParams;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public void setQueryClass(String queryClass) {
        this.queryClass = queryClass;
    }

    public void setType(String type) {
        this.type = QueryType.valueOf(type);
    }

    public void setType(QueryType type) {
        this.type = type;
    }

    @Override
    public String toString() {
        StringJoiner joiner = new StringJoiner(", ", RunQueryInput.class.getSimpleName() + "[", "]");
        if ((application) != null) {
            joiner.add("application='" + application + "'");
        }
        if ((mergeMaps) != null) {
            joiner.add("mergeMaps=" + mergeMaps);
        }
        if ((namedParams) != null) {
            joiner.add("namedParams=" + namedParams);
        }
        if ((query) != null) {
            joiner.add("query='" + query + "'");
        }
        if ((queryClass) != null) {
            joiner.add("queryClass='" + queryClass + "'");
        }
        if ((type) != null) {
            joiner.add("type=" + type);
        }
        return joiner.toString();
    }

    /**
     * Validates the input
     * @param context The IIQ context to use for lookups
     * @throws IllegalArgumentException if the input is invalid in any way
     */
    public void validate(SailPointContext context) throws IllegalArgumentException {
        if (type == null) {
            throw new IllegalArgumentException("Missing required field: type (must be one of " + Arrays.asList(QueryType.values()) + ")");
        }

        if (Util.isNullOrEmpty(query) || query.trim().length() < 1) {
            throw new IllegalArgumentException("Missing required field: query (the SQL, HQL, or filter content)");
        }

        if (Util.isNotNullOrEmpty(application)) {
            try {
                Application derived = context.getObject(Application.class, application);
                if (derived == null) {
                    throw new IllegalArgumentException("No such application: " + application);
                }

                if (!Util.nullSafeEq(derived.getType(), "JDBC")) {
                    throw new IllegalArgumentException("Application '" + application + "' is not of type JDBC");
                }
            } catch(GeneralException e) {
                throw new IllegalArgumentException("Error loading application: " + application, e);
            }
        }
    }
}
