import {
    Component,
    inject,
    signal,
    Signal,
    viewChild,
    WritableSignal
} from '@angular/core';
import {ResultsTable} from "../table/ResultsTable";
import {NgbPaginationModule} from "@ng-bootstrap/ng-bootstrap";
import {ApplicationState} from "../../../services/ApplicationState";
import {
    EventBus,
    QUERY_COMPLETED,
    QUERY_ERROR,
    TRANSLATE_COMPLETED
} from "../../../services/EventBus";
import {RunQueryResponse, TranslateQueryResponse} from "../../../services/API";
import {TranslationResult} from "../translation-result/translation-result";
import {APIError} from "../../../common/APIError";

export type ResultVariety = 'table' | 'translation' | null;

export interface OutputPanelState {
    errorMessage: string | null;

    resultsTable: RunQueryResponse | null;

    resultVariety: ResultVariety;

    translationResult: TranslateQueryResponse | null;
}

@Component({
  selector: 'output-panel',
    imports: [
        ResultsTable,
        NgbPaginationModule,
        TranslationResult
    ],
  templateUrl: './output-panel.component.html',
  styleUrl: './output-panel.component.scss'
})
export class OutputPanel {
    private eventBus = inject(EventBus);

    errorMessage: WritableSignal<string | null> = signal<string | null>(null);

    resultsTable: Signal<ResultsTable | undefined> = viewChild(ResultsTable);

    resultsTableData: WritableSignal<RunQueryResponse | null> = signal<RunQueryResponse | null>(null);

    resultVariety: WritableSignal<ResultVariety> = signal<ResultVariety>(null);

    translationResultData: WritableSignal<TranslateQueryResponse | null> = signal<TranslateQueryResponse | null>(null);

    state: ApplicationState = inject(ApplicationState);
  
    constructor() {
        this.eventBus.on(QUERY_COMPLETED, (data: RunQueryResponse) => {
            this.handleNewData(data);
        });

        this.eventBus.on(TRANSLATE_COMPLETED, (data: TranslateQueryResponse) => {
            this.resultVariety.set('translation');
            this.state.resultsPresent.set(true);
            this.resultsTableData.set(null);
            this.translationResultData.set(data);
        });

        this.eventBus.on(QUERY_ERROR, (event: {error: Error}) => {
            this.resultVariety.set(null);
            this.resultsTableData.set(null);
            this.translationResultData.set(null);

            let exception = event.error;
            if (exception instanceof APIError) {
                let contents = exception.content;
                if (contents) {
                    if (contents.startsWith("{")) {
                        let jsonContents = JSON.parse(contents);
                        this.errorMessage.set(jsonContents.message)
                    } else {
                        this.errorMessage.set(contents);
                    }
                }
            } else {
                this.errorMessage.set(exception.message);
            }

            this.state.resultsPresent.set(true);
        })
    }

    /**
     * Get the current output panel state, used for pinning the output
     */
    get outputState(): OutputPanelState {
        return {
            errorMessage: this.errorMessage(),
            resultsTable: this.resultsTableData(),
            translationResult: this.translationResultData(),
            resultVariety: this.resultVariety()
        };
    }

    private handleNewData(data: RunQueryResponse) {
        console.info("New query results received in OutputPanel:", data);

        this.resultVariety.set('table');
        this.state.resultsPresent.set(true);
        this.translationResultData.set(null);

        if (this.state.appendTimestampColumn) {
            console.info("Appending $timestamp column to results as per user request.");

            if (!data.columns.includes('$timestamp')) {
                data.columns.unshift('$timestamp');
                for(let row of data.data) {
                    row.$timestamp = new Date().toISOString();
                }
            }
        }

        if (this.state.appendResults) {
            let currentData = this.resultsTableData();
            if (currentData && currentData.columns && currentData.data) {
                console.info("Merging new results with existing results as per user request.");

                let newColumns = data.columns.filter(col => !currentData!.columns!.includes(col));
                let combinedColumns = currentData.columns.concat(newColumns);

                console.debug("New, old, combined columns:", data.columns, currentData.columns, combinedColumns);

                let newRows = data.data.concat(currentData.data);

                let newData: RunQueryResponse = {
                    executionOrder: currentData.executionOrder + 1,
                    columns: combinedColumns,
                    data: newRows,
                    elapsed: data.elapsed,
                    host: data.host,
                    query: data.query
                };

                this.resultsTableData.set(newData);
            } else {
                this.resultsTableData.set(data);
            }
        } else {
            this.resultsTableData.set(data);
        }
    }

}
