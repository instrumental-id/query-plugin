package com.identityworksllc.iiq.plugins.queryplugin.reporting;

import com.identityworksllc.iiq.common.plugin.BaseCommonPluginResource;
import com.identityworksllc.iiq.plugins.queryplugin.QueryPluginUtil;
import com.identityworksllc.iiq.plugins.queryplugin.reporting.vo.ArgumentSpec;
import com.identityworksllc.iiq.plugins.queryplugin.reporting.vo.ColumnSpec;
import com.identityworksllc.iiq.plugins.queryplugin.reporting.vo.QueryReportSpec;
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
import sailpoint.object.Argument;
import sailpoint.object.LiveReport;
import sailpoint.object.ReportColumnConfig;
import sailpoint.object.ReportDataSource;
import sailpoint.object.Signature;
import sailpoint.object.TaskDefinition;
import sailpoint.object.TaskItemDefinition;
import sailpoint.rest.plugin.RequiredRight;
import sailpoint.tools.GeneralException;
import sailpoint.tools.Util;

import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.core.Response;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

@Path("IDWQueryPlugin/report")
public class SaveReportResource extends BaseCommonPluginResource {

    /**
     * Extracts the select statement from the given query
     * @param validation The parsed query
     * @return The select statement, if one exists
     * @throws GeneralException if there are any problems validating the query, or if it is not a select statement
     */
    private static Select getSelectStatement(Validation validation) throws GeneralException {
        List<ValidationError> errors = validation.validate();
        if (errors.size() > 0) {
            throw new GeneralException("Unable to validate SQL query: " + errors);
        }
        Statements statementsObj = validation.getParsedStatements();

        List<Statement> statements = statementsObj.getStatements();
        if (statements == null || statements.size() != 1) {
            throw new IllegalArgumentException("Unable to validate SQL query: the input SQL must resolve to a single statement");
        }

        return (Select)statements.get(0);
    }

    /**
     * Derives the query {@link ColumnSpec} data from the query itself
     * @param json The input spec, including at least the query
     * @return The same object as the input, only modified to include {@link ColumnSpec}s
     */
    @POST
    @Path("columns")
    public Response deriveQueryColumns(Map<String, Object> json) {
        return handle(() -> {
            if (json == null) {
                throw new GeneralException("A JSON body is required");
            }

            QueryReportSpec spec = QueryPluginUtil.decodeMap(json, QueryReportSpec.class);

            if (Util.isNullOrEmpty(spec.getSql())) {
                throw new GeneralException("Invalid report SQL: [" + spec.getSql() + "]");
            }

            Validation validation = new Validation(Collections.singletonList(FeaturesAllowed.SELECT), spec.getSql());
            Select selectStatement = getSelectStatement(validation);

            List<ColumnSpec> columns = new ArrayList<>();
            Set<String> uniqueNames = new HashSet<>();
            AtomicInteger uniquifier = new AtomicInteger(1);

            if (selectStatement.getSelectBody() instanceof PlainSelect) {
                for (SelectItem selectItem : Util.safeIterable(((PlainSelect) selectStatement.getSelectBody()).getSelectItems())) {
                    selectItem.accept(new SelectItemVisitorAdapter() {
                        @Override
                        public void visit(SelectExpressionItem item) {
                            String alias = item.getAlias().getName();
                            ColumnSpec spec = new ColumnSpec();
                            spec.setName(alias);
                            spec.setDisplayName(alias);

                            String uniqueName = alias;

                            if (uniqueNames.contains(uniqueName)) {
                                uniqueName = uniqueName + uniquifier.getAndIncrement();
                            }

                            uniqueNames.add(uniqueName);
                            spec.setUniqueName(uniqueName);

                            columns.add(spec);
                        }
                    });
                }
            }

            spec.setColumns(columns);

            return spec;
        });
    }

    @Override
    public String getPluginName() {
        return "IDWQueryPlugin";
    }

    /**
     * Entry point to store the report
     * @param spec The input spec
     * @return The result of the report storage
     */
    @POST
    @RequiredRight("IDW_SP_QuerySaveReport")
    @Path("store")
    public Response saveReport(Map<String, Object> json) {
        return handle(() -> {
            if (json == null) {
                throw new GeneralException("JSON body is required");
            }

            QueryReportSpec spec = QueryPluginUtil.decodeMap(json, QueryReportSpec.class);

            if (Util.isNullOrEmpty(spec.getName())) {
                throw new GeneralException("Invalid report name: [" + spec.getName() + "]");
            }

            if (Util.isNullOrEmpty(spec.getSql())) {
                throw new GeneralException("Invalid report SQL: [" + spec.getSql() + "]");
            }

            TaskDefinition reportTemplate = saveSqlToReport(spec.getName(), spec.getSql(), spec.getArguments(), spec.getColumns());
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
    private TaskDefinition saveSqlToReport(String name, String sql, List<ArgumentSpec> inputs, List<ColumnSpec> columns) throws GeneralException {
        String dataSourceClass = "com.identityworksllc.iiq.jdbcreporting.JDBCDataSource";
        try {
            Class.forName(dataSourceClass);
        } catch(Exception e) {
            throw new GeneralException("The IIQCommon reporting library must be in your WEB-INF/lib before you can create a report via the Query Plugin");
        }

        Validation validation = new Validation(Collections.singletonList(FeaturesAllowed.SELECT), sql);
        Select selectStatement = getSelectStatement(validation);

        List<ReportColumnConfig> columnConfigs = new ArrayList<>();

        if (selectStatement.getSelectBody() instanceof PlainSelect) {
            for (SelectItem selectItem : Util.safeIterable(((PlainSelect) selectStatement.getSelectBody()).getSelectItems())) {
                selectItem.accept(new SelectItemVisitorAdapter() {
                    @Override
                    public void visit(SelectExpressionItem item) {
                        String alias = item.getAlias().getName();
                        ColumnSpec match = null;
                        for(ColumnSpec columnInput : Util.safeIterable(columns)) {
                            if (Util.nullSafeCaseInsensitiveEq(columnInput.getName(), alias)) {
                                match = columnInput;
                                break;
                            }
                        }
                        ReportColumnConfig columnConfig;
                        if (match != null) {
                            try {
                                columnConfig = match.asColumnConfig(getContext());
                            } catch (GeneralException e) {
                                throw new IllegalStateException(e);
                            }
                        } else {
                            columnConfig = new ReportColumnConfig();
                            columnConfig.setField(alias);
                            columnConfig.setHeader(alias);
                            columnConfig.setProperty(alias);
                        }
                        columnConfig.setWidth(110);
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

        for(ArgumentSpec col : Util.safeIterable(inputs)) {
            arguments.add(col.asArgument());
            ReportDataSource.Parameter parameter = new ReportDataSource.Parameter();
            parameter.setArgument(col.getName());
            parameters.add(parameter);
        }

        arguments.sort(Comparator.comparing(Argument::getName));

        signature.setArguments(arguments);
        dataSource.setQueryParameters(parameters);

        // TODO add the Form

        reportTaskDef.setSignature(signature);

        return reportTaskDef;
    }
}
