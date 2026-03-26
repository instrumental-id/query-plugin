import {
    Component,
    input, InputSignal
} from '@angular/core';
import {ResultsTable} from "../table/ResultsTable";
import {NgbPaginationModule} from "@ng-bootstrap/ng-bootstrap";
import {TranslationResult} from "../translation-result/translation-result";
import {OutputPanelState} from "../output-panel/output-panel.component";

@Component({
  selector: 'output-panel-stashed',
    imports: [
        ResultsTable,
        NgbPaginationModule,
        TranslationResult
    ],
  templateUrl: './output-panel-stashed.component.html',
  styleUrl: '../output-panel/output-panel.component.scss'
})
export class OutputPanelStashedComponent {
    stashedState: InputSignal<OutputPanelState | null> = input.required<OutputPanelState | null>();
}
