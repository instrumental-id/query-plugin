import {
    Component, computed,
    inject, model,
    signal,
    Signal,
    WritableSignal
} from '@angular/core';
import {EventBus, QUERY_COMPLETED} from "../../../services/EventBus";
import {NgClass, NgStyle} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {NgbModal, NgbPagination} from "@ng-bootstrap/ng-bootstrap";
import {RunQueryResponse} from "../../../services/API";
import {ApplicationState} from "../../../services/ApplicationState";
import {ExportOptions, ExportService} from "../../../services/ExportService";

export interface ExportModalOutput {
    filename: string;
    includeHeaders: boolean;
    filteredOnly: boolean;
    columns: Record<string, boolean>;
}


declare var jQuery: any;

@Component({
  selector: 'results-table',
    imports: [
        NgClass,
        FormsModule,
        NgbPagination,
        NgStyle
    ],
  templateUrl: './ResultsTable.html',
  styleUrl: './ResultsTable.scss',
})
export class ResultsTable {

    columns: Signal<string[]> = computed(() => {
        let r = this.results();
        if (r?.columns && r.columns.length > 0) {
            return r.columns;
        } else if (r?.data && r.data.length > 0) {
            // If columns are not provided, infer them from the first row of data
            return Object.keys(r.data[0]);
        }
        return [];
    });

    columnFilter = model<string>('');

    empty: Signal<boolean> = computed(() => {
        let localResults = this.results();
        let rows = localResults?.data ?? []
        return rows.length === 0
    });

    private exportService = inject(ExportService);

    filteredRows: Signal<any[]> = computed(() => {
        if (this.empty()) {
            return [];
        }

        // We know it isn't null here
        let results = this.results() as RunQueryResponse;

        let filters = this.filters();

        // Apply filters
        return results.data.filter(row => {
            return Object.keys(filters).every(key => {
                const filterValue = filters[key].toLowerCase();
                if (filterValue) {
                    return row[key] && row[key].toString().toLowerCase().includes(filterValue);
                } else {
                    return true; // No filter applied for this column
                }
            });
        });
    })

    filters: WritableSignal<{ [key: string]: string }> = signal({})

    host: Signal<string> = computed(() => {
        return this.results()?.host ?? '';
    })

    private modalService = inject(NgbModal);

    exportOptions: ExportModalOutput = {
        includeHeaders: true,
        filename: 'results.csv',
        filteredOnly: false,
        columns: {}
    }

    _pageIndex: WritableSignal<number> = signal(0);

    _pageSize: WritableSignal<number> = signal(25);

    results: WritableSignal<RunQueryResponse | null> = signal(null);

    rowsForPage: Signal<any[]> = computed(() => {
        if (this.empty()) {
            return [];
        }

        let rows = this.filteredRows();

        let shiftedIndex = this._pageIndex() - 1;

        let start = shiftedIndex * this._pageSize();
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

        let pageRows = rows.slice(start, end);

        return pageRows;
    });

    size: Signal<number | null> = computed(() => {
        return this.results()?.data.length || null;
    })

    private readonly eventBus: EventBus = inject(EventBus);

    protected readonly state: ApplicationState = inject(ApplicationState);

    constructor() {
        this.eventBus.on(QUERY_COMPLETED, (data: RunQueryResponse) => {
            this.pageIndex = 0;
            this.results.set(data);
            this.filters.set({});
            console.log("Query completed:", data);
        });
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
        // Event here is the new value
        this.filters.update(filters => {
            let newFilters = { ...filters }; // Create a shallow copy to ensure reactivity
            newFilters[item] = $event;
            return newFilters;
        });
    }

    async exportCSV() {
        // Initialize export options
        this.exportOptions = {
            filename: 'results.csv',
            includeHeaders: true,
            filteredOnly: false,
            columns: {}
        };

        let cols = this.columns() ?? []

        for (let col of cols) {
            if (col === "attributes") {
                this.exportOptions.columns[col] = false;
            } else {
                this.exportOptions.columns[col] = true;
            }
        }

        console.log("Showing export options modal with inputs", this.exportOptions)

        // TODO: exclude columns by default that are empty for all rows

        try {
            jQuery('#exportModal').modal({
                keyboard: true
            })
        } catch(e) {
            console.error("Export modal dismissed or error occurred:", e);
        }
    }

    async doExportCSV() {
        jQuery('#exportModal').modal('hide');

        console.info("Exporting...", this.exportOptions)

        let options = new ExportOptions();
        options.filename = this.exportOptions.filename;
        options.includeHeaders = this.exportOptions.includeHeaders;
        options.includedColumns = [...this.columns()];
        options.quoteStrings = true;

        // Filter columns based on user selection
        options.includedColumns = options.includedColumns.filter(col => this.exportOptions.columns[col]);

        try {
            await this.exportService.exportAsCSV(this.results()!, this.exportOptions.filteredOnly ? this.filteredRows() : this.results()!.data, options)
        } catch(e) {
            console.error("Error during export:", e);
        }
    }
}
