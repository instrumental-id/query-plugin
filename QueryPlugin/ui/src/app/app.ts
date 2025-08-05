import {Component, inject, OnInit, signal, viewChild} from '@angular/core';
import {FormsModule} from "@angular/forms";
import {BrowserModule} from "@angular/platform-browser";
import {Editor} from "./components/editor/editor/editor";
import {OutputPanel} from "./components/output/panel/output-panel.component";
import {ApplicationState} from "./services/ApplicationState";
import {API, DatabaseInfo} from "./services/API";

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  imports: [
    BrowserModule,
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
      this.state.configuration = config;
    });
    
    this.api.enumerateDatabase().then((databaseInfo: DatabaseInfo) => {
      this.state.databaseInfo = databaseInfo;
    });
  }
}
