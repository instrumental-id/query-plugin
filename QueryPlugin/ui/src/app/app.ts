import {
    Component, computed,
    inject, model,
    OnInit, resource, ResourceRef, Signal,
    signal,
    viewChild,
    WritableSignal
} from '@angular/core';
import {FormsModule} from "@angular/forms";
import {Editor} from "./components/editor/editor/editor";
import {
    OutputPanel,
    OutputPanelState
} from "./components/output/output-panel/output-panel.component";
import {ApplicationState} from "./services/ApplicationState";
import {API, Configuration} from "./services/API";
import {CommonModule} from "@angular/common";
import {HistoryTable} from "./components/history/history-table/history-table";
import {
    OutputPanelStashedComponent
} from "./components/output/output-panel-stashed/output-panel-stashed.component";
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
        HistoryTable,
        OutputPanelStashedComponent
    ]
})
export class App {
    api: API = inject(API);

    configuration: ResourceRef<Configuration | undefined> = resource({
        loader: () => this.api.getConfiguration()
    })

    /**
     * Signal that disables the "Export to CSV" button when there are no results to export.
     */
    empty: Signal<boolean> = computed(() => {
        let rows = this.outputPanel()?.resultsTable()?.filteredRows()?.length ?? 0;

        return rows < 1
    })

    historyService: HistoryService = inject(HistoryService);

    /**
     * The primary output panel, stored this way to avoid confusion with a future multiple output panels.
     */
    outputPanel: Signal<OutputPanel | undefined> = viewChild("mainOutput");

    ready: WritableSignal<boolean> = model(false);

    resultsPanel = viewChild<HTMLDivElement>("resultsPanel");

    stashedOutputPanel = viewChild<HTMLDivElement>("stashedOutputPanel");

    stashedOutputState: WritableSignal<OutputPanelState | null> = signal<OutputPanelState | null>(null);

    state: ApplicationState = inject(ApplicationState);

    optionsNotDefault: Signal<boolean> = computed(() => {
        return this.outputPanel()?.resultsTable()?.optionsNotDefault() ?? false;
    })

    constructor() {

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

    stashOutputPanelState() {
        let stateToStore = this.outputPanel()?.outputState;
        if (stateToStore) {
            console.debug("Stashing output panel state", stateToStore);
            this.stashedOutputState.set(stateToStore)
            this.resultsPanel()?.querySelector('div.panel-body')?.classList.remove('open');
            this.stashedOutputPanel()?.scrollIntoView({behavior: "smooth"});
        } else {
            console.warn("No output panel state to stash, how did you get here?");
        }
    }
}
