import {
    Component,
    inject,
    signal,
    Signal, viewChild,
    WritableSignal
} from '@angular/core';
import {ResultsTable} from "../table/ResultsTable";
import {NgbPaginationModule} from "@ng-bootstrap/ng-bootstrap";
import {ApplicationState} from "../../../services/ApplicationState";
import {
    EventBus,
    QUERY_COMPLETED, QUERY_ERROR,
    TRANSLATE_COMPLETED
} from "../../../services/EventBus";
import {RunQueryResponse, TranslateQueryResponse} from "../../../services/API";
import {TranslationResult} from "../translation-result/translation-result";
import {APIError} from "../../../common/APIError";

type ResultVariety = 'table' | 'translation' | null;

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

    resultVariety: WritableSignal<ResultVariety> = signal<ResultVariety>(null);

    state: ApplicationState = inject(ApplicationState);
  
    constructor() {
        this.eventBus.on(QUERY_COMPLETED, (data: RunQueryResponse) => {
            this.resultVariety.set('table');
            this.state.resultsPresent.set(true);
        });

        this.eventBus.on(TRANSLATE_COMPLETED, (data: TranslateQueryResponse) => {
            this.resultVariety.set('translation');
            this.state.resultsPresent.set(true);
        });

        this.eventBus.on(QUERY_ERROR, (event: {error: Error}) => {
            this.resultVariety.set(null);

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

}
