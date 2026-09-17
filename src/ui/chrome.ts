// The frame every representation is drawn inside: title block, accent rule, legend and footer. Keeping
// it here is what makes twelve different diagrams look like one deck.
//
// The margins are deliberately thin. A slide is not a window, so the diagram runs close to the edge and
// the drawing area gets the space instead.

import type { Side } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import type { RenderContext } from "./renderers/registry.js";
import { defaultSlideHeader, type SlideDetail, type SlideHeader, type SlideImpact } from "./slide-header.js";
import { group, line, rect, text, truncate } from "./svg.js";
import { FONT_STACK, textWidth, type Palette } from "./theme.js";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./viewport.js";

export const MARGIN = 26;
export const HEADER_HEIGHT = 78;
export const FOOTER_HEIGHT = 32;

export interface ContentArea {
    x: number;
    y: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
}

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - FOOTER_HEIGHT;

export const CONTENT: ContentArea = {
    x: MARGIN,
    y: MARGIN + HEADER_HEIGHT,
    width: CONTENT_WIDTH,
    height: CONTENT_HEIGHT,
    right: MARGIN + CONTENT_WIDTH,
    bottom: MARGIN + HEADER_HEIGHT + CONTENT_HEIGHT
};

const ACCENT_HEIGHT = 5;
const BOLD = 700;
const KICKER_SIZE = 10;
const TITLE_SIZE = 27;
const SUBTITLE_SIZE = 11.5;
const REFERENCE_SIZE = 14;
const IMPACT_LABEL_SIZE = 15;

// The title keeps at least this much of the width, however much the right hand block asks for
const MIN_TITLE_WIDTH = 560;
const META_GAP = 32;

const IMPACT_STEP_WIDTH = 26;
const IMPACT_STEP_GAP = 3;
const IMPACT_STEP_HEIGHT = 4;
const IMPACT_STEP_TINT = 0.74;

const DETAIL_LABEL_SIZE = 8.5;
const DETAIL_VALUE_SIZE = 9;
const DETAIL_LABEL_SPACING = 0.5;
const DETAIL_VALUE_SPACING = 0.4;
const DETAIL_LABEL_GAP = 6;
const DETAIL_CELL_GAP = 16;

export enum LegendStroke {
    Solid = "solid",
    Dashed = "dashed"
}

export interface LegendEntry {
    label: string;
    color: string;
    icon?: string;
    stroke?: LegendStroke;
}

export interface FrameOptions {
    page: number;
    pageCount: number;
    subtitle: string | null;
    legend: readonly LegendEntry[];
}

export interface Frame {
    root: SVGGElement;
    content: SVGGElement;
}

interface DetailCell extends SlideDetail {
    labelWidth: number;
    width: number;
}

/**
 * Builds the page and returns the group renderers append their content to.
 */
export function frame(context: RenderContext, { page, pageCount, subtitle, legend }: FrameOptions): Frame {
    const { store, palette, representation } = context;
    const headerContext = { incident: store.incident, store, palette, representation, page, pageCount, viewSubtitle: subtitle, strings: context.strings };
    const defaults = defaultSlideHeader(headerContext);
    const header = context.slideHeader ? context.slideHeader(defaults, headerContext) : defaults;

    const root = group({ "font-family": FONT_STACK });
    root.appendChild(rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, { fill: palette.surface }));

    // A rule across the top in the colour of the rating, rather than a bar down one side
    if (header.accentColor) {
        root.appendChild(rect(0, 0, PAGE_WIDTH, ACCENT_HEIGHT, { fill: header.accentColor }));
    }

    const details = measureDetails(header.details);
    const titleRoom = Math.max(MIN_TITLE_WIDTH, PAGE_WIDTH - MARGIN * 2 - metaWidth(context, header, details) - META_GAP);

    root.appendChild(text(truncate(header.kicker, KICKER_SIZE, titleRoom), MARGIN, MARGIN + 8, {
        "font-size": KICKER_SIZE, "font-weight": BOLD, "letter-spacing": 1.4, fill: palette.inkMuted
    }));
    root.appendChild(text(truncate(header.title, TITLE_SIZE, titleRoom), MARGIN, MARGIN + 38, {
        "font-size": TITLE_SIZE, "font-weight": BOLD, fill: palette.ink
    }));
    if (header.subtitle) {
        root.appendChild(text(truncate(header.subtitle, SUBTITLE_SIZE, titleRoom), MARGIN, MARGIN + 58, {
            "font-size": SUBTITLE_SIZE, fill: palette.inkMuted
        }));
    }

    root.appendChild(headerMeta(context, header, details));
    root.appendChild(line(MARGIN, MARGIN + HEADER_HEIGHT - 14, PAGE_WIDTH - MARGIN, MARGIN + HEADER_HEIGHT - 14, {
        stroke: palette.border, "stroke-width": 1
    }));

    const content = group({ "data-content": "true" });
    root.appendChild(content);
    root.appendChild(footer(context, legend, page, pageCount));
    return { root, content };
}

function measureDetails(details: readonly SlideDetail[]): DetailCell[] {
    return details.map(detail => {
        const labelWidth = textWidth(detail.label, { size: DETAIL_LABEL_SIZE, weight: BOLD, spacing: DETAIL_LABEL_SPACING });
        const valueWidth = textWidth(detail.value, { size: DETAIL_VALUE_SIZE, weight: BOLD, spacing: DETAIL_VALUE_SPACING });
        return { ...detail, labelWidth, width: labelWidth + DETAIL_LABEL_GAP + valueWidth };
    });
}

function detailsWidth(details: readonly DetailCell[]): number {
    return details.length === 0 ? 0 : details.reduce((sum, cell) => sum + cell.width, 0) + (details.length - 1) * DETAIL_CELL_GAP;
}

function scaleWidth(context: RenderContext): number {
    const steps = context.store.catalog.impactScale.levels.length;
    return steps * IMPACT_STEP_WIDTH + (steps - 1) * IMPACT_STEP_GAP;
}

/**
 * How wide the right hand block really is, so the title gets whatever it leaves instead of a fixed share.
 */
function metaWidth(context: RenderContext, header: SlideHeader, details: readonly DetailCell[]): number {
    return Math.max(
        header.reference ? textWidth(header.reference, { size: REFERENCE_SIZE, weight: BOLD, spacing: 1 }) : 0,
        header.impact ? textWidth(header.impact.label, { size: IMPACT_LABEL_SIZE, weight: BOLD, spacing: 1.2 }) : 0,
        header.impact?.showScale ? scaleWidth(context) : 0,
        detailsWidth(details)
    );
}

function headerMeta(context: RenderContext, header: SlideHeader, details: readonly DetailCell[]): SVGGElement {
    const { palette } = context;
    const node = group();
    const right = PAGE_WIDTH - MARGIN;

    if (header.reference) {
        node.appendChild(text(header.reference, right, MARGIN + 10, {
            "font-size": REFERENCE_SIZE, "font-weight": BOLD, "letter-spacing": 1, "text-anchor": "end", fill: palette.ink
        }));
    }
    if (header.impact) {
        node.appendChild(text(header.impact.label, right, MARGIN + 34, {
            "font-size": IMPACT_LABEL_SIZE, "font-weight": BOLD, "letter-spacing": 1.2, "text-anchor": "end", fill: header.impact.color
        }));
        if (header.impact.showScale) {
            // The scale takes the place of a rule, so it costs the header no height
            node.appendChild(impactScale(context, header.impact, right, MARGIN + 41));
        }
    }
    node.appendChild(detailRow(palette, details, right, MARGIN + 56));
    return node;
}

/**
 * The rating as a scale rather than a word. Every level is drawn and the one this incident sits on is
 * filled, so a reader sees how bad it is and how bad it could have been in the same glance.
 */
function impactScale(context: RenderContext, impact: SlideImpact, right: number, y: number): SVGGElement {
    const { palette, store } = context;
    const node = group();
    const levels = store.catalog.impactScale.levels;
    const left = right - scaleWidth(context);

    levels.forEach((level, index) => {
        node.appendChild(rect(left + index * (IMPACT_STEP_WIDTH + IMPACT_STEP_GAP), y, IMPACT_STEP_WIDTH, IMPACT_STEP_HEIGHT, {
            rx: 1.5,
            fill: level.level === impact.level ? impact.color : palette.tint(impact.color, IMPACT_STEP_TINT)
        }));
    });
    return node;
}

/**
 * Facts the host added, kept small on purpose so they explain the headline without competing with it.
 */
function detailRow(palette: Palette, details: readonly DetailCell[], right: number, y: number): SVGGElement {
    const node = group();
    let cursor = right - detailsWidth(details);

    details.forEach((cell, index) => {
        if (index > 0) {
            const rule = cursor - DETAIL_CELL_GAP / 2;
            node.appendChild(line(rule, y - 6, rule, y + 5, { stroke: palette.border, "stroke-width": 1 }));
        }
        node.appendChild(text(cell.label, cursor, y, {
            "font-size": DETAIL_LABEL_SIZE, "font-weight": BOLD, "letter-spacing": DETAIL_LABEL_SPACING,
            fill: palette.inkMuted, "dominant-baseline": "central"
        }));
        // Measured off the label rather than guessed from its length, so the value always sits the same
        // distance after the words it belongs to
        node.appendChild(text(cell.value, cursor + cell.labelWidth + DETAIL_LABEL_GAP, y, {
            "font-size": DETAIL_VALUE_SIZE, "font-weight": BOLD, "letter-spacing": DETAIL_VALUE_SPACING,
            fill: cell.color ?? palette.ink, "dominant-baseline": "central"
        }));
        cursor += cell.width + DETAIL_CELL_GAP;
    });
    return node;
}

function footer(context: RenderContext, legend: readonly LegendEntry[], page: number, pageCount: number): SVGGElement {
    const { palette } = context;
    const node = group();
    const y = PAGE_HEIGHT - MARGIN + 2;

    node.appendChild(line(MARGIN, y - 18, PAGE_WIDTH - MARGIN, y - 18, { stroke: palette.border, "stroke-width": 1 }));

    let cursor = MARGIN;
    legend.forEach(entry => {
        cursor += legendEntry(context, node, entry, cursor, y - 3) + 18;
    });

    if (pageCount > 1) {
        node.appendChild(text(`${page + 1} / ${pageCount}`, PAGE_WIDTH - MARGIN, y - 2, {
            "font-size": 11, "text-anchor": "end", fill: palette.inkMuted
        }));
    }
    return node;
}

const LEGEND_LABEL_CHAR = 6;

function legendEntry(context: RenderContext, parent: SVGGElement, entry: LegendEntry, x: number, y: number): number {
    const { palette, icons } = context;

    // A line style is worth showing as a line, otherwise a dashed link reads as another coloured block
    if (entry.stroke) {
        parent.appendChild(line(x, y - 3.5, x + 15, y - 3.5, {
            stroke: entry.color,
            "stroke-width": 1.8,
            "stroke-dasharray": entry.stroke === LegendStroke.Dashed ? "4 3" : null
        }));
    } else {
        parent.appendChild(rect(x, y - 11, 15, 15, { rx: 4, fill: entry.color }));
        if (entry.icon) {
            parent.appendChild(icons.draw(entry.icon, x + 7.5, y - 3.5, 9, palette.onColor));
        }
    }

    parent.appendChild(text(entry.label.toUpperCase(), x + 21, y - 4, {
        "font-size": 9.5, "font-weight": BOLD, "letter-spacing": 0.7, fill: palette.inkMuted, "dominant-baseline": "central"
    }));
    return 21 + entry.label.length * LEGEND_LABEL_CHAR;
}

/**
 * Legend describing the sides actually present in a set of records.
 */
export function sideLegend(context: RenderContext, records: readonly { side: Side }[]): LegendEntry[] {
    const present = new Set(records.map(record => record.side));
    return context.store.catalog.sides
        .filter(side => present.has(side.side))
        .map(side => ({ label: side.label, color: context.palette.sides[side.side].color, icon: side.icon }));
}

/**
 * Message shown instead of a diagram when the records needed for that view are missing.
 */
export function placeholder(context: RenderContext, message: string, hint: string | null): SVGGElement {
    const { palette, icons } = context;
    const node = group();
    const centerX = CONTENT.x + CONTENT.width / 2;
    const centerY = CONTENT.y + CONTENT.height / 2;

    node.appendChild(icons.draw(Icon.Graph, centerX, centerY - 34, 30, palette.borderStrong));
    node.appendChild(text(message, centerX, centerY + 4, { "font-size": 16, "font-weight": 600, "text-anchor": "middle", fill: palette.inkMuted }));
    if (hint) {
        node.appendChild(text(hint, centerX, centerY + 26, { "font-size": 12.5, "text-anchor": "middle", fill: palette.inkMuted }));
    }
    return node;
}
