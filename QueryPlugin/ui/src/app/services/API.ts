import {IPluginHelper} from "./Sailpoint";
import {Injectable} from "@angular/core";

declare var PluginHelper: IPluginHelper;

export type QueryType = "XMLFilter" | "Filter" | "HQL" | "SQL" | "SQLPlugin" | "SQLAccessHistory" | "Application";

export interface RunQueryRequest {
    application?: string;
    mergeMaps?: {
        ruleName: string;
        script: string;
    };
    namedParams?: { [parameterName: string]: any };
    query: string;
    queryClass?: string;
    queryType: QueryType;
    startAt?: number;
    limit?: number;
}

export interface RunQueryResponse {
    columns: string[];
    rows: any[];
    query?: string;
    elapsed?: number;
    host: string;
}

export interface TranslateQueryResponse {
    filter: string;
    params: { [parameterName: string]: any };
    query: string;
    sql: string;
    xmlFilter: string;
}

export interface Privileges {
    queryApplications: boolean;
    runScripts: boolean;
    saveReports: boolean;
}

export interface Configuration {
    applications: Array<string>;
    privileges: Partial<Privileges>;
}

export interface TableInfo {
    name: string;
    schema: string;
    columns: string[];
}

export interface TableEnumeration {
    [tableName: string]: TableInfo;
}

export interface DatabaseInfo {
    databaseProductName: string;
    databaseVersion: string;
    catalog: string;
    schema: string;
    extraKeywords: string[];
    schemas: { [schemaName: string]: SchemaDefinition };
}

export interface SchemaDefinition {
    tables: Array<string>;
    views: Array<string>;
}

@Injectable({
    providedIn: 'root'
})
export class API {
    
    private baseUrl: string;

    constructor() {
        this.baseUrl = PluginHelper.getPluginRestUrl('IDWQueryPlugin');
    }
    
    async getConfiguration(): Promise<Configuration> {
        const response = await fetch(`${this.baseUrl}/configuration`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': PluginHelper.getCsrfToken()
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
    
    async enumerateDatabase(): Promise<DatabaseInfo> {
        const response = await fetch(`${this.baseUrl}/enumerate/database`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': PluginHelper.getCsrfToken()
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
    
    async enumerateTables(): Promise<TableEnumeration> {
        const response = await fetch(`${this.baseUrl}/enumerate/tables`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': PluginHelper.getCsrfToken()
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
    
    async query(request: RunQueryRequest): Promise<RunQueryResponse> {
        let queryParams = new URLSearchParams()
        if (request.limit) {
            queryParams.set('limit', request.limit?.toString() ?? '200');
        }
        if (request.startAt) {
            queryParams.set('startAt', request.startAt?.toString() ?? '0');
        }
        
        let url = `${this.baseUrl}/query?${queryParams.toString()}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': PluginHelper.getCsrfToken()
            },
            body: JSON.stringify(request)
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json() as RunQueryResponse;
    }

    /**
     * Translates a query or filter into its SQL / HQL / XML equivalents.
     * @param request The request object containing the query and its type.
     */
    async translateQuery(request: RunQueryRequest): Promise<TranslateQueryResponse> {
        let queryParams = new URLSearchParams();
        queryParams.set('query', request.query);

        let url;
        if (request.queryType === "Filter" || request.queryType === "XMLFilter") {
            queryParams.set('queryClass', request.queryClass ?? "");
            url = `${this.baseUrl}/filter/translate?${queryParams.toString()}`;
        } else if (request.queryType === "HQL") {
            url = `${this.baseUrl}/hql/translate?${queryParams.toString()}`;
        } else {
            throw new Error(`Unsupported query type for translation: ${request.queryType}`);
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': PluginHelper.getCsrfToken()
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json() as TranslateQueryResponse;
    }
}