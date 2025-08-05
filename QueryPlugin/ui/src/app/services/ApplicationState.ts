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
    configuration!: Configuration;
    
    databaseInfo!: DatabaseInfo;

    history: Signal<HistoryEntry[]> = signal([]);

    running: WritableSignal<Boolean> = signal(false);
}