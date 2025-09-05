import {Injectable} from "@angular/core";

export const SOURCE_UPDATED = "editor.source.updated";

export const SOURCE_REPLACE = "editor.source.replace";

export const QUERY_COMPLETED = "query.completed";

export const QUERY_ERROR = "query.error";

export const TRANSLATE_COMPLETED = "translate.completed";

export const HISTORY_ITEM_SAVED = "history.item.saved";

export const HISTORY_ITEM_LOADED = "history.item.loaded";

export interface SourceUpdatedEvent {
    content: string;
}

@Injectable({  providedIn: 'root',})
export class EventBus {
    private listeners: { [event: string]: ((data?: any) => void)[] } = {};

    on(event: string, listener: (data?: any) => void): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(listener);
    }

    emit(event: string, data?: any): void {
        if (this.listeners[event]) {
            this.listeners[event].forEach(listener => listener(data));
        }
    }
}