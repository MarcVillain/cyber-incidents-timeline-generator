// How a representation plugs into the workspace. A renderer splits its records into fixed size pages
// and draws one page at a time, which is what keeps a diagram inside a single slide.

import type { RepresentationInfo } from "../../core/catalog.js";
import type { RepresentationKey } from "../../core/enums.js";
import type { TimeFormats } from "../../core/time.js";
import type { DiagramStore } from "../diagram-store.js";
import type { IconSet } from "../icons/icon-set.js";
import type { SlideHeaderCustomizer } from "../slide-header.js";
import type { FilterDescriptions, Strings } from "../strings.js";
import type { Palette } from "../theme.js";

export interface RenderContext {
    readonly store: DiagramStore;
    readonly palette: Palette;
    readonly icons: IconSet;
    readonly representation: RepresentationInfo;
    readonly strings: Strings;
    readonly time: TimeFormats;
    /** Choices made for this representation, keyed by option id. */
    readonly options: ReadonlyMap<string, string>;
    /** Rewrites the title block of each slide; null keeps the default. */
    readonly slideHeader: SlideHeaderCustomizer | null;
}

export interface RendererChoice<TValue extends string> {
    value: TValue;
    label: string;
}

export enum OptionKind {
    /** One value among the choices. */
    Choice = "choice",
    /** An ordered selection of the choices, such as the columns of a table. */
    List = "list"
}

// A list is kept as one string so every setting shares the same stored and addressable shape, such as
// "when,what=Action,stage" where an entry may carry the name it was given
export const LIST_SEPARATOR = ",";
export const LABEL_SEPARATOR = "=";
export const LIST_LABEL_LENGTH = 60;

// Only the characters the format itself uses are escaped, so decoding can never fail on a stored value
const ESCAPES: readonly (readonly [string, string])[] = [["%", "%25"], [LIST_SEPARATOR, "%2C"], [LABEL_SEPARATOR, "%3D"]];

interface OptionBase {
    id: string;
    label: string;
    /** A sentence saying what the setting changes, shown in the settings panel. */
    description?: string;
}

/**
 * A setting a representation offers, such as how densely the sequential timeline packs its blocks.
 */
export interface RendererOption<TValue extends string = string> extends OptionBase {
    kind?: OptionKind.Choice;
    fallback: TValue;
    choices: readonly RendererChoice<TValue>[];
}

/**
 * An ordered selection of the choices, never empty. Stored as the values joined by LIST_SEPARATOR.
 */
export interface RendererListOption<TValue extends string = string> extends OptionBase {
    kind: OptionKind.List;
    fallback: readonly TValue[];
    choices: readonly RendererChoice<TValue>[];
    /** Whether each chosen entry may be given a name of its own, such as the heading of a column. */
    renamable?: boolean;
    /** A value the choice would show on the records loaded, offered beside it before it is picked. */
    example?(context: RenderContext, value: TValue): string | null;
}

/** A chosen entry of a list, with the name it was given or null for the name of its choice. */
export interface ListEntry<TValue extends string = string> {
    value: TValue;
    label: string | null;
}

export type RendererSetting = RendererOption | RendererListOption;

export function optionValue<TValue extends string>(context: RenderContext, option: RendererOption<TValue>): TValue {
    const stored = context.options.get(option.id);
    return option.choices.find(choice => choice.value === stored)?.value ?? option.fallback;
}

function escapeLabel(label: string): string {
    return ESCAPES.reduce((text, [raw, escaped]) => text.split(raw).join(escaped), label);
}

function unescapeLabel(label: string): string {
    return [...ESCAPES].reverse().reduce((text, [raw, escaped]) => text.split(escaped).join(raw), label);
}

/** A name worth keeping: trimmed, bounded, and null when nothing is left. */
export function cleanListLabel(label: string | null): string | null {
    const trimmed = label?.trim().slice(0, LIST_LABEL_LENGTH) ?? "";
    return trimmed === "" ? null : trimmed;
}

/**
 * Reads a stored list back into known entries, dropping unknown and repeated ones, and names when the
 * option takes none. A list that ends up empty falls back, since a table with no column has nothing to show.
 */
export function parseOptionList<TValue extends string>(stored: string | undefined, option: RendererListOption<TValue>): ListEntry<TValue>[] {
    const fallback = (): ListEntry<TValue>[] => option.fallback.map(value => ({ value, label: null }));
    if (stored === undefined) return fallback();
    const entries: ListEntry<TValue>[] = [];
    stored.split(LIST_SEPARATOR).forEach(part => {
        const split = part.indexOf(LABEL_SEPARATOR);
        const key = split < 0 ? part : part.slice(0, split);
        const value = option.choices.find(choice => choice.value === key)?.value;
        if (value === undefined || entries.some(entry => entry.value === value)) return;
        const label = option.renamable === true && split >= 0 ? cleanListLabel(unescapeLabel(part.slice(split + 1))) : null;
        entries.push({ value, label });
    });
    return entries.length > 0 ? entries : fallback();
}

export function serializeOptionList(entries: readonly ListEntry[]): string {
    return entries.map(entry => (entry.label === null ? entry.value : `${entry.value}${LABEL_SEPARATOR}${escapeLabel(entry.label)}`)).join(LIST_SEPARATOR);
}

export function optionList<TValue extends string>(context: RenderContext, option: RendererListOption<TValue>): ListEntry<TValue>[] {
    return parseOptionList(context.options.get(option.id), option);
}

export interface RendererDefinition<TPage> {
    /** A built in key, or a key the host also declared in CatalogOptions.representations. */
    representation: RepresentationKey;
    /** A function when the labels are translated, which is how the built in representations declare theirs. */
    options?: readonly RendererSetting[] | ((strings: Strings) => readonly RendererSetting[]);
    /** What the filters shared by every view do to this one. Defaults to the words shared by all views. */
    filters?: (strings: Strings) => FilterDescriptions;
    /** Whether records can be pinned by hand in this representation. */
    draggable?: boolean;
    /** Never empty: a representation with nothing to show still returns one page saying so. */
    pages(context: RenderContext): TPage[];
    draw(context: RenderContext, page: TPage, pageIndex: number, pageCount: number): SVGGElement;
}

export interface Pagination {
    readonly count: number;
    draw(pageIndex: number): SVGGElement;
}

export interface Renderer {
    readonly representation: RepresentationKey;
    options(strings: Strings): readonly RendererSetting[];
    filters(strings: Strings): FilterDescriptions;
    readonly draggable: boolean;
    paginate(context: RenderContext): Pagination;
}

/**
 * Hides the page type of a renderer behind a uniform face, so the workspace can hold renderers whose
 * pages have nothing in common.
 */
export function defineRenderer<TPage>(definition: RendererDefinition<TPage>): Renderer {
    const options = definition.options ?? [];
    return {
        representation: definition.representation,
        options: strings => (typeof options === "function" ? options(strings) : options),
        filters: strings => definition.filters?.(strings) ?? strings.filters.shared,
        draggable: definition.draggable ?? false,
        paginate(context: RenderContext): Pagination {
            const pages = definition.pages(context);
            if (pages.length === 0) {
                throw new Error(`The ${definition.representation} renderer returned no page.`);
            }
            return {
                count: pages.length,
                draw: pageIndex => {
                    const index = Math.min(Math.max(pageIndex, 0), pages.length - 1);
                    const page = pages[index];
                    if (page === undefined) {
                        throw new Error(`The ${definition.representation} renderer has no page ${index}.`);
                    }
                    return definition.draw(context, page, index, pages.length);
                }
            };
        }
    };
}
