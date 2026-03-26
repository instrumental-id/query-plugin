import {IPluginHelper} from "./Sailpoint";
import {Injectable} from "@angular/core";
import {APIError} from "../common/APIError";

declare var PluginHelper: IPluginHelper;

export type QueryType = "XMLFilter" | "Filter" | "HQL" | "SQL" | "SQLPlugin" | "SQLAccessHistory" | "Application";

export const UUID_FIELD = "__$uuid";

export interface RunQueryRequest {
    application?: string;
    mergeMaps?: {
        ruleName: string;
        script: string;
    };
    namedParams?: { [parameterName: string]: any };
    query: string;
    queryClass?: string;
    type: QueryType;
    startAt?: number;
    limit?: number;
}

export interface Row {
    __$uuid: string;
    $timestamp?: string;
    [columnName: string]: any;
}

export interface RunQueryResponse {
    executionOrder: number;
    columns: string[];
    data: Array<Row>;
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
    table: string;
    schema: string;
    columns: string[];
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

function getCookie(name: string) {
    if (!document.cookie) {
        return null;
    }

    const xsrfCookies = document.cookie.split(';')
        .map(c => c.trim())
        .filter(c => c.startsWith(name + '='));

    if (xsrfCookies.length === 0) {
        return null;
    }
    let cookieValue = xsrfCookies[0].substring(name.length + 1);
    return decodeURIComponent(cookieValue);
}

function randomID() {
    let now = new Date().getMilliseconds()
    return "" + now + Math.random().toString(36);
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
                'X-XSRF-TOKEN': getCookie('CSRF-TOKEN') || PluginHelper.getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest' // To indicate this is an AJAX request
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
    
    async enumerateDatabase(input: Partial<RunQueryRequest>): Promise<DatabaseInfo> {
        const response = await fetch(`${this.baseUrl}/enumerate/database`, {
            method: 'POST',
            headers: {
                'X-XSRF-TOKEN': getCookie('CSRF-TOKEN') || PluginHelper.getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest' // To indicate this is an AJAX request
            },
            body: JSON.stringify({
                type: input.type,
                application: input.application
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
    
    async enumerateTables(input: Partial<RunQueryRequest>): Promise<TableInfo[]> {
        const response = await fetch(`${this.baseUrl}/enumerate/tables`, {
            method: 'POST',
            headers: {
                'X-XSRF-TOKEN': getCookie('CSRF-TOKEN') || PluginHelper.getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest' // To indicate this is an AJAX request
            },
            body: JSON.stringify({
                type: input.type,
                application: input.application
            })
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
                'X-XSRF-TOKEN': getCookie('CSRF-TOKEN') || PluginHelper.getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest' // To indicate this is an AJAX request
            },
            body: JSON.stringify(request)
        });
        if (!response.ok) {
            throw new APIError({
                status: response.status,
                statusText: response.statusText,
                url: url,
                message: `HTTP error! status: ${response.status} ${response.statusText} at ${url}`,
                content: await response.text()
            })
        }

        let results = await response.json() as RunQueryResponse;
        results.executionOrder = 0;
        if (results.data?.length > 0) {
            for (let row of results.data) {
                row.__$uuid = randomID();
            }

            if (results.columns?.length === 0) {
                results.columns = Object.keys(results.data[0]).filter(col => col !== UUID_FIELD);
            }
        }
        return results;
    }

    /**
     * Translates a query or filter into its SQL / HQL / XML equivalents.
     * @param request The request object containing the query and its type.
     */
    async translateQuery(request: RunQueryRequest): Promise<TranslateQueryResponse> {
        let queryParams = new URLSearchParams();
        queryParams.set('query', request.query);

        let url;
        if (request.type === "Filter" || request.type === "XMLFilter") {
            queryParams.set('queryClass', request.queryClass ?? "");
            url = `${this.baseUrl}/filter/translate?${queryParams.toString()}`;
        } else if (request.type === "HQL") {
            url = `${this.baseUrl}/hql/translate?${queryParams.toString()}`;
        } else {
            throw new Error(`Unsupported query type for translation: ${request.type}`);
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-XSRF-TOKEN': getCookie('CSRF-TOKEN') || PluginHelper.getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest' // To indicate this is an AJAX request
            }
        });
        if (!response.ok) {
            throw new APIError({
                status: response.status,
                statusText: response.statusText,
                url: url,
                message: `HTTP error! status: ${response.status} ${response.statusText} at ${url}`,
                content: await response.text()
            })
        }

        return await response.json() as TranslateQueryResponse;
    }
}