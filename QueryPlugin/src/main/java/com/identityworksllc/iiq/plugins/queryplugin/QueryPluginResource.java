package com.identityworksllc.iiq.plugins.queryplugin;

import com.identityworksllc.iiq.common.Utilities;
import com.identityworksllc.iiq.common.iterators.ResultSetIterator;
import com.identityworksllc.iiq.common.plugin.BaseCommonPluginResource;
import com.identityworksllc.iiq.plugins.queryplugin.shared.ConnectorConnectionLoader;
import com.identityworksllc.iiq.plugins.queryplugin.tools.EmbeddedJarClassloader;
import com.identityworksllc.iiq.plugins.queryplugin.tools.PluginConnectorClassloader;
import com.identityworksllc.iiq.plugins.queryplugin.vo.ConfigurationOutput;
import com.identityworksllc.iiq.plugins.queryplugin.vo.MergeMapsConfig;
import com.identityworksllc.iiq.plugins.queryplugin.vo.RunQueryInput;
import com.identityworksllc.iiq.plugins.queryplugin.vo.TranslateFilterOutput;
import org.apache.commons.collections4.map.ListOrderedMap;
import sailpoint.api.DynamicValuator;
import sailpoint.api.IncrementalObjectIterator;
import sailpoint.api.ObjectUtil;
import sailpoint.api.SailPointContext;
import sailpoint.api.SailPointFactory;
import sailpoint.authorization.UnauthorizedAccessException;
import sailpoint.connector.ConnectorClassLoaderUtil;
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

import javax.ws.rs.Consumes;
import javax.ws.rs.DefaultValue;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.QueryParam;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.function.BiFunction;
import java.util.zip.GZIPInputStream;

import static com.identityworksllc.iiq.plugins.queryplugin.HibernateAdapter.addIfMissing;

/**
 * The primary plugin resource, used for running and translating queries
 */
@RequiredRight("IDW_SP_QueryRunner")
@Path("IDWQueryPlugin")
@Produces(MediaType.APPLICATION_JSON)
@SuppressWarnings("unused")
public class QueryPluginResource extends BaseCommonPluginResource {

	public static final String PLUGIN_NAME = "IDWQueryPlugin";
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
	private void audit(String query, QueryType type, String application) throws GeneralException {
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
				@SuppressWarnings("unchecked")
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
		return PLUGIN_NAME;
	}

	@Override
	protected boolean isAllowedOutput(Object response) {
		return (super.isAllowedOutput(response) || response instanceof ConfigurationOutput || response instanceof TranslateFilterOutput);
	}

	/**
	 * Gets the UI configuration for this user
	 * @return the UI configuration {@link ConfigurationOutput}
	 */
	@GET
	@Path("configuration")
	public Response getConfiguration() {
		return handle(() -> {
			ConfigurationOutput results = new ConfigurationOutput();

			Identity.CapabilityManager capabilityManager = getLoggedInUser().getCapabilityManager();

			if (capabilityManager.hasRight("IDW_SP_QueryRunner_Application") || capabilityManager.hasCapability("SystemAdministrator")) {
				QueryOptions qo = new QueryOptions();
				qo.addFilter(Filter.eq("type", "JDBC"));

				List<String> fields = new ArrayList<>();
				fields.add("name");

				Set<String> appNames = new TreeSet<>();
				Iterator<Object[]> searchResults = getContext().search(Application.class, qo, fields);

				while(searchResults.hasNext()) {
					Object[] row = searchResults.next();
					String name = (String) row[0];

					appNames.add(name);
				}

				results.getApplications().addAll(appNames);
				results.getPrivileges().queryApplications = true;
			}


			if (capabilityManager.hasRight("IDW_SP_QueryRunner_ReportSave") || capabilityManager.hasCapability("SystemAdministrator")) {
				results.getPrivileges().saveReports = true;
			}

			return results;
 		});
	}

	/**
	 * REST API entry point for the Query API. Executes the given query and then
	 * returns the results.
	 *
	 * @param json The JSON body of the HTTP POST
	 * @return The JSON output, containing query results and other metadata
	 */
	@SuppressWarnings({ "unchecked" })
	@POST
	@Path("query")
	@Consumes(MediaType.APPLICATION_JSON)
	public Response getResults(Map<String, Object> json) {
		return handle(() -> {
			if (json == null) {
				throw new IllegalArgumentException("A JSON body is mandatory for this REST endpoint");
			}

			RunQueryInput payload = QueryPluginUtil.decodeMap(json, RunQueryInput.class);

			payload.validate(getContext());

			QueryType type = payload.getType();
			String query = payload.getQuery();
			String application = payload.getApplication();
			Map<String, Object> namedParams = payload.getNamedParams();

			audit(query, type, application);

			Map<String, Object> resultSet = new HashMap<>();
			List<Map<String, Object>> queryResults = new ArrayList<>();
			List<String> finalColumns = new ArrayList<>();
			if (type.equals(QueryType.HQL) && query.toLowerCase().contains(" union all ")) {
				String[] queries = query.split("(?i) union all ");
				for (String subset : queries) {
					runQuery(subset.trim(), namedParams, type, application, queryResults, finalColumns);
				}
			} else if (type.equals(QueryType.XMLFilter) || type.equals(QueryType.Filter)) {
				String objectType = payload.getQueryClass();
				Class<SailPointObject> spoClass = ObjectUtil.getSailPointClass(objectType);
				Filter f;
				if (type.equals(QueryType.XMLFilter)) {
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
					ListOrderedMap<String, Object> resultRow = new ListOrderedMap<>();
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
	private List<Map<String, Object>> mergeMaps(RunQueryInput payload, List<Map<String, Object>> initialResults) throws GeneralException {
		List<Map<String, Object>> mergedResults = initialResults;
		MergeMapsConfig config = payload.getMergeMaps();


		String mergeRuleName = (config != null) ? config.getRuleName() : null;
		String mergeScript = (config != null) ? config.getScript() : null;

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
	private void runQuery(String query, Map<String, Object> namedParams, QueryType type, String applicationName, List<Map<String, Object>> finalResults, List<String> finalColumns) throws Exception {
		if (type.equals(QueryType.HQL)) {
			HibernateAdapter adapter = getHibernateAdapter();
			adapter.setLimitRows(limitRows);
			adapter.setStartAt(startAt);
			adapter.runHibernateQuery(query, namedParams, finalResults, finalColumns);
		} else if (type.equals(QueryType.Application) || type.equals(QueryType.SQL) || type.equals(QueryType.SQLPlugin) || type.equals(QueryType.SQLAccessHistory)) {
			Connection connection = null;
			if (type.equals(QueryType.Application)) {
				if (Util.isNullOrEmpty(applicationName)) {
					throw new IllegalArgumentException("An application name is required for queries of type Application");
				}

				Identity.CapabilityManager capabilityManager = getLoggedInUser().getCapabilityManager();

				if (!(capabilityManager.hasRight("IDW_SP_QueryRunner_Application") || capabilityManager.hasCapability("SystemAdministrator"))) {
					throw new UnauthorizedAccessException("Access denied to run Application queries");
				}

				Application application = getContext().getObjectByName(Application.class, applicationName);
				if (application == null) {
					throw new IllegalArgumentException("No such application: " + applicationName);
				}
				if (!"JDBC".equals(application.getType())) {
					throw new IllegalArgumentException("Application " + applicationName + " is not of type JDBC");
				}

				ClassLoader classloader = ConnectorClassLoaderUtil.getConnectorClassLoader(application);
				EmbeddedJarClassloader magicLoader = new EmbeddedJarClassloader(classloader);

				BiFunction<SailPointContext, Application, Connection> loader = (BiFunction<SailPointContext, Application, Connection>) Class.forName("com.identityworksllc.iiq.plugins.queryplugin.connector.ConnectorAdapter", true, magicLoader).getConstructor().newInstance();

				connection = loader.apply(getContext(), application);
			} else if (type.equals(QueryType.SQL)) {
				connection = Environment.getEnvironment().getSpringDataSource().getConnection();
			} else if (type.equals(QueryType.SQLAccessHistory)) {
				try {
					Class<Environment> environmentClass = Environment.class;

					// This is only present in 8.4 or higher
					Method staticGetter = environmentClass.getMethod("getEnvironmentAccessHistory");

					Environment ahEnvironment = (Environment) staticGetter.invoke(null);

					connection = ahEnvironment.getSpringDataSource().getConnection();
				} catch(Exception e) {
					throw new GeneralException("Could not retrieve Access History connection", e);
				}
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
	private void runSQLQuery(Connection connection, String query, QueryType type, List<Map<String, Object>> finalResults) throws SQLException, GeneralException {
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
						String rawColName = rsmd.getColumnName(col);
						String colName = rsmd.getColumnLabel(col);
						int colTypeCode = rsmd.getColumnType(col);

						ResultSetIterator.ColumnOutput columnOutput = ResultSetIterator.extractColumnValue(results, colName, colTypeCode);
						Object value = columnOutput.getValue();

						if (rawColName.equals("json") && value instanceof String && Util.otoa(value).startsWith("H4sI")) {
							String zippedString = Util.otoa(value);
							byte[] decoded = Base64.getDecoder().decode(zippedString);

							String result;

							try (GZIPInputStream gzipStream = new GZIPInputStream(new ByteArrayInputStream(decoded))) {
								byte[] data = gzipStream.readAllBytes();

								// This is actually a serialized Java object, but we do NOT want to
								// allow the plugin to deserialize arbitrary objects from the DB for
								// security reasons. Fortunately, a serialized String is just the
								// UTF-8 bytes plus a 7-byte header (ac ed 00 05 74 <two byte length>).
								byte[] removedHeader = new byte[data.length - 7];
								System.arraycopy(data, 7, removedHeader, 0, removedHeader.length);

								// This is the JSON at this point.
								// TODO handle rendering of patch or full image JSON
								value = new String(removedHeader, StandardCharsets.UTF_8);

							} catch(IOException e) {
								log.warn("Unable to read GZIP stream from column 'json'", e);
							}
						} else if (Util.isNotNullOrEmpty(columnOutput.getDerivedType())) {
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

	@GET
	@Path("filter/translate")
	public Response translateFilter(@QueryParam("query") String filterString, @QueryParam("queryClass") String typeClass) {
		return handle(() -> {
			TranslateFilterOutput result = new TranslateFilterOutput();
			if (Util.isNullOrEmpty(typeClass)) {
				throw new IllegalArgumentException("A type class is required");
			}
			if (Util.isNullOrEmpty(filterString)) {
				throw new IllegalArgumentException("A filter string is required");
			}
			try {
				@SuppressWarnings("unchecked")
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
							String hqlQuery = (String) getQueryString.invoke(visitor);
							result.setQuery(hqlQuery);
							try {
								HibernateAdapter adapter = getHibernateAdapter();
								result.setSql(adapter.convertToSql(hqlQuery));
							} catch(Exception e) {
								log.debug("Caught an error converting HQL to SQL", e);
							}
						} finally {
							getQueryString.setAccessible(false);
						}

						result.setFilter(target.getExpression(true));
						result.setXmlFilter(target.toXml());

						Method getParameterMap = visitor.getClass().getDeclaredMethod("getParameterMap");
						getParameterMap.setAccessible(true);
						try {
							@SuppressWarnings("unchecked")
							Map<String, Object> paramMap = (Map<String, Object>) getParameterMap.invoke(visitor);
							if (paramMap != null) {
								result.getParams().putAll(paramMap);
							}
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
