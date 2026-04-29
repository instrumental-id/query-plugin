import { formatSQL } from "holywell";
import xmlFormat from "xml-formatter";

/**
 * Defines the formatter output, including the formatted string and any
 * warnings encountered during formatting.
 */
export interface FormatterOutput {
  /**
   * The formatted string output by the formatter. This will be an empty string if the input was null or undefined.
   */
  formatted: string;

  /**
   * An array of warning messages generated during formatting. This will be empty
   * if no warnings were encountered. Warnings may include issues such as syntax
   * errors that were recovered from, or other anomalies in the input that may
   * affect the output.
   */
  warnings: string[];
}

/**
 * The Formatter utility provides methods for formatting various types of strings.
 *
 */
export class Formatter {
  /**
   * Formats the given SQL string using the holywell library. If the input is null or
   * undefined, it returns an empty string and no warnings.
   *
   * @param sql The SQL to format
   * @param params Unused at the moment
   * @returns The formatting output
   */
  formatSql(sql: string | undefined, params: any = null): FormatterOutput {
    if (!sql) {
      return { formatted: "", warnings: [] };
    }

    let warnings: string[] = [];
    let output = formatSQL(sql, {
      maxLineLength: 100,
      recover: true,
      onRecover: (error, raw, context) => {
        warnings.push(`Line ${error.token.line}: ${error.message}`);
      },
    });

    return {
      formatted: output,
      warnings: warnings,
    };
  }

  formatXml(xml: string | undefined): string {
    if (!xml) {
      return "";
    }
    return xmlFormat(xml);
  }
}
