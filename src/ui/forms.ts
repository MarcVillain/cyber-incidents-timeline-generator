// Form controls for the inspector. Each reports its value through a single onChange callback, so the
// inspector stays a description of what a record holds rather than a pile of event wiring.

import type { DiagramNode, RecordId } from "../core/models.js";
import type { WallClockParts } from "../core/time.js";
import { h, uniqueId } from "./dom.js";
import type { IconSet } from "./icons/icon-set.js";
import { DEFAULT_STRINGS, type FormStrings } from "./strings.js";

export interface Choice<TValue extends string> {
    value: TValue;
    label: string;
}

const MIN_TEXTAREA_HEIGHT = 24;

export function field(label: string, control: HTMLElement): HTMLDivElement {
    const caption = h("label", null, { for: control.id }, [label]);
    return h("div", "tlg-field", {}, [caption, control]);
}

export function row(...children: HTMLElement[]): HTMLDivElement {
    return h("div", "tlg-field-row", {}, children);
}

function blankToNull(value: string): string | null {
    return value.trim() === "" ? null : value;
}

export function textInput(value: string | null, onChange: (value: string | null) => void, placeholder = ""): HTMLInputElement {
    const input = h("input", "tlg-input", { type: "text", id: uniqueId("input"), placeholder });
    input.value = value ?? "";
    input.addEventListener("change", () => onChange(blankToNull(input.value)));
    return input;
}

/**
 * Notes grow to fit what is written in them, because a description that is cut off is a description
 * nobody can check.
 */
export function textArea(value: string | null, onChange: (value: string | null) => void, rows = 3): HTMLTextAreaElement {
    const input = h("textarea", "tlg-input", { id: uniqueId("textarea"), rows: String(rows) });
    input.value = value ?? "";
    const fit = (): void => {
        input.style.height = "auto";
        input.style.height = `${Math.max(input.scrollHeight, MIN_TEXTAREA_HEIGHT)}px`;
    };
    input.addEventListener("input", fit);
    input.addEventListener("change", () => onChange(blankToNull(input.value)));
    requestAnimationFrame(fit);
    return input;
}

export interface SelectOptions {
    allowEmpty?: boolean;
    emptyLabel?: string;
}

export function select<TValue extends string>(
    value: TValue | null,
    choices: readonly Choice<TValue>[],
    onChange: (value: TValue | null) => void,
    { allowEmpty = false, emptyLabel = DEFAULT_STRINGS.forms.none }: SelectOptions = {}
): HTMLSelectElement {
    const input = h("select", "tlg-select", { id: uniqueId("select") });
    if (allowEmpty) {
        input.append(h("option", null, { value: "" }, [emptyLabel]));
    }
    choices.forEach(choice => input.append(h("option", null, { value: choice.value }, [choice.label])));
    input.value = value ?? "";
    input.addEventListener("change", () => onChange(choices.find(choice => choice.value === input.value)?.value ?? null));
    return input;
}

/**
 * A picker over the records of the diagram, reporting the id of the one chosen.
 */
export function recordSelect(
    value: RecordId | null,
    nodes: readonly DiagramNode[],
    onChange: (value: RecordId | null) => void,
    { allowEmpty = false, emptyLabel = DEFAULT_STRINGS.forms.none }: SelectOptions = {}
): HTMLSelectElement {
    const input = h("select", "tlg-select", { id: uniqueId("record") });
    if (allowEmpty) {
        input.append(h("option", null, { value: "" }, [emptyLabel]));
    }
    nodes.forEach(node => input.append(h("option", null, { value: String(node.id) }, [node.name])));
    input.value = value === null ? "" : String(value);
    input.addEventListener("change", () => onChange(nodes.find(node => String(node.id) === input.value)?.id ?? null));
    return input;
}

export function checkbox(label: string, value: boolean, onChange: (value: boolean) => void): HTMLDivElement {
    const input = h("input", null, { type: "checkbox", id: uniqueId("check") });
    input.checked = value;
    input.addEventListener("change", () => onChange(input.checked));
    return h("div", "tlg-check", {}, [input, h("label", null, { for: input.id }, [label])]);
}

/**
 * A date and, beside it, a time that may be left blank. Incidents are often reconstructed from records
 * that only carry the day, and saying nothing is more honest than inventing midnight.
 */
export function dateAndTime(parts: WallClockParts, onChange: (parts: WallClockParts) => void, strings: FormStrings = DEFAULT_STRINGS.forms): HTMLDivElement {
    const dateInput = h("input", "tlg-input", { type: "date", id: uniqueId("date") });
    dateInput.value = parts.date ?? "";
    const timeInput = h("input", "tlg-input", { type: "time", id: uniqueId("time"), "aria-label": strings.timeHint });
    timeInput.value = parts.time ?? "";

    const report = (): void => onChange({ date: dateInput.value || null, time: timeInput.value || null });
    dateInput.addEventListener("change", report);
    timeInput.addEventListener("change", report);

    const wrapper = h("div", "tlg-when", {}, [dateInput, timeInput]);
    wrapper.id = dateInput.id;
    return wrapper;
}

/**
 * Free text tags, one per comma.
 */
export function tagsInput(values: readonly string[], onChange: (values: string[]) => void, strings: FormStrings = DEFAULT_STRINGS.forms): HTMLInputElement {
    const input = h("input", "tlg-input", { type: "text", id: uniqueId("tags"), placeholder: strings.tagsHint });
    input.value = values.join(", ");
    input.addEventListener("change", () => onChange(input.value.split(",").map(part => part.trim()).filter(Boolean)));
    return input;
}

export function button(icons: IconSet, label: string, className: string, onClick: () => void, icon: string | null = null): HTMLButtonElement {
    const node = h("button", className, { type: "button" });
    if (icon) {
        node.append(icons.element(icon));
    }
    if (label) {
        node.append(label);
    } else {
        node.setAttribute("aria-label", icon ?? "");
    }
    node.addEventListener("click", onClick);
    return node;
}
