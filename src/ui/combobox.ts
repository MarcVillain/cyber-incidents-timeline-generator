// Pickers that can be searched. A native select is fine for a handful of choices, but the records of an
// incident run into the hundreds, and scrolling a list that long to find one machine is its own chore.

import { h, uniqueId } from "./dom.js";
import type { Choice } from "./forms.js";

export interface ComboboxStrings {
    searchHint: string;
    noMatch: string;
    addTag: string;
}

export interface ComboboxOptions {
    allowEmpty?: boolean;
    emptyLabel?: string;
    /** A handful of choices reads faster without a search box above it. */
    searchable?: boolean;
}

interface Entry<TValue extends string> {
    value: TValue | null;
    label: string;
}

const ACTIVE = "is-active";

function matching(labels: readonly string[], query: string): number[] {
    const needle = query.trim().toLowerCase();
    return labels.flatMap((label, index) => (needle === "" || label.toLowerCase().includes(needle) ? [index] : []));
}

function paintOptions(
    list: HTMLUListElement,
    labels: readonly string[],
    activeIndex: number,
    selectedIndex: number,
    noMatch: string,
    pick: (index: number) => void
): void {
    if (labels.length === 0) {
        list.replaceChildren(h("li", "tlg-combo-empty", { role: "presentation" }, [noMatch]));
        return;
    }
    list.replaceChildren(...labels.map((label, index) => {
        const option = h("li", "tlg-combo-option", { role: "option", "aria-selected": String(index === selectedIndex) }, [label]);
        if (index === activeIndex) {
            option.classList.add(ACTIVE);
        }
        // Mouse down rather than click, so the press does not blur the search box and close the popup first
        option.addEventListener("mousedown", event => {
            event.preventDefault();
            pick(index);
        });
        return option;
    }));
}

function nextActive(current: number, count: number, step: number, floor: number): number {
    if (count === 0) return floor;
    return Math.min(count - 1, Math.max(floor, current + step));
}

/**
 * Keeps the highlighted option in sight while the list is walked with the arrow keys.
 */
function scrollToActive(list: HTMLUListElement, activeIndex: number): void {
    const option = list.children[activeIndex];
    if (option instanceof HTMLElement) {
        const above = option.offsetTop < list.scrollTop;
        const below = option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight;
        if (above || below) list.scrollTop = option.offsetTop - (list.clientHeight - option.offsetHeight) / 2;
    }
}

/**
 * Only one list is open at a time. The one being opened shuts whatever was open before it, so a picker
 * left behind by a pointer that went elsewhere does not sit over the field below it.
 */
let openElsewhere: (() => void) | null = null;

interface Popup {
    open: () => void;
    close: () => void;
    isOpen: () => boolean;
}

/**
 * The popup shared by both pickers, hung under the control that owns it. It closes as soon as the focus
 * leaves it, so no listener outlives the panel it was built for.
 */
function popup(root: HTMLDivElement, owner: HTMLElement, children: readonly HTMLElement[]): Popup {
    const panel = h("div", "tlg-combo-popup", {}, children);
    panel.hidden = true;
    root.append(panel);

    const isOpen = (): boolean => !panel.hidden;
    const close = (): void => {
        panel.hidden = true;
        owner.setAttribute("aria-expanded", "false");
        if (openElsewhere === close) openElsewhere = null;
    };
    const open = (): void => {
        if (openElsewhere && openElsewhere !== close) openElsewhere();
        openElsewhere = close;
        panel.hidden = false;
        owner.setAttribute("aria-expanded", "true");
    };

    root.addEventListener("focusout", event => {
        const next = event.relatedTarget;
        if (next instanceof Node && root.contains(next)) return;
        close();
    });

    return { open, close, isOpen };
}

/**
 * A select that filters as it is typed in. The chosen value is always one of the choices.
 */
export function combobox<TValue extends string>(
    value: TValue | null,
    choices: readonly Choice<TValue>[],
    onChange: (value: TValue | null) => void,
    strings: ComboboxStrings,
    { allowEmpty = false, emptyLabel = "", searchable = true }: ComboboxOptions = {}
): HTMLDivElement {
    const entries: Entry<TValue>[] = allowEmpty ? [{ value: null, label: emptyLabel }, ...choices] : [...choices];
    const toggle = h("button", "tlg-combo-toggle", {
        type: "button",
        id: uniqueId("combo"),
        "data-primary": "",
        "aria-haspopup": "listbox",
        "aria-expanded": "false"
    });
    const caption = h("span", "tlg-combo-label");
    toggle.append(caption);
    const search = h("input", "tlg-combo-search", { type: "text", placeholder: strings.searchHint, "aria-label": strings.searchHint });
    const list = h("ul", "tlg-combo-list", { role: "listbox" });
    const root = h("div", "tlg-combo", {}, [toggle]);
    const panel = popup(root, toggle, searchable ? [search, list] : [list]);

    let chosen: TValue | null = value;
    let shown: number[] = entries.map((_, index) => index);
    let active = 0;

    const labelOf = (): string => entries.find(entry => entry.value === chosen)?.label ?? emptyLabel;

    const pick = (position: number): void => {
        const entry = entries[shown[position]];
        chosen = entry.value;
        caption.textContent = entry.label;
        panel.close();
        onChange(chosen);
    };

    const paint = (): void => {
        shown = matching(entries.map(entry => entry.label), search.value);
        active = Math.min(active, Math.max(shown.length - 1, 0));
        paintOptions(list, shown.map(index => entries[index].label), active, shown.findIndex(index => entries[index].value === chosen), strings.noMatch, pick);
    };

    const openPopup = (): void => {
        panel.open();
        search.value = "";
        active = Math.max(entries.findIndex(entry => entry.value === chosen), 0);
        paint();
        // Something inside has to hold the focus, or nothing tells the list when the pointer moves on
        if (searchable) search.focus();
        else toggle.focus();
        scrollToActive(list, active);
    };

    caption.textContent = labelOf();

    // Safari does not focus a button that is clicked, so the press blurs the search box and the list has
    // already closed by the time the click arrives. Pressing the button is what says open or shut, not the
    // state it happens to be in a moment later. A keyboard press sends no mousedown, so the live state answers.
    let openWhenPressed: boolean | null = null;
    toggle.addEventListener("mousedown", () => {
        openWhenPressed = panel.isOpen();
    });
    toggle.addEventListener("click", () => {
        const wasOpen = openWhenPressed ?? panel.isOpen();
        openWhenPressed = null;
        if (wasOpen) panel.close();
        else openPopup();
    });

    search.addEventListener("input", () => {
        active = 0;
        paint();
    });

    const onKey = (event: KeyboardEvent): void => {
        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp":
                event.preventDefault();
                if (!panel.isOpen()) {
                    openPopup();
                    return;
                }
                active = nextActive(active, shown.length, event.key === "ArrowDown" ? 1 : -1, 0);
                paint();
                scrollToActive(list, active);
                break;
            case "Enter":
                if (!panel.isOpen()) return;
                event.preventDefault();
                if (shown.length > 0) pick(active);
                break;
            case "Escape":
                if (!panel.isOpen()) return;
                event.preventDefault();
                panel.close();
                toggle.focus();
                break;
        }
    };

    search.addEventListener("keydown", onKey);
    // The keys reach the button itself when the list is short enough to have no search box above it
    toggle.addEventListener("keydown", onKey);

    paint();
    return root;
}

/**
 * A text box that offers what has already been used elsewhere, while still accepting a word nobody has
 * written yet. Enter commits the highlighted suggestion, or what was typed when none is highlighted.
 */
export function suggestInput(
    suggestions: readonly string[],
    onCommit: (value: string) => void,
    strings: ComboboxStrings
): HTMLDivElement {
    const input = h("input", "tlg-input tlg-combo-search", { type: "text", id: uniqueId("suggest"), "data-primary": "", placeholder: strings.addTag, role: "combobox", "aria-expanded": "false" });
    const list = h("ul", "tlg-combo-list", { role: "listbox" });
    const root = h("div", "tlg-combo tlg-combo-inline", {}, [input]);
    const panel = popup(root, input, [list]);

    let shown: number[] = [];
    let active = -1;

    const commit = (value: string): void => {
        const tag = value.trim();
        if (tag === "") return;
        input.value = "";
        active = -1;
        panel.close();
        onCommit(tag);
    };

    const paint = (): void => {
        // Nothing is offered until a letter is typed, so the field is a place to write first and a list second
        shown = input.value.trim() === "" ? [] : matching(suggestions, input.value);
        active = Math.min(active, shown.length - 1);
        paintOptions(list, shown.map(index => suggestions[index]), active, -1, strings.noMatch, position => commit(suggestions[shown[position]]));
        if (shown.length > 0) panel.open();
        else panel.close();
    };

    input.addEventListener("input", () => {
        active = -1;
        paint();
    });

    input.addEventListener("keydown", event => {
        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp":
                event.preventDefault();
                active = nextActive(active, shown.length, event.key === "ArrowDown" ? 1 : -1, -1);
                paint();
                break;
            case "Enter":
                event.preventDefault();
                commit(active >= 0 ? suggestions[shown[active]] : input.value);
                break;
            case "Escape":
                event.preventDefault();
                panel.close();
                break;
        }
    });

    return root;
}
