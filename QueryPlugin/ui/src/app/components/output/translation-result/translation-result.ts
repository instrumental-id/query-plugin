import {
    Component,
    inject, input,
    InputSignal,
    signal,
    WritableSignal
} from '@angular/core';
import {TranslateQueryResponse} from "../../../services/API";
import {FormsModule} from "@angular/forms";
import { Formatter } from '../../../common/Formatter';
import { EventBus } from '../../../services/EventBus';

type DisplayType = 'SQL' | 'HQL' | 'Filter' | 'XMLFilter';

@Component({
    selector: 'translation-result',
    imports: [
        FormsModule
    ],
    templateUrl: './translation-result.html',
    styleUrl: './translation-result.scss'
})
export class TranslationResult {
    displayType: DisplayType;

    private eventBus = inject(EventBus);

    private formatter: Formatter;
    
    translation: InputSignal<TranslateQueryResponse | null | undefined> = input<TranslateQueryResponse | null>();

    constructor() {
        this.displayType = 'SQL';

        this.formatter = new Formatter();
    }

    formatSql(sql: string | undefined, params: boolean = false): string {
        if (!sql) {
            return '';
        }

        let formatted = this.formatter.formatSql(sql, params);
        return formatted.formatted;
    }

    formatXml(xml: string | undefined): string {
        if (!xml) {
            return '';
        }
        return this.formatter.formatXml(xml);
    }
}
