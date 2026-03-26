import {
    inject,
    Injectable,
    Signal,
    signal,
    WritableSignal
} from "@angular/core";
import {EventBus} from "./EventBus";
import {Configuration, DatabaseInfo} from "./API";
import {HistoryEntry} from "./HistoryService";

@Injectable(
    {providedIn: 'root'}
)
export class ApplicationState {
    appendResults: boolean = false;

    appendTimestampColumn: boolean = false;

    readonly configuration: WritableSignal<Configuration> = signal<Configuration>({
        applications: [],
        privileges: {}
    });
    
    readonly databaseInfo: Map<string, DatabaseInfo> = new Map<string, DatabaseInfo>();

    readonly history: WritableSignal<HistoryEntry[]> = signal([]);

    readonly ready: WritableSignal<boolean> = signal(false);

    readonly resultsPresent: WritableSignal<Boolean> = signal(false);

    readonly running: WritableSignal<boolean> = signal(false);
}