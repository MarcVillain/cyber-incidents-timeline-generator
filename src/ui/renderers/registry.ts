// How a representation plugs into the workspace. A renderer splits its records into fixed size pages
// and draws one page at a time, which is what keeps a diagram inside a single slide.

import type { RepresentationInfo } from "../../core/catalog.js";
import type { Representation } from "../../core/enums.js";
import type { DiagramStore } from "../diagram-store.js";
import type { IconSet } from "../icons/icon-set.js";
import type { SlideHeaderCustomizer } from "../slide-header.js";
import type { Palette } from "../theme.js";

export interface RenderContext {
    readonly store: DiagramStore;
    readonly palette: Palette;
    readonly icons: IconSet;
    readonly representation: RepresentationInfo;
    /** Choices made for this representation, keyed by option id. */
    readonly options: ReadonlyMap<string, string>;
    /** Rewrites the title block of each slide; null keeps the default. */
    readonly slideHeader: SlideHeaderCustomizer | null;
}

export interface RendererChoice<TValue extends string> {
    value: TValue;
    label: string;
}

/**
 * A setting a representation offers, such as how densely the sequential timeline packs its blocks.
 */
export interface RendererOption<TValue extends string = string> {
    id: string;
    label: string;
    fallback: TValue;
    choices: readonly RendererChoice<TValue>[];
}

export function optionValue<TValue extends string>(context: RenderContext, option: RendererOption<TValue>): TValue {
    const stored = context.options.get(option.id);
    return option.choices.find(choice => choice.value === stored)?.value ?? option.fallback;
}

export interface RendererDefinition<TPage> {
    representation: Representation;
    options?: readonly RendererOption[];
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
    readonly representation: Representation;
    readonly options: readonly RendererOption[];
    readonly draggable: boolean;
    paginate(context: RenderContext): Pagination;
}

/**
 * Hides the page type of a renderer behind a uniform face, so the workspace can hold renderers whose
 * pages have nothing in common.
 */
export function defineRenderer<TPage>(definition: RendererDefinition<TPage>): Renderer {
    return {
        representation: definition.representation,
        options: definition.options ?? [],
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
