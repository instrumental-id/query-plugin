import {
    Component,
    computed,
    inject,
    model,
    Signal,
    signal,
    WritableSignal
} from '@angular/core';
import {HistoryEntry, HistoryService} from "../../../services/HistoryService";
import {
    EventBus,
    HISTORY_ITEM_LOADED,
    HISTORY_ITEM_SAVED
} from "../../../services/EventBus";
import {DatePipe} from "@angular/common";
import {NgbPagination} from "@ng-bootstrap/ng-bootstrap";
import {FormsModule} from "@angular/forms";
import {HighlightSearchPipe} from "../../../common/HighlightPipe";
import {SafeHtmlPipe} from "../../../common/SafeHtml";

import {
    accessibleMotionReduced,
    escapeHTML,
    pulseRow
} from "../../../common/utils";

@Component({
    selector: 'history-table',
    imports: [
        DatePipe,
        NgbPagination,
        FormsModule,
        HighlightSearchPipe,
        SafeHtmlPipe
    ],
    templateUrl: './history-table.html',
    styleUrl: './history-table.scss'
})
export class HistoryTable {

    private eventBus = inject(EventBus);

    private historyService = inject(HistoryService);

    empty: Signal<boolean> = computed(() => {
        return this.size() < 1
    });

    filter = model<string>('');

    filteredRows: Signal<HistoryEntry[]> = computed(() => {
        const filter = this.filter()?.toLowerCase() ?? '';
        if (this.empty()) {
            return [];
        } else {
            // TODO: search by words
            if (filter === '') {
                return this.historyEntries();
            } else {
                return this.historyEntries().filter(entry => {
                    return entry.content.toLowerCase().includes(filter)
                });
            }
        }
    })

    historyEntries: WritableSignal<HistoryEntry[]> = signal([])

    pageIndex = model<number>(1);

    pageSize: Signal<number> = signal(25);

    rowsForPage: Signal<HistoryEntry[]> = computed(() => {
        if (this.empty()) {
            return [];
        }

        let rows = this.filteredRows();

        let shiftedIndex = this.pageIndex() - 1;

        let start = shiftedIndex * this.pageSize();
        let end = start + this.pageSize();

        if (start >= rows.length) {
            start = rows.length - this.pageSize();
        }

        if (end > rows.length) {
            end = rows.length;
        }

        if (start < 0) {
            start = 0;
        }

        if (end < 0) {
            end = 0;
        }

        return rows.slice(start, end);
    });

    size: Signal<number> = computed(() => {
        return this.historyEntries()?.length ?? 0;
    })

    constructor() {
        this.eventBus.on(HISTORY_ITEM_SAVED, () => {
            this.historyService.loadHistory().then(entries => {
                this.historyEntries.set(entries);
            });
        })

        this.historyService.loadHistory().then(entries => {
            this.historyEntries.set(entries);
        })
    }

    loadHistory(event: MouseEvent, entry: HistoryEntry) {
        if (accessibleMotionReduced) {
            let target = event.target as HTMLElement;
            let existing = target.style.background;
            target.style.background = '#ffff99';
            setTimeout(() => {
                target.style.background = existing ?? ''
            }, 300);
        } else {
            let target = event.target as HTMLElement;
            // Find parent tr

            let tr = target.closest('tr');
            if (tr) {
                pulseRow(tr)
            }
        }

        this.eventBus.emit(HISTORY_ITEM_LOADED, entry)
    }

    sanitize(content: string) {
        if (content === null || content === undefined) {
            return '';
        }

        return escapeHTML(content);
    }
}
