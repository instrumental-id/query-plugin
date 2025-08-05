
export interface ISailPointStatic {
    CONTEXT_PATH: string;
    
    CURR_DISPLAYABLE_USER_NAME: string;
    
    CURR_USER_ID: string;
    
    CURR_USER_LOCALE: string;
    
    CURR_USER_NAME: string;
    
    REVISION: string;
    
    SESSION_TIMEOUT: string;
    
    SYSTEM_ADMIN: boolean | string;
    
    getBrowserViewArea(): { height: number, width: number }
    
    getCsrfToken(): string;
    
    getRelativeUrl(path: string): string;
    
    sanitizeHtml(html: string): string;
}

/**
 * Shim around Sailpoint's PluginHelper
 */
export interface IPluginHelper {
    addSnippetController(moduleName: string, innerHtml: string, selector: string): void;
    
    addWidgetFunction(func: Function): void;
    
    getCsrfToken(): string;
    
    getCurrentUserId(): string;
    
    getCurrentUsername(): string;
    
    getCurrentUserDisplayableName(): string;
    
    getPluginFileUrl(pluginName: string, pluginPath: string): string;
    
    getPluginRestUrl(path: string): string;
    
    loadWidgetFunctions(): void;
}
