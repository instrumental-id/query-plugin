package com.identityworksllc.iiq.plugins.queryplugin;

import com.identityworksllc.iiq.common.plugin.BaseCommonPluginResource;
import sailpoint.authorization.UnauthorizedAccessException;
import sailpoint.object.AuditEvent;
import sailpoint.plugin.PluginBaseHelper;
import sailpoint.plugin.SqlScriptExecutor;
import sailpoint.rest.plugin.RequiredRight;
import sailpoint.server.Auditor;
import sailpoint.server.Environment;
import sailpoint.tools.GeneralException;
import sailpoint.tools.Util;

import javax.ws.rs.Consumes;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

/**
 * The REST endpoint for executing entire script files (as the plugin
 * installer does).
 */
@RequiredRight("IDW_SP_QueryRunner_ExecuteScripts")
@Path("IDWQueryPlugin/script")
@Produces(MediaType.APPLICATION_JSON)
public class ScriptExecutionResource extends BaseCommonPluginResource {
    /**
     * Executes the given script, according to the input JSON, and returns a
     * simple "success: true" on success.
     *
     * @param inputs The JSON body, which must contain a 'script' and a 'type'
     * @return A success message, or an exception
     */
    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response executeScript(Map<String, Object> inputs) {
        return handle(() -> {
            if (!getSettingBool("enableScriptExecution")) {
                throw new UnauthorizedAccessException("Script execution feature is not enabled");
            }

            String sql = Util.otoa(inputs.get("script"));
            if (Util.isNullOrEmpty(sql)) {
                throw new IllegalArgumentException("Input must include a string 'script'");
            }


            String typeString = Util.otoa(inputs.get("type"));
            if (Util.isNullOrEmpty(typeString)) {
                throw new IllegalArgumentException("Input must include a string 'type' (one of: SQL, SQLPlugin, SQLAccessHistory)");
            }

            QueryType type = QueryType.valueOf(typeString);

            boolean secret = Util.otob(inputs.get("secret"));

            AuditEvent ae = new AuditEvent();
            ae.setAction("queryPluginScript");
            ae.setServerHost(Util.getHostName());
            ae.setSource(getLoggedInUser().getName());

            if (secret) {
                ae.setString1("secret");
                ae.setAttribute("secret", true);
                ae.setAttribute("script", getContext().encrypt(sql));
            } else {
                ae.setString1(Util.truncate(sql, 390));
                ae.setAttribute("script", sql);
            }
            Auditor.log(ae);
            getContext().commitTransaction();

            try (Connection connection = getScriptConnection(type)) {
                // This is the plugin script executor, the one that executes
                // install and upgrade scripts when plugins are installed.
                // That means it handles SQLServer stuff like "GO" and other
                // multi-line script things.
                SqlScriptExecutor scriptExecutor = new SqlScriptExecutor();
                scriptExecutor.execute(connection, sql);
            }

            // Scripts produce no output, so we'll just return a JSON success
            Map<String, Object> output = new HashMap<>();
            output.put("success", true);

            return output;
        });
    }

    @Override
    public String getPluginName() {
        return QueryPluginResource.PLUGIN_NAME;
    }

    /**
     * Retrieves the connection based on the given query type
     *
     * TODO: Merge this with the method in QueryPluginResource
     *
     * @param type The query type, which must be one of the three local IIQ databases
     * @return The connection to the DB
     * @throws GeneralException If a connection to one of the IIQ databases fails, or if you try to use SQLAccessHistory outside of 8.4+
     * @throws SQLException If a connection to the plugin DB fails
     * @throws IllegalArgumentException If you specify a type that is not supported
     */
    private Connection getScriptConnection(QueryType type) throws GeneralException, SQLException {
        Connection connection;
        if (type.equals(QueryType.SQL)) {
            connection = Environment.getEnvironment().getSpringDataSource().getConnection();
        } else if (type.equals(QueryType.SQLAccessHistory)) {
            try {
                Class<Environment> environmentClass = Environment.class;

                // This is only present in 8.4 or higher
                Method staticGetter = environmentClass.getMethod("getEnvironmentAccessHistory");

                Environment ahEnvironment = (Environment) staticGetter.invoke(null);

                connection = ahEnvironment.getSpringDataSource().getConnection();
            } catch(Exception e) {
                throw new GeneralException("Could not retrieve Access History connection (not IIQ 8.4?)", e);
            }
        } else if (type.equals(QueryType.SQLPlugin)) {
            connection = PluginBaseHelper.getConnection();
        } else {
            throw new IllegalArgumentException("Invalid type for script execution: " + type);
        }

        return connection;
    }
}
