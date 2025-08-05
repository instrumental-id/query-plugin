import {
    Component,
    inject,
    signal,
    Signal,
    WritableSignal
} from '@angular/core';
import {ResultsTable} from "../table/ResultsTable";
import {NgbPaginationModule} from "@ng-bootstrap/ng-bootstrap";
import {ApplicationState} from "../../../services/ApplicationState";
import {
    EventBus,
    QUERY_COMPLETED,
    TRANSLATE_COMPLETED
} from "../../../services/EventBus";
import {RunQueryResponse, TranslateQueryResponse} from "../../../services/API";
import {TranslationResult} from "../translation-result/translation-result";

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

    resultVariety: WritableSignal<ResultVariety> = signal<ResultVariety>(null);
  
    constructor() {
        this.eventBus.on(QUERY_COMPLETED, (data: RunQueryResponse) => {
            this.resultVariety.set('table');
        });

        this.eventBus.on(TRANSLATE_COMPLETED, (data: TranslateQueryResponse) => {
            this.resultVariety.set('translation');
        });
    }

}
