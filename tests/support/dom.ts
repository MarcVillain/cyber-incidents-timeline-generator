import { parseHTML } from "linkedom";

const EMPTY_PAGE = "<!doctype html><html><head></head><body></body></html>";

/**
 * Installs a DOM on the global scope so the renderers and the workspace can run under node:test. Only
 * the few browser services the code touches beyond the DOM itself are stubbed.
 */
export function installDom(): void {
    const { window, document } = parseHTML(EMPTY_PAGE);
    const globals: Readonly<Record<string, unknown>> = {
        window,
        document,
        Node: window.Node,
        Element: window.Element,
        HTMLElement: window.HTMLElement,
        HTMLInputElement: window.HTMLInputElement,
        HTMLTextAreaElement: window.HTMLTextAreaElement,
        MutationObserver: window.MutationObserver,
        getComputedStyle: () => ({ getPropertyValue: () => "" }),
        requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0)
    };
    for (const [name, value] of Object.entries(globals)) {
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    Object.defineProperty(window, "setTimeout", { value: setTimeout, configurable: true });
    Object.defineProperty(window, "localStorage", { value: null, configurable: true });
    for (const name of ["setPointerCapture", "releasePointerCapture"]) {
        Object.defineProperty(window.HTMLElement.prototype, name, { value: () => undefined, configurable: true });
    }
    eventConstructor = window.Event;
}

let eventConstructor: typeof Event | null = null;

export interface SyntheticEventInit {
    bubbles?: boolean;
    clientX?: number;
    clientY?: number;
    key?: string;
}

/**
 * An event carrying the pointer or keyboard fields the workspace reads. It bubbles unless told not to,
 * because some of the events the workspace listens for, such as mouseleave, never do.
 */
export function syntheticEvent(type: string, init: SyntheticEventInit = {}): Event {
    if (!eventConstructor) {
        throw new Error("installDom has to run first.");
    }
    const event = new eventConstructor(type, { bubbles: init.bubbles ?? true, cancelable: true });
    const fields: Readonly<Record<string, unknown>> = { button: 0, pointerId: 1, clientX: init.clientX ?? 0, clientY: init.clientY ?? 0, key: init.key ?? "" };
    for (const [name, value] of Object.entries(fields)) {
        Object.defineProperty(event, name, { value });
    }
    return event;
}

/**
 * Picks a value in a picker the way a pointer does: open it, then press the option that reads the label.
 */
export function chooseOption(combo: HTMLElement, label: string): void {
    const toggle = combo.querySelector<HTMLButtonElement>(".tlg-combo-toggle");
    if (!toggle) {
        throw new Error("No picker here.");
    }
    toggle.dispatchEvent(syntheticEvent("click"));
    const option = [...combo.querySelectorAll<HTMLElement>(".tlg-combo-option")].find(node => node.textContent?.trim() === label);
    if (!option) {
        throw new Error(`No option reads "${label}"`);
    }
    option.dispatchEvent(syntheticEvent("mousedown"));
}

/**
 * The control of the field carrying the caption given.
 */
export function fieldNamed(root: ParentNode, label: string): HTMLElement {
    const found = [...root.querySelectorAll<HTMLElement>(".tlg-field")].find(field => field.querySelector("label")?.textContent === label);
    if (!found) {
        throw new Error(`No field reads "${label}"`);
    }
    return found;
}
