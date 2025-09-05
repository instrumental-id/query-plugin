import {
    Component,
    inject, model,
    OnInit,
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

    ready: WritableSignal<boolean> = model(false);

    state: ApplicationState = inject(ApplicationState);

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
}
