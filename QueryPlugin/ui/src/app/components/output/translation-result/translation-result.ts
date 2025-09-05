import {Component, inject, signal, WritableSignal} from '@angular/core';
import {EventBus, TRANSLATE_COMPLETED} from "../../../services/EventBus";
import {TranslateQueryResponse} from "../../../services/API";
import {FormsModule} from "@angular/forms";
import { format } from 'sql-formatter';
import xmlFormat from 'xml-formatter';

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

    translation: WritableSignal<TranslateQueryResponse | null> = signal(null);

    constructor() {
        this.eventBus.on(TRANSLATE_COMPLETED, (data: TranslateQueryResponse) => {
            this.translation.set(data);
        });

        this.displayType = 'SQL';
    }

    formatSql(sql: string | undefined, params: boolean = false): string {
        if (!sql) {
            return '';
        }
        // TODO: Add the param values to the formatting
        if (params) {
            return format(sql, { language: 'mysql', paramTypes: { named: [':'], positional: true }, params: this.translation()?.params });
        } else {
            return format(sql, { language: 'mysql', paramTypes: { named: [':'], positional: true } });
        }
    }

    formatXml(xml: string | undefined): string {
        if (!xml) {
            return '';
        }
        return xmlFormat(xml);
    }
}
