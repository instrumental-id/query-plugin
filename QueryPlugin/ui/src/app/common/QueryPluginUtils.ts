/**
 * Debounces a function call, ensuring that the function is only called after
 * a specified delay has passed since the last call.
 *
 * Usage example:
 *
 * ```typescript
 *  const debouncedFunction = debounce(300, () => {
 *    console.log('Function called!');
 *  });
 *
 *  debouncedFunction(); // Will not call immediately
 * ```
 *
 * @param delay The delay in milliseconds to wait before calling the function.
 * @param fn The function to debounce. It can take any number of arguments.
 */
export function debounce<T extends (...args: any[]) => void>(delay: number, fn: T): T {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function (this: any, ...args: any[]) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    } as T;
}