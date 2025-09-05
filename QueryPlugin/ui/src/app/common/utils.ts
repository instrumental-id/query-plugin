export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


export function escapeHTML(str: string){
    let p = document.createElement("p");
    p.appendChild(document.createTextNode(str));
    return p.innerHTML;
}

export function pulseRow(row: HTMLElement) {
    row.classList.add("pulse-green");
    row.addEventListener("animationend", () => {
        row.classList.remove("pulse-green");
    }, { once: true });
}
