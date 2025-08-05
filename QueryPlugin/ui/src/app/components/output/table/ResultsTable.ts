import {
    Component, computed, effect,
    inject,
    signal,
    Signal,
    WritableSignal
} from '@angular/core';
import {EventBus, QUERY_COMPLETED} from "../../../services/EventBus";
import {NgClass} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {NgbPagination} from "@ng-bootstrap/ng-bootstrap";
import {RunQueryResponse} from "../../../services/API";

@Component({
  selector: 'results-table',
    imports: [
        NgClass,
        FormsModule,
        NgbPagination
    ],
  templateUrl: './ResultsTable.html',
  styleUrl: './ResultsTable.scss',
})
export class ResultsTable {

    columns: Signal<string[]> = computed(() => {
        let r = this.results();
        return r ? r.columns : [];
    });

    empty: Signal<boolean> = computed(() => {
        let localResults = this.results();
        let rows = localResults ? localResults.rows : [];
        return rows.length === 0
    });

    filteredRows: WritableSignal<any[]> = signal([]);

    filters: WritableSignal<{ [key: string]: string }> = signal({});

    pageContents: Signal<any[]> = computed(() => this.getRowsForPage());

    _pageIndex: WritableSignal<number> = signal(0);

    _pageSize: WritableSignal<number> = signal(10);

    results: WritableSignal<RunQueryResponse | null> = signal(null);

    private readonly eventBus: EventBus = inject(EventBus);


    constructor() {
        this.eventBus.on(QUERY_COMPLETED, (data: RunQueryResponse) => {
            this.pageIndex = 0;
            this.results.set(data);
            this.filters.set({});
            console.log("Query completed:", data);
        });

        effect(() => {
            if (!this.empty()) {
                let needsFilter = false;
                let filters = this.filters();
                for (let key in Object.keys(filters)) {
                    if (filters[key]) {
                        needsFilter = true;
                        break;
                    }
                }
                if (needsFilter) {
                    this.filter();
                }
            }
        })
    }

    /**
     * Filters the results based on the current filter values.
     * @private
     */
    private filter(): void {
        if (this.empty()) {
            return;
        }
        
        // We know it isn't null here
        let results = this.results() as RunQueryResponse;

        let _filters = this.filters();
        
        // Apply filters
        this.filteredRows.set(results.rows.filter(row => {
            return Object.keys(_filters).every(key => {
                const filterValue = _filters[key].toLowerCase();
                if (filterValue) {
                    return row[key] && row[key].toString().toLowerCase().includes(filterValue);
                } else {
                    return true; // No filter applied for this column
                }
            });
        }));
    }

    /**
     * Get the rows for the current page based on the page index and size.
     * @private
     */
    private getRowsForPage() {
        if (this.empty()) {
            return [];
        }

        let rows = this.filteredRows();
        
        let start = this._pageIndex() * this._pageSize();
        let end = start + this._pageSize();

        if (start >= rows.length) {
          start = rows.length - this._pageSize();
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
    }

    get pageIndex() {
        return this._pageIndex();
    }

    get pageSize() {
        return this._pageSize();
    }

    set pageIndex(index: number) {
        if (index < 0) {
            index = 0;
        }
        this._pageIndex.set(index);
    }

    set pageSize(size: number) {
        this._pageSize.set(size)
    }


    updateFilter(item: string, $event: any) {
        this.filters.update(filters => {
            filters[item] = $event.target.value;
            return filters;
        });
    }
}
