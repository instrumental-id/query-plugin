package com.identityworksllc.iiq.plugins.queryplugin.h3;

import antlr.collections.AST;
import com.identityworksllc.iiq.plugins.queryplugin.HibernateAdapter;
import org.hibernate.Query;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.engine.SessionFactoryImplementor;
import org.hibernate.hql.QueryTranslator;
import org.hibernate.hql.QueryTranslatorFactory;
import org.hibernate.hql.antlr.HqlTokenTypes;
import org.hibernate.hql.ast.ASTQueryTranslatorFactory;
import org.hibernate.hql.ast.HqlParser;
import org.hibernate.hql.ast.util.ASTUtil;
import sailpoint.api.SailPointContext;
import sailpoint.persistence.HibernatePersistenceManager;
import sailpoint.tools.GeneralException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * The Hibernate 3.x-friendly version of the HibernateAdapter. The only real differences
 * are:
 *
 * - The QueryTranslatorFactory API is a bit different.
 * - Classes like "Query" are in a different package, with the 3.x versions deprecated in 5.2+.
 */
@SuppressWarnings("unused")
public class HibernateAdapter3 extends HibernateAdapter {
    private final SailPointContext context;

    public HibernateAdapter3(SailPointContext context) {
        this.context = context;
    }

    /**
     * Converts an HQL query to SQL in the local dialect
     * @param hql The HQL query to translate
     * @return The resulting SQL query
     */
    @Override
    public String convertToSql(String hql) {
        Session hibernateSession = HibernatePersistenceManager.getSession(context);
        try {
            SessionFactory sessionFactory = hibernateSession.getSessionFactory();
            if (sessionFactory instanceof SessionFactoryImplementor) {
                SessionFactoryImplementor impl = (SessionFactoryImplementor) sessionFactory;
                QueryTranslatorFactory translatorFactory = new ASTQueryTranslatorFactory();
                QueryTranslator translator = translatorFactory.createQueryTranslator(hql, hql, Collections.EMPTY_MAP, impl);
                translator.compile(Collections.EMPTY_MAP, false);
                return translator.getSQLString();
            }
        } finally {
            hibernateSession.close();
        }
        throw new UnsupportedOperationException("The Hibernate session factory must be a SessionFactoryImplementor for this to work");
    }

    private boolean extractColumnNames(AST ast, List<String> columns) throws GeneralException {
        if (ast == null) {
            throw new GeneralException("The query provided cannot be parsed");
        }
        for ( AST child = ast.getFirstChild(); child != null; child = child.getNextSibling() ) {
            if (child.getType() == HqlTokenTypes.SELECT) {
                extractColumnNamesFromSelect(child, columns);
                return true;
            } else {
                if (extractColumnNames(child, columns)) {
                    break;
                }
            }
        }
        return false;
    }

    private void extractColumnNamesFromSelect(AST selectNode, List<String> columns) {
        int subqueryCount = 0;
        for ( AST child = selectNode.getFirstChild(); child != null; child = child.getNextSibling() ) {
            switch(child.getType()) {
                case HqlTokenTypes.AS:
                    columns.add(ASTUtil.getPathText(ASTUtil.getLastChild(child)));
                    break;
                case HqlTokenTypes.IDENT:
                case HqlTokenTypes.DOT:
                case HqlTokenTypes.COUNT:
                case HqlTokenTypes.MAX:
                case HqlTokenTypes.MIN:
                case HqlTokenTypes.AVG:
                    columns.add(identifierify(ASTUtil.getPathText(child)));
                    break;
                case HqlTokenTypes.QUERY:
                    columns.add("_subquery" + (++subqueryCount));
                    break;
                default:
                    log.warn("Spotted unknown sub-type: " + child.getType() + " " + child.getText());
            }
        }
    }

    @Override
    public void runHibernateQuery(String query, Map<String, Object> namedParams, List<Map<String, Object>> finalResults, List<String> finalColumns) throws Exception {
        try {
            HqlParser parser = HqlParser.getInstance(query);
            parser.statement();

            List<String> columns = new ArrayList<>();
            extractColumnNames(parser.getAST(), columns);

            Session hibernateSession = HibernatePersistenceManager.getSession(context);
            Query hibernateQuery = hibernateSession.createQuery(query);
            hibernateQuery.setFirstResult(startAt);
            if (limitRows > 0) {
                hibernateQuery.setMaxResults(limitRows);
            }

            hibernateQuery.setReadOnly(true);

            if (timeout > 0) {
                hibernateQuery.setTimeout(timeout);
            }

            String[] resultAliases = columns.toArray(new String[0]);
            String[] namedParamNames = hibernateQuery.getNamedParameters();
            if (namedParamNames != null && namedParamNames.length > 0) {
                List<String> missingNamedParams = new ArrayList<>();
                for(String name : namedParamNames) {
                    if (namedParams.containsKey(name)) {
                        hibernateQuery.setParameter(name, namedParams.get(name));
                    } else {
                        missingNamedParams.add(name);
                    }
                }
                if (missingNamedParams.size() > 0) {
                    // Are we missing any named parameters? If so, abort!
                    throw new IllegalArgumentException("Not all named parameters have been set: " + missingNamedParams);
                }
            }

            @SuppressWarnings("unchecked")
            List<Object> results = hibernateQuery.list();
            for(Object item : results) {
                handleResultItem(finalResults, finalColumns, resultAliases, item);
            }

        } catch(org.hibernate.exception.SQLGrammarException e) {
            if (e.getCause() != null) {
                throw (Exception)e.getCause();
            }
        }

    }

}
