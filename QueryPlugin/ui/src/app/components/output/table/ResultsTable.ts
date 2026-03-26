import {
    Component,
    computed,
    effect,
    inject,
    input,
    InputSignal,
    model,
    signal,
    Signal, viewChild,
    WritableSignal
} from '@angular/core';
import {NgClass, NgStyle} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {NgbModal, NgbPagination} from "@ng-bootstrap/ng-bootstrap";
import {Row, RunQueryResponse} from "../../../services/API";
import {ApplicationState} from "../../../services/ApplicationState";
import {ExportOptions, ExportService} from "../../../services/ExportService";
import {NgOptionComponent, NgSelectComponent} from "@ng-select/ng-select";

export interface ExportModalOutput {
    filename: string;
    includeHeaders: boolean;
    filteredOnly: boolean;
    columns: Record<string, boolean>;
}

declare var jQuery: any;

function isEmpty(value: any): boolean {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && Object.keys(value).length === 0);
}

@Component({
  selector: 'results-table',
    imports: [
        NgClass,
        FormsModule,
        NgbPagination,
        NgStyle,
        NgSelectComponent,
        NgOptionComponent
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
            let cols = []
            let firstRow: Row = r.data[0];
            console.debug("Inferring columns from first row:", firstRow);
            for (let key of Object.keys(firstRow)) {
                if (!key.startsWith("__$")) {
                    cols.push(key);
                }
            }
            return cols;
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

    filteredRows: Signal<Row[]> = computed(() => {
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

    /**
     * Display option allowing the user to hide specific columns
     */
    hiddenColumns: WritableSignal<string[]> = signal([])

    /**
     * Display option to automatically hide columns that are empty in all rows
     */
    hideEmptyColumns: WritableSignal<boolean> = model(false);

    hiddenColumnsSet: Signal<Set<string>> = computed(() => {
        let hidden: Set<string> = new Set()
        if (this.hideEmptyColumns()) {
            let emptyColumns = new Set(this.columns())
            for (let row of this.results()?.data ?? []) {
                for (let col of this.columns()) {
                    if (!isEmpty(row[col])) {
                        emptyColumns.delete(col);
                    }
                }
            }

            emptyColumns.forEach(col => hidden.add(col));
        }

        let hiddenCols = this.hiddenColumns() || []

        hiddenCols.forEach(col => hidden.add(col));

        return hidden;
    })

    _pageIndex: WritableSignal<number> = model(0);

    _pageSize: WritableSignal<number> = model(25);

    results: InputSignal<RunQueryResponse | null | undefined> = input<RunQueryResponse | null>();

    rowsForPage: Signal<Row[]> = computed(() => {
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

        return rows.slice(start, end);
    });

    showingDisplayOptions: WritableSignal<boolean> = signal(false);

    size: Signal<number | null> = computed(() => {
        return this.results()?.data.length || null;
    })

    optionsNotDefault: Signal<boolean> = computed(() => {
        return this._pageSize() !== 25 || this.hideEmptyColumns() || (this.hiddenColumns() && this.hiddenColumns()!.length > 0);
    })
    
    exportModal: Signal<HTMLDivElement | undefined> = viewChild<HTMLDivElement>('exportModal')

    protected readonly state: ApplicationState = inject(ApplicationState);

    constructor() {
        effect(() => {
            this.pageIndex = 0;
            this.filters.set({});
            console.debug("Query completed:", this.results());
        })
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

        this.exportSelectDefaultColumns();

        console.debug("Showing export options modal with inputs", this.exportOptions)

        try {
            jQuery('#exportModal').appendTo('body').modal({
                keyboard: true
            })
        } catch(e) {
            console.error("Export modal dismissed or error occurred:", e);
        }
    }

    private exportSelectDefaultColumns() {
        let cols = this.columns() ?? []

        for (let col of cols) {
            if (col === "attributes" || col === "uipreferences" || col === "scorecard") {
                this.exportOptions.columns[col] = false;
            } else {
                this.exportOptions.columns[col] = true;
            }
        }


        let allEmptyCols = []
        for (let col of cols) {
            let allEmpty = true;
            for (let row of this.results()!.data) {
                if (row[col] !== null && row[col] !== undefined && row[col] !== '') {
                    allEmpty = false;
                    break;
                }
            }
            if (allEmpty) {
                allEmptyCols.push(col);
            }
        }

        if (allEmptyCols.length > 0) {
            console.debug("The following columns are empty in all rows and will be unchecked by default:", allEmptyCols);
            for (let col of allEmptyCols) {
                this.exportOptions.columns[col] = false;
            }
        }
    }

    exportCalculateColumnsChecked(): number {
        return Object.values(this.exportOptions.columns).filter(v => v).length;
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

    exportModalSelect(type: 'all' | 'none' | 'default') {
        if (type === 'all') {
            for (let col of this.columns()) {
                this.exportOptions.columns[col] = true;
            }
        } else if (type === 'default') {
            this.exportSelectDefaultColumns();
        } else {
            for (let col of this.columns()) {
                this.exportOptions.columns[col] = false;
            }
        }
    }
}
