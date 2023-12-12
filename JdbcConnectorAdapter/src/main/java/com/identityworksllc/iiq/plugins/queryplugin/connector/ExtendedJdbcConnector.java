package com.identityworksllc.iiq.plugins.queryplugin.connector;

import sailpoint.connector.ConnectorException;
import sailpoint.connector.JDBCConnector;
import sailpoint.object.Application;
import sailpoint.object.Schema;
import sailpoint.tools.GeneralException;

import java.sql.Connection;
import java.util.Map;

public class ExtendedJdbcConnector extends JDBCConnector {
    public ExtendedJdbcConnector(Application application) {
        super(application);
    }

    @Override
    public Connection getConnection(Schema schema, Map<String, Object> options) throws GeneralException, ConnectorException {
        return super.getConnection(schema, options);
    }
}
