// Form controls for the inspector. Each reports its value through a single onChange callback, so the
// inspector stays a description of what a record holds rather than a pile of event wiring.

import { Icon } from "../core/icon.js";
import type { DiagramNode, RecordId } from "../core/models.js";
import type { WallClockParts } from "../core/time.js";
import { combobox, suggestInput } from "./combobox.js";
import { h, uniqueId } from "./dom.js";
import type { IconSet } from "./icons/icon-set.js";
import { DEFAULT_STRINGS, type FormStrings } from "./strings.js";

export interface Choice<TValue extends string> {
    value: TValue;
    label: string;
}

const MIN_TEXTAREA_HEIGHT = 24;

/**
 * Past this many choices a list stops being something the eye can scan, so the picker gains a search box.
 */
const SEARCHABLE_FROM = 8;

/**
 * A control made of several elements says which one the caption belongs to, so the label points at
 * something that can take the focus rather than at the wrapper around it.
 */
function labelTarget(control: HTMLElement): string {
    const primary = control.querySelector("[data-primary]");
    return primary instanceof HTMLElement ? primary.id : control.id;
}

export function field(label: string, control: HTMLElement): HTMLDivElement {
    const caption = h("label", null, { for: labelTarget(control) }, [label]);
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

export function numberInput(value: number | null, onChange: (value: number | null) => void): HTMLInputElement {
    const input = h("input", "tlg-input", { type: "number", id: uniqueId("number") });
    input.value = value === null ? "" : String(value);
    input.addEventListener("change", () => {
        const parsed = Number(input.value);
        onChange(input.value.trim() && Number.isFinite(parsed) ? parsed : null);
    });
    return input;
}

export function dateInput(value: string | null, onChange: (value: string | null) => void): HTMLInputElement {
    const input = h("input", "tlg-input", { type: "date", id: uniqueId("day") });
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
    strings?: FormStrings;
}

/**
 * One picker everywhere, so two fields side by side never look like two different controls. Only a list
 * long enough to be hunted through gains a search box.
 */
export function select<TValue extends string>(
    value: TValue | null,
    choices: readonly Choice<TValue>[],
    onChange: (value: TValue | null) => void,
    { allowEmpty = false, emptyLabel = DEFAULT_STRINGS.forms.none, strings = DEFAULT_STRINGS.forms }: SelectOptions = {}
): HTMLElement {
    return combobox(value, choices, onChange, strings, { allowEmpty, emptyLabel, searchable: choices.length >= SEARCHABLE_FROM });
}

/**
 * A picker over the records of the diagram, reporting the id of the one chosen.
 */
export function recordSelect(
    value: RecordId | null,
    nodes: readonly DiagramNode[],
    onChange: (value: RecordId | null) => void,
    options: SelectOptions = {}
): HTMLElement {
    const choices: Choice<string>[] = nodes.map(node => ({ value: String(node.id), label: node.name }));
    return select(value === null ? null : String(value), choices, chosen => {
        onChange(nodes.find(node => String(node.id) === chosen)?.id ?? null);
    }, options);
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
    const dateInput = h("input", "tlg-input", { type: "date", id: uniqueId("date"), "data-primary": "" });
    dateInput.value = parts.date ?? "";
    const timeInput = h("input", "tlg-input", { type: "time", id: uniqueId("time"), "aria-label": strings.timeHint });
    timeInput.value = parts.time ?? "";

    const report = (): void => onChange({ date: dateInput.value || null, time: timeInput.value || null });
    dateInput.addEventListener("change", report);
    timeInput.addEventListener("change", report);

    return h("div", "tlg-when", {}, [dateInput, timeInput]);
}

/**
 * Tags as removable chips, with one field below offering the tags already used elsewhere. An incident is
 * only searchable by tag when the same word is written the same way twice, and picking beats retyping.
 */
export function tagChips(
    values: readonly string[],
    suggestions: readonly string[],
    onChange: (values: string[]) => void,
    icons: IconSet,
    strings: FormStrings = DEFAULT_STRINGS.forms
): HTMLDivElement {
    const list = h("div", "tlg-chips");
    const picker = h("div", "tlg-tag-picker");
    const container = h("div", "tlg-tags", {}, [list, picker]);
    let current = [...values];

    const paint = (): void => {
        list.replaceChildren(...current.map(tag => {
            const remove = button(icons, "", "tlg-chip-remove", () => {
                current = current.filter(entry => entry !== tag);
                onChange([...current]);
                paint();
            }, Icon.Close);
            remove.setAttribute("aria-label", `${strings.removeTag} ${tag}`);
            return h("span", "tlg-chip", {}, [tag, remove]);
        }));

        const held = new Set(current.map(tag => tag.toLowerCase()));
        const offered = suggestions.filter(tag => !held.has(tag.toLowerCase()));
        picker.replaceChildren(suggestInput(offered, tag => {
            if (held.has(tag.toLowerCase())) return;
            current = [...current, tag];
            onChange([...current]);
            paint();
        }, strings));
    };

    paint();
    return container;
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
