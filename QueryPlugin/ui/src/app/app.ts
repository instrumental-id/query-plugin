import {Component, inject, OnInit, signal, viewChild} from '@angular/core';
import {FormsModule} from "@angular/forms";
import {BrowserModule} from "@angular/platform-browser";
import {Editor} from "./components/editor/editor/editor";
import {OutputPanel} from "./components/output/panel/output-panel.component";
import {ApplicationState} from "./services/ApplicationState";
import {API, DatabaseInfo} from "./services/API";
import {CommonModule} from "@angular/common";

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  imports: [
    CommonModule,
    FormsModule,
    Editor,
    OutputPanel
  ]
})
export class App implements OnInit {
  api: API = inject(API);
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
}
