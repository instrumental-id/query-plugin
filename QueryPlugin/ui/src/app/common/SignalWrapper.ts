import {ModelSignal, signal, WritableSignal} from "@angular/core";

export type Signals<T> = {
    [Property in keyof T]-?: WritableSignal<T[Property] | undefined>
}

export type ModelSignals<T> = {
    [Property in keyof T]-?: ModelSignal<T[Property]>
}

export function toSignals<T>(obj: T): Signals<T> {
    if (obj === null || obj === undefined) {
        throw new Error("Cannot convert null or undefined to signals");
    }
    const result = {} as Signals<T>;
    for (const key in obj) {
        if ((obj as any).hasOwnProperty(key)) {
            (result as any)[key] = signal((obj as any)[key]);
        }
    }
    return result;
}

export function fromSignals<T>(signals: Signals<T> | ModelSignals<T>): T {
    const result = {} as T;
    for (const key in signals) {
        if (signals.hasOwnProperty(key)) {
            (result as any)[key] = (signals as any)[key]();
        }
    }
    return result;
}