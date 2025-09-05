import { Pipe, PipeTransform } from '@angular/core';
import {escapeHTML, escapeRegExp} from "./utils";

@Pipe({
    name: 'highlightSearch',
})
export class HighlightSearchPipe implements PipeTransform {
    transform(value: string, search: string): any {
        if (!search) {
            return value;
        }

        const htmlEscapedSearch = escapeHTML(search);

        // TODO: there's now a RegExp.escape(), but it's new to browsers in 2025... wait a bit
        const escapedSearch = escapeRegExp(htmlEscapedSearch);

        const regex = new RegExp(escapedSearch, 'gi');
        const match = value.match(regex);

        if (!match) {
            return value;
        }

        return value.replace(regex, (m) => `<span class='idwqpHighlight'>${m}</span>`);
    }
}
