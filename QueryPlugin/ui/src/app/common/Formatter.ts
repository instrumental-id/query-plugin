import { format } from 'sql-formatter';
import xmlFormat from 'xml-formatter';

export class Formatter {
    formatSql(sql: string | undefined, params: any = null): string {
        if (!sql) {
            return '';
        }

        if (params) {
            return format(sql, { language: 'mysql', paramTypes: { named: [':'], positional: true }, params: params });
        } else {
            return format(sql, { language: 'mysql', paramTypes: { named: [':'], positional: true } });
        }
    }

    formatXml(xml: string | undefined): string {
        if (!xml) {
            return '';
        }
        return xmlFormat(xml);
    }
}