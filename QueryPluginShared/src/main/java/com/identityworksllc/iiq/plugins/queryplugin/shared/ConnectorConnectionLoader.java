package com.identityworksllc.iiq.plugins.queryplugin.shared;

import sailpoint.api.SailPointContext;
import sailpoint.object.Application;
import sailpoint.tools.GeneralException;

import java.sql.Connection;

public interface ConnectorConnectionLoader {
    Connection getConnection(SailPointContext context, Application application) throws GeneralException;
}
