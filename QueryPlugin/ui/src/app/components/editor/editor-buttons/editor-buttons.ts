import {Component, inject, input, InputSignal, output} from '@angular/core';
import {ApplicationState} from "../../../services/ApplicationState";
import {QueryType} from "../../../services/API";

@Component({
  selector: 'editor-buttons',
  imports: [],
  templateUrl: './editor-buttons.html',
  styleUrl: './editor-buttons.scss'
})
export class EditorButtons {
  executeQuery = output<void>()
  clearQuery = output<void>()
  executeTranslate = output<void>()
  executeFormat = output<void>()

  queryType: InputSignal<QueryType> = input.required<QueryType>()

  readonly state: ApplicationState = inject(ApplicationState)

  doExecuteQuery() {
    this.executeQuery.emit()
  }

  doClearQuery() {
    this.clearQuery.emit()
  }

  doFormat() {
    this.executeFormat.emit()
  }

  doExecuteTranslate() {
    this.executeTranslate.emit()
  }
}
