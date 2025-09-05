import {QueryType} from "../services/API";

export interface EditorState {
    content: string;
    
    queryType: QueryType;
    
    application?: string;
    
    rowLimit?: number;
    
    startAt?: number;

    queryClass?: string;
}