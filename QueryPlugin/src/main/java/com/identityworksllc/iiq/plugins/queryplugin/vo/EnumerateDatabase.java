package com.identityworksllc.iiq.plugins.queryplugin.vo;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import sailpoint.tools.Util;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@JsonAutoDetect(fieldVisibility = JsonAutoDetect.Visibility.ANY)
public class EnumerateDatabase {
    private String databaseProductName;
    private String databaseVersion;
    private String catalog;
    private String schema;
    private List<String> extraKeywords;
    private final Map<String, SchemaDefinition> schemas;

    public EnumerateDatabase() {
        this.schemas = new HashMap<>();
        this.extraKeywords = new ArrayList<>();
    }

    public void enumerate(Connection connection) throws SQLException {
        DatabaseMetaData metaData = connection.getMetaData();

        this.catalog = connection.getCatalog();
        this.schema = connection.getSchema();

        this.databaseVersion = metaData.getDatabaseProductVersion();
        this.databaseProductName = metaData.getDatabaseProductName();

        this.extraKeywords = Util.csvToList(metaData.getSQLKeywords());

        String[] types = {"TABLE"};
        try(ResultSet results = metaData.getTables(null, null, "%", types)) {
            while(results.next()) {
                String catalog = results.getString("TABLE_CAT");
                String schema = results.getString("TABLE_SCHEM");
                String table = results.getString("TABLE_NAME");

                if (Util.isNullOrEmpty(schema)) {
                    schema = catalog;
                }

                if (Util.isNullOrEmpty(schema)) {
                    schema = "unknown";
                }

                if (!this.schemas.containsKey(schema)) {
                    this.schemas.put(schema, new SchemaDefinition());
                }

                this.schemas.get(schema).getTables().add(table);
            }
        }
    }

    public String getDatabaseProductName() {
        return databaseProductName;
    }

    public String getDatabaseVersion() {
        return databaseVersion;
    }

    public List<String> getExtraKeywords() {
        return extraKeywords;
    }

    public Map<String, SchemaDefinition> getSchemas() {
        return schemas;
    }
}
