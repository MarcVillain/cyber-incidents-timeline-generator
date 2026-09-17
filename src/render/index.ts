// Drawing a slide with no page to draw it in. The scene is deterministic: text is measured from a
// bundled table rather than the DOM, so a server renders exactly what the screen shows.

import type { Diagram } from "../core/models.js";
import type { RepresentationKey } from "../core/enums.js";
import { TimeFormats, type DurationUnits } from "../core/time.js";
import { DiagramStore, type StepFilters } from "../ui/diagram-store.js";
import { serialize, type SerializeOptions, type XmlSerializer } from "../ui/export.js";
import { IconSet } from "../ui/icons/icon-set.js";
import { BUILT_IN_RENDERERS } from "../ui/renderers/index.js";
import type { Renderer } from "../ui/renderers/registry.js";
import type { SlideHeaderCustomizer } from "../ui/slide-header.js";
import { buildStrings, type StringsOverride } from "../ui/strings.js";
import { withDocument } from "../ui/svg.js";
import { Palette, defaultTokenResolver, type TokenResolver } from "../ui/theme.js";

export interface RenderOptions {
    representation: RepresentationKey;
    /**
     * The document elements are created in. A browser passes its own; on the server, any DOM
     * implementation will do, such as the one linkedom builds.
     */
    document: Document;
    /** Turns the tree into text. Defaults to XMLSerializer, which a browser has and a server may not. */
    serializer?: XmlSerializer;
    /** The representations available. Defaults to the built in ones. */
    renderers?: readonly Renderer[];
    icons?: IconSet;
    /** Resolves the colour tokens. Defaults to the light theme, since there is no page to read. */
    tokens?: TokenResolver;
    strings?: StringsOverride;
    locale?: string;
    durationUnits?: DurationUnits;
    /** The settings of the representation, keyed by option id. */
    options?: ReadonlyMap<string, string>;
    /** Which records are drawn. Defaults to all of them. */
    filters?: Partial<StepFilters>;
    slideHeader?: SlideHeaderCustomizer;
    /** How each page is wrapped into a file. */
    file?: SerializeOptions;
}

function drawn(diagram: Diagram, options: RenderOptions): { pages: SVGGElement[] } {
    const renderers = options.renderers ?? BUILT_IN_RENDERERS;
    const renderer = renderers.find(entry => entry.representation === options.representation);
    if (!renderer) {
        throw new Error(`No renderer draws ${options.representation}.`);
    }

    const store = new DiagramStore();
    store.load(diagram);
    if (options.filters) {
        store.setFilters(options.filters);
    }

    const context = {
        store,
        palette: new Palette(store.catalog, options.tokens ?? defaultTokenResolver),
        icons: options.icons ?? new IconSet(),
        representation: store.representationInfo(options.representation),
        strings: buildStrings(options.strings),
        time: new TimeFormats(options.locale, options.durationUnits),
        options: options.options ?? new Map<string, string>(),
        slideHeader: options.slideHeader ?? null
    };

    const pagination = renderer.paginate(context);
    const pages: SVGGElement[] = [];
    for (let index = 0; index < pagination.count; index += 1) {
        pages.push(pagination.draw(index));
    }
    return { pages };
}

/**
 * Every slide of one representation, as SVG documents.
 */
export function renderPages(diagram: Diagram, options: RenderOptions): string[] {
    return withDocument(options.document, () => {
        const { pages } = drawn(diagram, options);
        const file = { serializer: options.serializer, ...options.file };
        return pages.map(page => serialize(page, file));
    });
}

/**
 * One slide, which is what a mail or a report usually wants. Out of range asks for the last one.
 */
export function renderPage(diagram: Diagram, options: RenderOptions, pageIndex = 0): string {
    return withDocument(options.document, () => {
        const { pages } = drawn(diagram, options);
        const wanted = Math.min(Math.max(Math.trunc(pageIndex), 0), pages.length - 1);
        const page = pages[wanted];
        if (!page) {
            throw new Error(`The ${options.representation} renderer returned no page.`);
        }
        return serialize(page, { serializer: options.serializer, ...options.file });
    });
}

/** How many slides one representation of this diagram takes. */
export function countPages(diagram: Diagram, options: RenderOptions): number {
    return withDocument(options.document, () => drawn(diagram, options).pages.length);
}

export type { SerializeOptions, XmlSerializer };
