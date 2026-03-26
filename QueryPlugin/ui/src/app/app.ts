import {
    Component, computed,
    effect,
    inject, model,
    OnInit, Signal,
    signal,
    viewChild,
    WritableSignal
} from '@angular/core';
import {FormsModule} from "@angular/forms";
import {BrowserModule} from "@angular/platform-browser";
import {Editor} from "./components/editor/editor/editor";
import {OutputPanel} from "./components/output/panel/output-panel.component";
import {ApplicationState} from "./services/ApplicationState";
import {API, DatabaseInfo} from "./services/API";
import {CommonModule} from "@angular/common";
import {HistoryTable} from "./components/history/history-table/history-table";
import { HistoryService } from './services/HistoryService';

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    styleUrl: './app.scss',
    imports: [
        CommonModule,
        FormsModule,
        Editor,
        OutputPanel,
        HistoryTable
    ]
})
export class App implements OnInit {
    api: API = inject(API);

    /**
     * Signal that disables the "Export to CSV" button when there are no results to export.
     */
    empty: Signal<boolean> = computed(() => {
        let rows = this.outputPanel()?.resultsTable()?.filteredRows()?.length ?? 0;

        return rows < 1
    })

    historyService: HistoryService = inject(HistoryService);

    outputPanel: Signal<OutputPanel | undefined> = viewChild(OutputPanel);

    ready: WritableSignal<boolean> = model(false);

    state: ApplicationState = inject(ApplicationState);

    optionsNotDefault: Signal<boolean> = computed(() => {
        return this.outputPanel()?.resultsTable()?.optionsNotDefault() ?? false;
    })

    constructor() {
        effect(() => {
            if (this.optionsNotDefault()) {
                this.historyService.storeResultOptions({
                    pageSize: this.outputPanel()?.resultsTable()?._pageSize() ?? 25,
                    hideEmptyColumns: this.outputPanel()?.resultsTable()?.hideEmptyColumns() ?? false,
                    hiddenColumns: this.outputPanel()?.resultsTable()?.hiddenColumns() ?? null
                });
            } else {
                this.historyService.storeResultOptions({
                    pageSize: 25,
                    hideEmptyColumns: false,
                    hiddenColumns: null
                });
            }
        })
    }

    ngOnInit() {
        this.api.getConfiguration().then((config) => {
            this.state.configuration.set(config);
        });
        this.state.ready.set(true);
    }

    closeResultsPane() {
        this.state.resultsPresent.set(false);
    }

    collapsePanel(historyPanel: HTMLDivElement) {
        let panelBody = historyPanel.querySelector('div.panel-body') as HTMLDivElement;
        panelBody.classList.toggle('open')
    }


    exportCSV() {
        this.outputPanel()?.resultsTable()?.exportCSV();
    }

    showResultsDisplayOptions() {
        this.outputPanel()?.resultsTable()?.showingDisplayOptions.set(
            !(this.outputPanel()?.resultsTable()?.showingDisplayOptions() ?? false)
        );
    }
}
