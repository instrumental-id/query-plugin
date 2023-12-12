package com.identityworksllc.iiq.plugins.queryplugin.connector;

import sailpoint.api.SailPointContext;
import sailpoint.connector.ConnectorException;
import sailpoint.connector.DefaultConnectorServices;
import sailpoint.object.Application;
import sailpoint.object.Schema;
import sailpoint.tools.GeneralException;

import java.sql.Connection;
import java.util.HashMap;
import java.util.function.BiFunction;

public class ConnectorAdapter implements BiFunction<SailPointContext, Application, Connection> {

    @Override
    public Connection apply(SailPointContext context, Application application)  {
        try {
            Schema accountSchema = application.getAccountSchema();

            ExtendedJdbcConnector connector = new ExtendedJdbcConnector(application);
            connector.setConnectorServices(new DefaultConnectorServices());
            return connector.getConnection(accountSchema, new HashMap<>());
        } catch(Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
