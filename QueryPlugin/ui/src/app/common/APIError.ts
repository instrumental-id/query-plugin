export interface APIErrorInput {
    status: number;
    statusText: string;
    url: string;
    message?: string;
    content?: string;
}

export class APIError extends Error {
    content?: string;
    status: number;
    statusText: string;
    url: string;

    constructor(input: APIErrorInput) {
        super(input?.message || `API Error: ${input.status} ${input.statusText} at ${input.url}`);

        this.content = input.content;
        this.status = input.status;
        this.statusText = input.statusText;
        this.url = input.url;

        Object.setPrototypeOf(this, APIError.prototype);
    }
}