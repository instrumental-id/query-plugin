import {DomSanitizer} from "@angular/platform-browser";
import {Pipe} from "@angular/core";

@Pipe({
    name: "safeHtml",
    standalone: true,
})
export class SafeHtmlPipe {
    constructor(private sanitizer: DomSanitizer) {}

    transform(html: any) {
        return this.sanitizer.bypassSecurityTrustHtml(html);
    }
}
