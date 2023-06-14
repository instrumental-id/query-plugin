package com.identityworksllc.iiq.plugins.queryplugin;

import com.identityworksllc.iiq.common.minimal.Utilities;
import org.apache.commons.collections4.map.ListOrderedMap;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import sailpoint.object.Attributes;
import sailpoint.object.SailPointObject;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

/**
 * A wrapper around code for different Hibernate versions. IIQ 7.x uses Hibernate 3, while IIQ 8+
 * uses Hibernate 5. Future versions of IIQ may require additional implementations.
 *
 * This is needed because Hibernate changed the ASTQueryTranslatorFactory API between versions.
 * Unfortunately, since we can't include a specific Hibernate JAR at the top level, there is
 * some code duplication in the 'h3' and 'h5' versions of this class.
 */
public abstract class HibernateAdapter {
    /**
     * The number of rows to limit the query to
     */
    protected int limitRows;

    /**
     * A logger
     */
    protected final Log log;

    /**
     * The row number to start at
     */
    protected int startAt;

    /**
     * The timeout (in seconds) for the query execution
     */
    protected int timeout;

    public HibernateAdapter() {
        this.log = LogFactory.getLog(this.getClass());
    }

    /**
     * Adds the item to the list if it's missing
     * @param list The list to add the item to
     * @param newValue The new value to add
     */
    protected static void addIfMissing(List<String> list, String newValue) {
        if (!list.contains(newValue)) {
            list.add(newValue);
        }
    }


    public abstract String convertToSql(String hql);

    /**
     * Transforms a single result item into a 'row', which will be inserted into the 'results' list.
     *
     * Depending on the object types returned, the list of 'finalColumns' may also be modified. Any
     * Attributes objects encountered will be inflated, so that the result row will contain each
     * individual attribute, rather than the single Attributes XML.
     *
     * @param results The 'results' to which this item should be appended
     * @param finalColumns The output list of columns that gets returned to the API caller. This may be modified here depending on what the query actually returns.
     * @param queryColumns The column names expected from Hibernate, including aliases (e.g., 'X as Y' in the query)
     * @param item The actual output item being processed, which may be a variety of things depending on the query
     */
    protected void handleResultItem(List<Map<String, Object>> results, List<String> finalColumns, String[] queryColumns, Object item) {
        if (item instanceof SailPointObject) {
            ListOrderedMap<String, Object> resultRow = new ListOrderedMap<>();
            resultRow.put("name", ((SailPointObject) item).getName());
            resultRow.put("id", ((SailPointObject) item).getId());
            addIfMissing(finalColumns, "id");
            addIfMissing(finalColumns, "name");
            try {
                Map<String, Object> attributes = Utilities.getAttributes(item);
                if (attributes != null) {
                    for (String key : attributes.keySet()) {
                        addIfMissing(finalColumns, key);
                    }
                    resultRow.putAll(attributes);
                }
            } catch(Exception e) {
                /* Don't bother */
            }
            results.add(resultRow);
        } else if (item instanceof Object[]) {
            Object[] row = (Object[]) item;
            Map<String, Object> resultRow = new ListOrderedMap<>();
            for(int i = 0; i < row.length; i++) {
                String alias = String.valueOf(i);
                if (i < queryColumns.length) {
                    alias = queryColumns[i];
                }
                Object itemObject = row[i];
                if (itemObject instanceof Attributes) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> attributes = (Map<String, Object>) itemObject;
                    for(String key : attributes.keySet()) {
                        addIfMissing(finalColumns, key);
                    }
                    resultRow.putAll(attributes);
                } else {
                    resultRow.put(alias, itemObject);
                    addIfMissing(finalColumns, alias);
                }
            }
            results.add(resultRow);
        } else if (item instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> itemMap = (Map<String, Object>) item;
            results.add(itemMap);
            for(Object key : ((Map<?, ?>) item).keySet()) {
                addIfMissing(finalColumns, String.valueOf(key));
            }
        } else {
            Map<String, Object> resultRow = new ListOrderedMap<>();
            if (queryColumns.length > 0) {
                resultRow.put(queryColumns[0], item);
                addIfMissing(finalColumns, queryColumns[0]);
            } else {
                addIfMissing(finalColumns, "result");
                resultRow.put("result", item);
            }
            results.add(resultRow);
        }
    }

    /**
     * Replace all non-word characters with underscores
     * @param pathText The path text
     * @return The name in identifier format
     */
    protected String identifierify(String pathText) {
        return pathText.replaceAll("\\W", "_");
    }

    /**
     * Executes the given Hibernate query, given the input set of named parameters,
     * and appends the output to the finalResults list.
     *
     * @param query the HQL query
     * @param namedParams The named parameter inputs
     * @param finalResults The list to which the result row data should be appended.
     * @param finalColumns The list of columns that will be returned to the end user. This method is encouraged to modify the list so that the output is presented properly.
     * @throws Exception on errors
     */
    public abstract void runHibernateQuery(String query, Map<String, Object> namedParams, List<Map<String, Object>> finalResults, List<String> finalColumns) throws Exception;

    /**
     * Sets the limit rows to the given value
     * @param limitRows The limit rows
     */
    public void setLimitRows(int limitRows) {
        this.limitRows = limitRows;
    }

    /**
     * Sets the row to start at
     * @param startAt The row to start at
     */
    public void setStartAt(int startAt) {
        this.startAt = startAt;
    }

    /**
     * Sets the timeout to the given number of seconds
     * @param timeout The timeout in seconds
     */
    public void setTimeout(int timeout) {
        this.timeout = timeout;
    }
}
