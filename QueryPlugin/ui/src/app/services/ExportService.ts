import {Injectable} from "@angular/core";

import {RunQueryResponse} from "./API";
import {saveAs} from "file-saver";

export enum Delimiter {
    COMMA = ',',
    SEMICOLON = ';',
    TAB = '\t'
}

export class ExportOptions {
    delimiter: Delimiter = Delimiter.COMMA;
    filename: string = 'export.csv';
    includedColumns: string[] | null = null;
    includeHeaders: boolean = true;
    quoteStrings: boolean = true;
}

@Injectable({providedIn: 'root'})
export class ExportService {

    async exportAsCSV(data: RunQueryResponse, rows: Array<Record<string, any>>, options: ExportOptions) {
        if (!data || !rows || rows.length === 0) {
            console.warn('No data to export');
            throw new Error('No data to export');
        }

        // Extract a subset of the data if columns are specified
        if (options.includedColumns) {
            rows = rows.map(row => {
                let filteredRow: Record<string, any> = {};
                for (let col of options.includedColumns!) {
                    filteredRow[col] = row[col];
                }
                return filteredRow;
            });
        }

        const headers = options.includedColumns ? options.includedColumns : data.columns;

        let csvText = "";
        if (options.includeHeaders) {
            csvText += headers.map(h => this.escapeValue(h, options)).join(options.delimiter) + '\n';
        }

        console.info(`Exporting ${rows.length} rows with columns: `, headers);

        // Rows have already been filtered to include only specified columns
        for (let row of rows) {
            let formattedRow = headers.map(col => this.escapeValue(row[col], options)).join(options.delimiter);
            csvText += formattedRow + '\n';
        }

        let blob = new Blob([csvText], {type: 'text/csv;charset=utf-8;'});

        saveAs(blob, options.filename);
    }

    /**
     * Escape a value for CSV output, adding quotes if necessary
     * @param value The value to escape
     * @param options Export options to determine quoting behavior
     * @private
     */
    private escapeValue(value: string, options: ExportOptions) {
        if (value == null) {
            return '';
        }
        let strValue = value.toString();
        if (options.quoteStrings && (strValue.includes(options.delimiter) || strValue.includes('\n') || strValue.includes('"'))) {
            // Escape quotes by doubling them
            let escapedValue = strValue.replace(/"/g, '""');
            return `"${escapedValue}"`;
        } else {
            return value.toString();
        }
    }
}