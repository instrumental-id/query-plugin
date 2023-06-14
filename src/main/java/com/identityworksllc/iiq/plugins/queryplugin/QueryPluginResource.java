package com.identityworksllc.iiq.plugins.queryplugin;

import com.identityworksllc.iiq.common.minimal.Utilities;
import com.identityworksllc.iiq.common.minimal.iterators.ResultSetIterator;
import com.identityworksllc.iiq.common.minimal.plugin.BaseCommonPluginResource;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.Statements;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SelectExpressionItem;
import net.sf.jsqlparser.statement.select.SelectItem;
import net.sf.jsqlparser.statement.select.SelectItemVisitorAdapter;
import net.sf.jsqlparser.util.validation.Validation;
import net.sf.jsqlparser.util.validation.ValidationError;
import net.sf.jsqlparser.util.validation.feature.FeaturesAllowed;
import org.apache.commons.collections4.map.ListOrderedMap;
import sailpoint.api.DynamicValuator;
import sailpoint.api.IncrementalObjectIterator;
import sailpoint.api.ObjectUtil;
import sailpoint.api.SailPointContext;
import sailpoint.api.SailPointFactory;
import sailpoint.authorization.UnauthorizedAccessException;
import sailpoint.object.*;
import sailpoint.persistence.HibernatePersistenceManager;
import sailpoint.plugin.PluginBaseHelper;
import sailpoint.rest.plugin.RequiredRight;
import sailpoint.search.ExtendedAttributeVisitor;
import sailpoint.server.Auditor;
import sailpoint.server.Environment;
import sailpoint.tools.GeneralException;
import sailpoint.tools.JdbcUtil;
import sailpoint.tools.Util;
import sailpoint.tools.xml.AbstractXmlObject;

import javax.ws.rs.DefaultValue;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.Response;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import static com.identityworksllc.iiq.plugins.queryplugin.HibernateAdapter.addIfMissing;

@RequiredRight("IDW_SP_QueryRunner")
@Path("IDWQueryPlugin")
@SuppressWarnings("unused")
public class QueryPluginResource extends BaseCommonPluginResource {

	/**
	 * A wrapper for an output column of a report, used by the {@link #saveReport(Map)} method
	 * and downstream from there.
	 */
	private static class OutputColumn {
		private String columnDisplayName;
		private String columnName;

		public OutputColumn(String columnName) {
			this(columnName, null);
		}

		public OutputColumn(String columnName, String columnDisplayName) {
			this.columnName = columnName;
			this.columnDisplayName = columnDisplayName;
		}

		public String getColumnDisplayName() {
			return columnDisplayName;
		}

		public String getColumnName() {
			return columnName;
		}

		public void setColumnDisplayName(String columnDisplayName) {
			this.columnDisplayName = columnDisplayName;
		}

		public void setColumnName(String columnName) {
			this.columnName = columnName;
		}
	}

	enum Type {
		XMLFilter,
		Filter,
		HQL,
		SQL,
		SQLPlugin,

		Application;
	}

	@DefaultValue("200")
	@QueryParam("limit")
	private int limitRows;

	@QueryParam("start")
	private int startAt;

	/**
	 * Audits the query if the audit action is enabled
	 * @param query The query to audit
	 * @param type The query type to audit
	 * @throws GeneralException if a failure occurs
	 */
	private void audit(String query, Type type, String application) throws GeneralException {
		log.info("User {0} is running query {1} of type {2}", getLoggedInUserName(), query, type);
		if (Auditor.isEnabled("queryPluginAction")) {
			SailPointContext old = SailPointFactory.getCurrentContext();
			SailPointContext context = SailPointFactory.createPrivateContext();
			SailPointFactory.setContext(context);
			try {
				AuditEvent event = new AuditEvent(getLoggedInUserName(), "queryPluginAction");
				event.setServerHost(Util.getHostName());
				event.setString1(AuditEvent.limit(query, 200));
				event.setString2(type.toString());
				event.setString3(String.valueOf(this.limitRows));
				event.setString4(String.valueOf(this.startAt));
				event.setAttribute("application", application);
				event.setAttribute("fullQuery", query);
				Auditor.log(event);
				context.commitTransaction();
			} finally {
				SailPointFactory.releasePrivateContext(context);
				SailPointFactory.setContext(old);
			}
		}
	}
	
	/**
	 * Modifies the input query to limit the rows returned. This is database-specific, so
	 * we need to make a best effort to guess the database vendor.
	 *
	 * @param connection The connection
	 * @param query The input query
	 * @return The modified query with rows limited
	 * @throws SQLException on mapping failures
	 */
	private String createLimitRowsSqlQuery(Connection connection, String query) throws SQLException {
		String modifiedQuery = query;
		if (JdbcUtil.isMySQL(connection)) {
			if (!query.toLowerCase().contains(" limit ")) {
				modifiedQuery = query + " limit " + limitRows;
			}
		} else if (JdbcUtil.isOracle(connection)) {
			modifiedQuery = "select * from (" + query + ") where rownum < " + limitRows;
		} else {
			String dbName = connection.getMetaData().getDatabaseProductName();
			if (dbName != null && dbName.toLowerCase().contains("microsoft")) {
				// Assume microsoft
				if (query.contains("order")) {
					modifiedQuery = "select * from ( " + query + " ) order by 1 offset 0 rows fetch next " + limitRows + " rows only";
				} else {
					modifiedQuery = query + " order by 1 offset 0 rows fetch next " + limitRows + " rows only";
				}
			} else {
				log.warn("Unhandled database type " + dbName + "; cannot limit returned rows automatically");
			}
		}
		return modifiedQuery;
	}

	/**
	 * Extract the "real" value from the input value based on the derived type specifiers
	 * identically to the JDBC report data source.
	 *
	 * TODO recombine this with the JDBC report data source
	 *
	 * @param input The input object to qualify
	 * @param derivedType The qualifier(s)
	 * @return The resulting value
	 * @throws GeneralException if any extraction failures occur
	 */
	private Object deriveTypedValue(Object input, String derivedType) throws GeneralException {
		String subKey;
		Object output = input;
		if (derivedType.startsWith("xml")) {
			output = AbstractXmlObject.parseXml(getContext(), (String) output);
			if (derivedType.contains(":")) {
				subKey = derivedType.substring(derivedType.indexOf(":") + 1);
				output = Utilities.getProperty(output, subKey, true);
			}
		} else if (derivedType.startsWith("timestamp")) {
			Long timestamp = null;
			if (output instanceof String && Util.isNotNullOrEmpty(Util.otoa(output))) {
				timestamp = Long.parseLong(Util.otoa(output));
			} else if (output instanceof Long) {
				timestamp = (Long)output;
			}
			if (timestamp != null) {
				output = new Date(timestamp);
				if (derivedType.contains(":")) {
					subKey = derivedType.substring(derivedType.indexOf(":") + 1);
					SimpleDateFormat formatter = new SimpleDateFormat(subKey);
					formatter.format((Date)output);
				}
			} else {
				output = null;
			}
		} else if (derivedType.startsWith("boolean")) {
			if (output instanceof String) {
				output = Utilities.isFlagSet((String)output);
			} else if (output instanceof Number) {
				long longResult = ((Number)output).longValue();
				output = longResult != 0L;
			} else {
				output = false;
			}
		} else {
			subKey = null;
			if (derivedType.contains(":")) {
				subKey = derivedType.substring(derivedType.indexOf(":") + 1);
				derivedType = derivedType.substring(0, derivedType.indexOf(":"));
			}

			if (!Util.nullSafeEq(derivedType, "object")) {
				Class<? extends SailPointObject> spClass = ObjectUtil.getSailPointClass(derivedType);
				if (spClass != null) {
					output = getContext().getObject(spClass, (String)output);
				}
			}

			if (subKey != null) {
				output = Utilities.getProperty(output, subKey, true);
			}
		}

		return output;
	}

	/**
	 * Builds the IIQ-version-specific Hibernate adapter for handling query execution
	 * and translation.
	 *
	 * @return The Hibernate adapter for the appropriate Hibernate version
	 * @throws GeneralException on errors
	 */
	private HibernateAdapter getHibernateAdapter() throws GeneralException {
		try {
			try {
				Class.forName("org.hibernate.hql.QueryTranslatorFactory");
				return (HibernateAdapter) Class.forName("com.identityworksllc.iiq.plugins.queryplugin.h3.HibernateAdapter3").getConstructor(SailPointContext.class).newInstance(getContext());
			} catch (ClassNotFoundException e) {
				return (HibernateAdapter) Class.forName("com.identityworksllc.iiq.plugins.queryplugin.h5.HibernateAdapter5").getConstructor(SailPointContext.class).newInstance(getContext());
			}
		} catch(Exception e) {
			throw new GeneralException(e);
		}
	}

	@Override
	public String getPluginName() {
		return "IDWQueryPlugin";
	}

	@GET
	@Path("configuration")
	public Response getConfiguration() {
		return handle(() -> {
			Map<String, Object> results = new HashMap<>();

			Identity.CapabilityManager capabilityManager = getLoggedInUser().getCapabilityManager();

			if (capabilityManager.hasRight("IDW_SP_QueryRunner_Application") || capabilityManager.hasCapability("SystemAdministrator")) {
				QueryOptions qo = new QueryOptions();
				qo.addFilter(Filter.eq("type", "JDBC"));

				List<String> fields = new ArrayList<>();
				fields.add("name");

				List<String> appNames = new ArrayList<>();
				Iterator<Object[]> searchResults = getContext().search(Application.class, qo, fields);

				while(searchResults.hasNext()) {
					Object[] row = searchResults.next();
					String name = (String) row[0];

					appNames.add(name);
				}

				results.put("applications", appNames);
			}

			return results;
 		});
	}

	/**
	 * REST API entry point for the Query API. Executes the given query and then
	 * returns the results.
	 *
	 * @param payload The JSON body of the HTTP POST
	 * @return The JSON output, containing query results and other metadata
	 */
	@SuppressWarnings({ "unchecked" })
	@POST
	@Path("query")
	public Response getResults(Map<String, Object> payload) {
		return handle(() -> {
			if (payload == null || payload.isEmpty()) {
				throw new IllegalArgumentException("A JSON body is mandatory for this REST endpoint");
			}

			String typeString = Util.otoa(payload.get("type"));
			String query = Util.otoa(payload.get("query"));
			String application = Util.otoa(payload.get("application"));
			Map<String, Object> namedParams = (Map<String, Object>)payload.get("namedParams");
			if (Util.isNullOrEmpty(query)) {
				throw new IllegalArgumentException("A 'query' is required in the JSON payload to this API");
			}
			if (Util.isNullOrEmpty(typeString)) {
				throw new IllegalArgumentException("A 'type' of either 'HQL' or 'SQL' is required in the JSON payload to this API");
			}

			Type type = Type.valueOf(typeString);

			audit(query, type, application);

			Map<String, Object> resultSet = new HashMap<>();
			List<Map<String, Object>> queryResults = new ArrayList<>();
			List<String> finalColumns = new ArrayList<>();
			if (type.equals(Type.HQL) && query.toLowerCase().contains(" union all ")) {
				String[] queries = query.split("(?i) union all ");
				for (String subset : queries) {
					runQuery(subset.trim(), namedParams, type, application, queryResults, finalColumns);
				}
			} else if (type.equals(Type.XMLFilter) || type.equals(Type.Filter)) {
				String objectType = Util.otoa(payload.get("queryClass"));
				Class<SailPointObject> spoClass = ObjectUtil.getSailPointClass(objectType);
				Filter f;
				if (type.equals(Type.XMLFilter)) {
					Object obj = AbstractXmlObject.parseXml(getContext(), query);
					if (obj instanceof Filter) {
						f = (Filter)obj;
					} else {
						throw new IllegalArgumentException("The XML provided for XMLFilter type must parse to a Filter");
					}
				} else {
					f = Filter.compile(query);
				}
				QueryOptions qo = new QueryOptions();
				qo.addFilter(f);
				if (limitRows > 0) {
					qo.setResultLimit(limitRows);
				}
				if (startAt > 0) {
					qo.setFirstRow(startAt);
				}
				Iterator<? extends SailPointObject> spoIterator = new IncrementalObjectIterator<>(getContext(), spoClass, qo);

				while(spoIterator.hasNext()) {
					SailPointObject item = spoIterator.next();
					ListOrderedMap resultRow = new ListOrderedMap();
					resultRow.put("name", item.getName());
					resultRow.put("id", item.getId());
					addIfMissing(finalColumns, "id");
					addIfMissing(finalColumns, "name");
					try {
						Method getAttributes = item.getClass().getMethod("getAttributes");
						Map<String, Object> attributes = (Map<String, Object>) getAttributes.invoke(item);
						for (String key : attributes.keySet()) {
							addIfMissing(finalColumns, key);
						}
						resultRow.putAll(attributes);
					} catch (Exception e) {
						/* Don't bother */
					}
					queryResults.add(resultRow);
				}
			} else {
				runQuery(query, namedParams, type, application, queryResults, finalColumns);
			}

			Identity.CapabilityManager capabilityManager = getLoggedInUser().getCapabilityManager();

			// Restrict the ability to merge to sysadmins
			if (capabilityManager.hasCapability("SystemAdministrator")) {
				queryResults = mergeMaps(payload, queryResults);
			}

			resultSet.put("host", Util.getHostName());
			resultSet.put("columns", finalColumns);
			resultSet.put("data", queryResults);
			return resultSet;
		});
	}

	/**
	 * Retrieves the list of names allowed for the given object type
	 * @param objectType The object type
	 * @param response The response object to modify with the list names
	 * @throws GeneralException if any failures occur querying objects
	 */
	private void handleOptions(String objectType, Map<String, Object> response) throws GeneralException {
		@SuppressWarnings("unchecked")
		Class<SailPointObject> spoClass = ObjectUtil.getSailPointClass(objectType);

		List<String> fields = new ArrayList<>();
		fields.add("id");
		fields.add("name");

		QueryOptions qo = new QueryOptions();

		Iterator<Object[]> iterator = getContext().search(spoClass, qo, fields);

		List<String> names = new ArrayList<>();
		while(iterator.hasNext()) {
			Object[] value = iterator.next();
			boolean add = true;
			if (spoClass.equals(Bundle.class)) {
				Bundle b = getContext().getObject(Bundle.class, (String)value[0]);
				if (b == null || b.getSelector() == null || (b.getSelector().getFilter() == null && b.getSelector().getPopulation() == null)) {
					add = false;
				}
			} else if (spoClass.equals(TaskDefinition.class)) {
				TaskDefinition taskDefinition = getContext().getObject(TaskDefinition.class, (String)value[0]);
				if (taskDefinition == null || taskDefinition.isTemplate() || !taskDefinition.getEffectiveSignature().hasArgument("filter")) {
					add = false;
				}
			}
			if (add) {
				names.add(Util.otoa(value[1]));
			}
		}
		Collections.sort(names);
		response.put("names", names);
	}

	/**
	 * Loads a filter from an object of a given type
	 * @param objectType The object type from which to load the Filter
	 * @param objectName The object name
	 * @param options If true, returns the set of available object names instead of loading the filter
	 * @return The resulting list of objects OR the filter output, depending on input
	 */
	@GET
	@Path("filter/load")
	public Response loadFilter(@QueryParam("type") String objectType, @QueryParam("name") String objectName, @QueryParam("options") @DefaultValue("false") boolean options) {
		return handle(() -> {
			Map<String, Object> response = new HashMap<>();
			response.put("type", objectType);
			if (options) {
				handleOptions(objectType, response);
			} else {
				if (Util.nullSafeCaseInsensitiveEq(objectType, "GroupDefinition")) {
					GroupDefinition gd = getContext().getObject(GroupDefinition.class, objectName);
					if (gd == null) {
						throw new IllegalArgumentException("Population " + objectName + " not found");
					}
					if (gd.getFilter() == null) {
						throw new IllegalArgumentException("Population " + objectName + " is not a filter population");
					}
					response.put("name", gd.getName());
					response.put("id", gd.getId());
					response.put("filter", gd.getFilter().getExpression(true));
				} else if (Util.nullSafeCaseInsensitiveEq(objectType, "Bundle")) {
					Bundle b = getContext().getObject(Bundle.class, objectName);
					if (b == null) {
						throw new IllegalArgumentException("Bundle " + objectName + " was not found");
					}
					if (b.getSelector() == null) {
						throw new IllegalArgumentException("Bundle " + objectName + " does not have any selector");
					}
					if (b.getSelector().getFilter() == null && b.getSelector().getPopulation() == null) {
						throw new IllegalArgumentException("Bundle " + objectName + " does not have a filter or population selector");
					}
					if (b.getSelector().getPopulation() != null) {
						GroupDefinition gd = b.getSelector().getPopulation();
						response.put("type", "GroupDefinition");
						response.put("name", gd.getName());
						response.put("id", gd.getId());
						response.put("filter", gd.getFilter().getExpression(true));
					} else if (b.getSelector().getFilter() != null) {
						CompoundFilter compoundFilter = b.getSelector().getFilter();
						response.put("name", b.getName());
						response.put("id", b.getId());
						response.put("filter", compoundFilter.getFilter().getExpression(true));
					}
				} else if (Util.nullSafeCaseInsensitiveEq(objectType, "TaskDefinition")) {
					TaskDefinition taskDefinition = getContext().getObject(TaskDefinition.class, objectName);
					if (taskDefinition == null) {
						throw new IllegalArgumentException("Task definition " + taskDefinition + " does not exist");
					}
					if (!taskDefinition.getEffectiveSignature().hasArgument("filter")) {
						throw new IllegalArgumentException("Task definition " + taskDefinition + " does not allow a 'filter' argument");
					}
					String filter = taskDefinition.getString("filter");
					if (Util.isNullOrEmpty(filter)) {
						throw new IllegalArgumentException("The task " + taskDefinition + " does not have a value for 'filter' defined");
					}

					response.put("name", taskDefinition.getName());
					response.put("id", taskDefinition.getId());
					response.put("filter", filter);
				} else {
					throw new IllegalArgumentException("Type " + objectType + " is not supported");
				}
			}
			return response;
		});
	}

	/**
	 * Performs a rule-based merge on the initial query results, if one is defined in the
	 * Query Plugin inputs. An existing rule name may be passed in the payload attribute
	 * 'mergeMapsRuleName' or a script in 'mergeMapsScript'.
	 *
	 * This works a little differently than the JDBC connector because we must have
	 * the possibility of merging any rows for any reason. This means we don't do a
	 * index fields match like the connectors do. The rule must modify 'current' and
	 * return a null value if the incoming row is to be merged into the current row.
	 * Returning a Map will cause the merge to be completed with the returned value
	 * swapped into 'current'.
	 *
	 * The rule or script will receive the following variables:
	 *
	 * 	 - current: The current row (will be empty for the first row)
	 * 	 - newObject: The next row in the result set to consider
	 * 	 - state: A shared Map that will be passed to all rule / script execution
	 *
	 * @param payload The JSON input payload from the client
	 * @param initialResults The initial results
	 * @return The resulting list of merged input rows
	 * @throws GeneralException on errors
	 */
	private List<Map<String, Object>> mergeMaps(Map<String, Object> payload, List<Map<String, Object>> initialResults) throws GeneralException {
		List<Map<String, Object>> mergedResults = initialResults;
		String mergeRuleName = Util.otoa(payload.get("mergeMapsRuleName"));
		String mergeScript = Util.otoa(payload.get("mergeMapsScript"));

		DynamicValue mergeMaps = null;
		if (Util.isNotNullOrEmpty(mergeRuleName)) {
			mergeMaps = new DynamicValue();
			Rule mergeRule = getContext().getObjectByName(Rule.class, mergeRuleName);
			if (mergeRule != null) {
				mergeMaps.setRule(mergeRule);
			}
		} else if (Util.isNotNullOrEmpty(mergeScript)) {
			mergeMaps = new DynamicValue();
			Script theScript = new Script();
			theScript.setSource(mergeScript);
		}

		if (mergeMaps != null) {
			Map<String, Object> state = new HashMap<>();
			List<Map<String, Object>> replacementResults = new ArrayList<>();
			DynamicValuator dynamicValuator = new DynamicValuator(mergeMaps);
			Map<String, Object> inputs = new HashMap<>();

			Map<String, Object> current = new HashMap<>();
			for(Map<String, Object> newResult : initialResults) {
				inputs.put("current", current);
				inputs.put("newObject", newResult);
				inputs.put("state", state);

				Object output = dynamicValuator.evaluate(getContext(), inputs);

				if (output instanceof Map) {
					replacementResults.add(current);
					current = (Map<String, Object>)output;
				}
			}
			if (!current.isEmpty()) {
				replacementResults.add(current);
			}
			mergedResults = replacementResults;
		}
		return mergedResults;
	}

	/**
	 * Runs the query and returns the results
	 */
	private void runQuery(String query, Map<String, Object> namedParams, Type type, String applicationName, List<Map<String, Object>> finalResults, List<String> finalColumns) throws Exception {
		if (type.equals(Type.HQL)) {
			HibernateAdapter adapter = getHibernateAdapter();
			adapter.setLimitRows(limitRows);
			adapter.setStartAt(startAt);
			adapter.runHibernateQuery(query, namedParams, finalResults, finalColumns);
		} else if (type.equals(Type.Application) || type.equals(Type.SQL) || type.equals(Type.SQLPlugin)) {
			Connection connection = null;
			if (type.equals(Type.Application)) {
				if (Util.isNullOrEmpty(applicationName)) {
					throw new IllegalArgumentException("An application name is required for queries of type Application");
				}

				Identity.CapabilityManager capabilityManager = getLoggedInUser().getCapabilityManager();

				if (!(capabilityManager.hasRight("IDW_SP_QueryRunner_Application") || capabilityManager.hasCapability("SystemAdministrator"))) {
					throw new UnauthorizedAccessException("Access denied to run Application queries");
				}

				Application application = getContext().getObjectByName(Application.class, applicationName);
				if (application == null) {
					throw new IllegalArgumentException("No such application: " + application);
				}
				if (!"JDBC".equals(application.getType())) {
					throw new IllegalArgumentException("Application " + applicationName + " is not of type JDBC");
				}

				Attributes<String, Object> appAttrs = application.getAttributes();
				String password = appAttrs.getString("password");

				if (Util.isNotNullOrEmpty(password)) {
					appAttrs.put("password", getContext().decrypt(password));
				}

				connection = JdbcUtil.getConnection(appAttrs);
			} else if (type.equals(Type.SQL)) {
				connection = Environment.getEnvironment().getSpringDataSource().getConnection();
			} else {
				connection = PluginBaseHelper.getConnection();
			}
			try {
				runSQLQuery(connection, query, type, finalResults);
			} finally {
				if (connection != null) {
					connection.close();
				}
			}
		}
	}

	/**
	 * Runs the query via SQL, via either the main IIQ DB or the Plugin DB, then returns the results
	 * @param query The query to run
	 * @param type The type of the query (SQLPlugin or SQL)
	 * @param finalResults The object to which rows are added
	 * @throws SQLException if any query failures occur
	 * @throws GeneralException if any IIQ failures occur
	 */
	private void runSQLQuery(Connection connection, String query, Type type, List<Map<String, Object>> finalResults) throws SQLException, GeneralException {
		SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS Z");

		String modifiedQuery = query;
		if (limitRows > 0) {
			modifiedQuery = createLimitRowsSqlQuery(connection, modifiedQuery);
		}

		if (super.getUserTimeZone() != null) {
			formatter.setTimeZone(super.getUserTimeZone());
		}

		try (PreparedStatement stmt = connection.prepareStatement(modifiedQuery)) {
			try(ResultSet results = stmt.executeQuery()) {
				ResultSetMetaData rsmd = results.getMetaData();

				while(results.next()) {
					Map<String, Object> row = new ListOrderedMap<>();
					for(int col = 1; col <= rsmd.getColumnCount(); col++) {
						String colName = rsmd.getColumnLabel(col);
						int colTypeCode = rsmd.getColumnType(col);

						ResultSetIterator.ColumnOutput columnOutput = ResultSetIterator.extractColumnValue(results, colName, colTypeCode);
						Object value = columnOutput.getValue();

						if (Util.isNotNullOrEmpty(columnOutput.getDerivedType())) {
							value = ResultSetIterator.deriveTypedValue(getContext(), value, columnOutput.getDerivedType());
						}

						if (value instanceof Date) {
							value = formatter.format((Date)value);
						}

						row.put(colName, value);
					}
					finalResults.add(row);
				}

			}
		}
	}

	@POST
	@RequiredRight("IDW_SP_QuerySaveReport")
	public Response saveReport(Map<String, Object> jsonBody) {
		return handle(() -> {
			String reportName = Util.otoa(Util.get(jsonBody, "name"));

			if (Util.isNullOrEmpty(reportName)) {
				throw new GeneralException("Invalid report name: [" + reportName + "]");
			}

			String reportSql = Util.otoa(Util.get(jsonBody, "sql"));

			List<OutputColumn> outputColumns = new ArrayList<>();
			@SuppressWarnings("unchecked")
			List<Map<String, Object>> columns = Util.asList(Util.get(jsonBody, "columns"));
			for(Map<String, Object> col : columns) {
				String colName = Util.otoa(Util.get(col, "name"));
				String colDisplayName = Util.otoa(Util.get(col, "displayName"));

				if (Util.isNullOrEmpty(colName)) {
					throw new IllegalStateException("Column names cannot be blank");
				}

				if (Util.isNullOrEmpty(colDisplayName)) {
					colDisplayName = colName;
				}

				outputColumns.add(new OutputColumn(colName, colDisplayName));
			}

			List<Argument> argumentInputs = new ArrayList<>();
			@SuppressWarnings("unchecked")
			List<Map<String, Object>> arguments = Util.asList(Util.get(jsonBody, "arguments"));
			for(Map<String, Object> arg : arguments) {
				String argName = Util.otoa(Util.get(arg, "name"));
				String argDisplayName = Util.otoa(Util.get(arg, "displayName"));
				String argType = Util.otoa(Util.get(arg, "type"));

				if (Util.isNullOrEmpty(argName)) {
					throw new IllegalStateException("Argument names cannot be blank");
				}

				if (Util.isNullOrEmpty(argDisplayName)) {
					argDisplayName = argName;
				}

				Argument argument = new Argument();
				argument.setPrompt(argDisplayName);
				argument.setName(argName);
				argument.setType(argType);

				argumentInputs.add(argument);
			}

			TaskDefinition reportTemplate = saveSqlToReport(reportName, reportSql, argumentInputs, outputColumns);
			getContext().saveObject(reportTemplate);
			getContext().commitTransaction();

			return Response.ok().build();
		});
	}

	/**
	 * Handles the technical bits of saving the given inputs into a Report using the
	 * IIQCommon JDBCDataSource.
	 *
	 * @param name The name of the report template to create or modify
	 * @param sql The SQL to run for the report
	 * @param inputs The report input arguments
	 * @param columns The report output columns
	 * @return The report itself, NOT SAVED
	 * @throws GeneralException if anything goes wrong during construction
	 */
	private TaskDefinition saveSqlToReport(String name, String sql, List<Argument> inputs, List<OutputColumn> columns) throws GeneralException {
		String dataSourceClass = "com.identityworksllc.iiq.common.minimal.reporting.JDBCDataSource";
		try {
			Class.forName(dataSourceClass);
		} catch(Exception e) {
			throw new GeneralException("The IIQCommon reporting library must be in your WEB-INF/lib before you can create a report via the Query Plugin");
		}

		Validation validation = new Validation(Arrays.asList(FeaturesAllowed.SELECT), sql);
		List<ValidationError> errors = validation.validate();
		if (errors.size() > 0) {
			throw new GeneralException("Unable to validate SQL query: " + errors);
		}
		Statements statementsObj = validation.getParsedStatements();

		List<Statement> statements = statementsObj.getStatements();
		if (statements == null || statements.size() != 1) {
			throw new IllegalArgumentException("Unable to validate SQL query: the input SQL must resolve to a single statement");
		}

		List<ReportColumnConfig> columnConfigs = new ArrayList<>();

		Select selectStatement = (Select)statements.get(0);
		if (selectStatement.getSelectBody() instanceof PlainSelect) {
			for (SelectItem selectItem : Util.safeIterable(((PlainSelect) selectStatement.getSelectBody()).getSelectItems())) {
				selectItem.accept(new SelectItemVisitorAdapter() {
					@Override
					public void visit(SelectExpressionItem item) {
						String alias = item.getAlias().getName();
						OutputColumn match = null;
						for(OutputColumn columnInput : Util.safeIterable(columns)) {
							if (Util.nullSafeCaseInsensitiveEq(columnInput.columnName, alias)) {
								match = columnInput;
								break;
							}
						}
						ReportColumnConfig columnConfig = new ReportColumnConfig();
						if (match != null) {
							columnConfig.setField(match.columnName);
							columnConfig.setHeader(Util.isNullOrEmpty(match.columnDisplayName) ? match.columnName : match.columnDisplayName);
							columnConfig.setProperty(match.columnName);
						} else {
							columnConfig.setField(alias);
							columnConfig.setHeader(alias);
							columnConfig.setProperty(alias);
						}
						columnConfigs.add(columnConfig);
					}
				});
			}
		}

		TaskDefinition reportTaskDef = getContext().getObjectByName(TaskDefinition.class, name);
		if (reportTaskDef == null) {
			reportTaskDef = new TaskDefinition();
			reportTaskDef.setName(name);
			reportTaskDef.setType(TaskItemDefinition.Type.LiveReport);
			reportTaskDef.setProgressMode(TaskItemDefinition.ProgressMode.Percentage);
			reportTaskDef.setSubType("Query");
			reportTaskDef.setResultAction(TaskDefinition.ResultAction.Rename);
			reportTaskDef.setTemplate(true);
		}

		if (!reportTaskDef.isTemplate()) {
			throw new IllegalArgumentException("Only template reports can be created or modified using this method");
		}

		LiveReport liveReport = (LiveReport) reportTaskDef.getArgument("report");
		if (liveReport == null) {
			liveReport = new LiveReport();
			liveReport.setTitle(name);
			reportTaskDef.setArgument("report", liveReport);
		}

		ReportDataSource dataSource = liveReport.getDataSource();
		if (dataSource == null) {
			dataSource = new ReportDataSource();
			liveReport.setDataSource(dataSource);
		}

		liveReport.setGridColumns(columnConfigs);

		dataSource.setType(ReportDataSource.DataSourceType.Java);
		dataSource.setDataSourceClass(dataSourceClass);
		dataSource.setQuery(sql);

		Signature signature = new Signature();
		List<Argument> arguments = new ArrayList<>();
		List<ReportDataSource.Parameter> parameters = new ArrayList<>();

		for(Argument col : Util.safeIterable(inputs)) {
			arguments.add(col);
			ReportDataSource.Parameter parameter = new ReportDataSource.Parameter();
			parameter.setArgument(col.getName());
			parameters.add(parameter);
		}

		arguments.sort(Comparator.comparing(Argument::getName));

		signature.setArguments(arguments);
		dataSource.setQueryParameters(parameters);

		reportTaskDef.setSignature(signature);

		return reportTaskDef;
	}

	@GET
	@Path("filter/translate")
	public Response translateFilter(@QueryParam("query") String filterString, @QueryParam("queryClass") String typeClass) {
		return handle(() -> {
			Map<String, Object> result = new HashMap<>();
			if (Util.isNullOrEmpty(typeClass)) {
				throw new IllegalArgumentException("A type class is required");
			}
			if (Util.isNullOrEmpty(filterString)) {
				throw new IllegalArgumentException("A filter string is required");
			}
			try {
				Class<SailPointObject> targetClass = ObjectUtil.getSailPointClass(typeClass);
				if (targetClass == null) {
					throw new IllegalArgumentException("Specified type class " + typeClass + " is invalid");
				}
				Filter target;
				if (filterString.trim().startsWith("<")) {
					Object parsed = AbstractXmlObject.parseXml(getContext(), filterString);
					if (parsed instanceof Filter) {
						target = (Filter)parsed;
					} else {
						throw new IllegalArgumentException("The input must be an XML Filter or a Filter string");
					}
				} else {
					target = Filter.compile(filterString);
				}
				HibernatePersistenceManager manager = HibernatePersistenceManager.getHibernatePersistenceManager(getContext());
				Method visitHQLFilter = manager.getClass().getDeclaredMethod("visitHQLFilter", Class.class, QueryOptions.class, List.class);
				visitHQLFilter.setAccessible(true);
				try {
					manager.startTransaction();
					try {
						ExtendedAttributeVisitor extendedAttributeVisitor = new ExtendedAttributeVisitor(targetClass);
						target.accept(extendedAttributeVisitor);
						QueryOptions qo = new QueryOptions();
						qo.addFilter(target);

						Method optimize = manager.getClass().getDeclaredMethod("optimize", QueryOptions.class);
						optimize.setAccessible(true);
						try {
							optimize.invoke(manager, qo);
						} finally {
							optimize.setAccessible(false);
						}

						List<String> cols = new ArrayList<>();
						cols.add("id");
						cols.add("name");
						Filter.BaseFilterVisitor visitor = (Filter.BaseFilterVisitor) visitHQLFilter.invoke(manager, targetClass, qo, cols);
						Method getQueryString = visitor.getClass().getDeclaredMethod("getQueryString");
						getQueryString.setAccessible(true);
						try {
							String resultingQuery = (String) getQueryString.invoke(visitor);
							result.put("query", resultingQuery);
							try {
								HibernateAdapter adapter = getHibernateAdapter();
								result.put("sql", adapter.convertToSql(resultingQuery));
							} catch(Exception e) {
								// Ignore this
								// TODO make this work in Hibernate 5+ (IIQ 8.1+)
							}
						} finally {
							getQueryString.setAccessible(false);
						}

						result.put("filter", target.getExpression(true));
						result.put("xmlFilter", target.toXml());

						Method getParameterMap = visitor.getClass().getDeclaredMethod("getParameterMap");
						getParameterMap.setAccessible(true);
						try {
							@SuppressWarnings("unchecked")
							Map<String, Object> paramMap = (Map<String, Object>) getParameterMap.invoke(visitor);
							result.put("params", paramMap);
						} finally {
							getParameterMap.setAccessible(false);
						}
					} catch (InvocationTargetException e) {
						if (e.getTargetException() instanceof GeneralException) {
							throw (GeneralException) e.getTargetException();
						} else {
							throw new GeneralException(e.getTargetException());
						}
					} catch (IllegalAccessException | IllegalArgumentException e) {
						throw new GeneralException(e);
					} finally {
						manager.commitTransaction();
					}
				} finally {
					visitHQLFilter.setAccessible(false);
				}
			} catch(NoSuchMethodException | SecurityException e1){
				throw new GeneralException(e1);
			}
			return result;
		});
	}

	@GET
	@Path("hql/translate")
	public Response translateHQL(@QueryParam("query") String hqlQuery) {
		return handle(() -> {
			Map<String, Object> result = new HashMap<>();

			result.put("query", hqlQuery);
			try {
				HibernateAdapter adapter = getHibernateAdapter();
				result.put("sql", adapter.convertToSql(hqlQuery));
			} catch(Exception e) {
				// Ignore this
				// TODO make this work in Hibernate 5+ (IIQ 8.1+)
			}
			return result;
		});
	}

}
