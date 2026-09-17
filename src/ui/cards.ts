// The building blocks most representations share: the card describing a step, the tile standing for a
// record, and the micro labels that carry the classification.
//
// The look is deliberately instrument panel rather than notecard: a tinted header strip carrying the
// time and the technique, and labels set as small caps rules instead of pills.

import { AttackTactic, Confidence, ResponsePhase, Side, StepOutcome } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import type { DiagramNode } from "../core/models.js";
import { TimeFormats, hoursBetween } from "../core/time.js";

const DEFAULT_TIME = new TimeFormats();
import type { TimelineStep } from "./diagram-store.js";
import type { RenderContext } from "./renderers/registry.js";
import { circle, el, group, line, measure, path, rect, roundedPath, stripTags, text, topRoundedPath, truncate, wrap } from "./svg.js";
import type { Palette } from "./theme.js";

export const CORNER = 8;
export const HEADER_STRIP = 25;

const CARD_TOP = HEADER_STRIP + 22;

// Sizes a title is allowed to take, largest first. Each step down buys a line, so a long title lands as
// smaller type on more rows rather than as a sentence with its end cut off.
const TITLE_STEPS: readonly { size: number; lines: number }[] = [
    { size: 15, lines: 2 },
    { size: 14, lines: 2 },
    { size: 13, lines: 3 },
    { size: 12, lines: 3 },
    { size: 11, lines: 4 },
    { size: 10, lines: 5 },
    { size: 9, lines: 7 }
];
const LAST_TITLE_STEP = { size: 9, lines: 7 };
const CARD_BODY_LINE = 15;
const CARD_BODY_SIZE = 11.5;
const TITLE_LAST_RESORT_LINES = 14;
const FIT_STEP = 0.5;

// A wide card fits who acted and what they acted on side by side. A narrow one has to stack them,
// otherwise both names end up cut short exactly where the reader needs them.
const NARROW_CARD = 250;
const FOOTER_WIDE = 52;
const FOOTER_STACKED = 70;

// Uppercase 10px bold with the letter spacing the header strip uses
const STAMP_CHAR = 6.4;
const BADGE_CHAR = 5.6;
const MICRO_CHAR = 5.6;
const MICRO_LABEL_MAX = 110;
const HEADER_TINT = 0.9;
const HEADER_RULE_TINT = 0.68;
const BADGE_SHADE = 0.28;
const TILE_TINT = 0.86;

export function cardFooterHeight(width: number): number {
    return width < NARROW_CARD ? FOOTER_STACKED : FOOTER_WIDE;
}

export function stepColor(palette: Palette, step: TimelineStep): string {
    return palette.sides[step.side].color;
}

export function nodeColor(palette: Palette, node: DiagramNode): string {
    return node.colorOverride ?? palette.sides[node.side].color;
}

/**
 * What an outcome means depends on who acted. An attempt that failed is good news when the attacker
 * made it and bad news when the response did, so the colour follows the side rather than the word.
 * Blocked is the exception: whoever the step belongs to, something was stopped.
 */
export function outcomeColor(palette: Palette, step: TimelineStep): string {
    const attacking = step.side === Side.Attacker;
    const responding = step.side === Side.Defender || step.side === Side.ThirdParty;

    switch (step.outcome) {
        case StepOutcome.Blocked:
            return palette.good;
        case StepOutcome.Failed:
            return attacking ? palette.good : palette.sides[Side.Attacker].color;
        case StepOutcome.Succeeded:
            if (attacking) return palette.sides[Side.Attacker].color;
            if (responding) return palette.good;
            // A victim step that simply happened is neither good news nor bad
            return palette.inkMuted;
        default:
            return palette.outcomes[step.outcome];
    }
}

/**
 * The short classification of a step, shown on the right of its header strip.
 */
export function stepBadge(context: RenderContext, step: TimelineStep): string | null {
    if (step.mitreTechniqueId) return step.mitreTechniqueId;
    if (step.side === Side.Defender && step.responsePhase !== ResponsePhase.None) return context.store.responseInfo(step.responsePhase).label;
    if (step.attackTactic !== AttackTactic.None) return context.store.tacticInfo(step.attackTactic).label;
    return null;
}

export interface FittedLines {
    size: number;
    lineHeight: number;
    lines: string[];
}

export interface FitOptions {
    size?: number;
    minSize?: number;
    maxLines?: number;
}

/**
 * Fits a piece of text into a box without ever cutting it. It tries the size asked for and drops half a
 * point at a time until the whole thing lands inside the lines allowed. Small type reads; half a
 * sentence does not.
 */
export function fitLines(content: string | null, width: number, { size = 12, minSize = 8, maxLines = 3 }: FitOptions = {}): FittedLines {
    const value = (content ?? "").trim();
    for (let current = size; current >= minSize; current -= FIT_STEP) {
        const lines = wrap(value, current, width, maxLines);
        if (lines.join(" ").length >= value.length) {
            return { size: current, lineHeight: current + 3, lines };
        }
    }
    return { size: minSize, lineHeight: minSize + 3, lines: wrap(value, minSize, width, maxLines) };
}

export interface FittedText {
    text: string;
    size: number;
}

/**
 * The one line version of the same idea: names and identifiers keep their last characters by giving up
 * a little size, and are only shortened when even the smallest type will not hold them.
 */
export function fitText(content: string | null, width: number, { size = 11, minSize = 7 }: FitOptions = {}): FittedText {
    const value = (content ?? "").trim();
    for (let current = size; current >= minSize; current -= FIT_STEP) {
        if (measure(value, current) <= width) return { text: value, size: current };
    }
    return { text: truncate(value, minSize, width), size: minSize };
}

/**
 * A title is never cut. It is set at the largest size that still holds all of it, dropping a point and
 * gaining a line until the whole thing fits.
 */
export function titleLayout(title: string, inner: number): FittedLines {
    const value = title.trim();
    for (const attempt of TITLE_STEPS) {
        const lines = wrap(value, attempt.size, inner, attempt.lines);
        if (lines.join(" ").length >= value.length) {
            return { size: attempt.size, lineHeight: attempt.size + 4, lines };
        }
    }
    return { size: LAST_TITLE_STEP.size, lineHeight: LAST_TITLE_STEP.size + 4, lines: wrap(value, LAST_TITLE_STEP.size, inner, TITLE_LAST_RESORT_LINES) };
}

/**
 * Height a card needs for its own content. Callers take the tallest of a set so a row lines up without
 * leaving a hole under the shorter ones.
 */
export function stepCardHeight(step: TimelineStep, width: number, descriptionLines: number): number {
    const inner = width - 32;
    const title = titleLayout(step.title, inner);
    let height = CARD_TOP + title.lines.length * title.lineHeight;
    if (step.description && descriptionLines > 0) {
        height += 4 + wrap(stripTags(step.description), CARD_BODY_SIZE, inner, descriptionLines).length * CARD_BODY_LINE;
    }
    return height + cardFooterHeight(width);
}

export function stepCard(context: RenderContext, step: TimelineStep, x: number, y: number, width: number, height: number, descriptionLines: number): SVGGElement {
    const { palette } = context;
    const accent = stepColor(palette, step);
    const node = group({ class: "tlg-step", "data-step-id": step.id });

    node.appendChild(rect(x, y, width, height, { rx: CORNER, fill: palette.surface }));
    node.appendChild(headerStrip(context, step, x, y, width, accent));
    node.appendChild(clippedBottomAccent(x, y, width, height, accent));

    const left = x + 16;
    const inner = width - 32;
    let cursor = y + CARD_TOP;

    const title = titleLayout(step.title, inner);
    title.lines.forEach(lineText => {
        node.appendChild(text(lineText, left, cursor, { "font-size": title.size, "font-weight": 600, fill: palette.ink }));
        cursor += title.lineHeight;
    });

    if (step.description && descriptionLines > 0) {
        cursor += 4;
        wrap(stripTags(step.description), CARD_BODY_SIZE, inner, descriptionLines).forEach(lineText => {
            node.appendChild(text(lineText, left, cursor, { "font-size": CARD_BODY_SIZE, fill: palette.inkMuted }));
            cursor += CARD_BODY_LINE;
        });
    }

    const baseline = y + height - 14;
    node.appendChild(participants(context, step, left, baseline, inner, width < NARROW_CARD));
    node.appendChild(microLabels(palette, labelsFor(context, step), left, baseline, inner));

    // The outline goes on last, so the tinted strip and the accent cannot eat the border they sit against
    node.appendChild(cardOutline(palette, x, y, width, height, null));
    return node;
}

/**
 * The border of a card, drawn over everything inside it so it stays unbroken all the way round.
 */
export function cardOutline(palette: Palette, x: number, y: number, width: number, height: number, color: string | null): SVGRectElement {
    return rect(x, y, width, height, {
        rx: CORNER,
        fill: "none",
        stroke: color ?? palette.border,
        "stroke-width": color ? 1.8 : 1
    });
}

let clipSequence = 0;

/**
 * A straight rule along the bottom of a card, clipped by the rounded outline so it stops where the
 * corner does instead of bending around it.
 */
function clippedBottomAccent(x: number, y: number, width: number, height: number, accent: string): SVGGElement {
    clipSequence += 1;
    const id = `tlg-card-clip-${clipSequence}`;
    return group({}, [
        el("clipPath", { id }, [path(roundedPath(x, y, width, height, CORNER))]),
        rect(x, y + height - 3, width, 3, { fill: accent, "clip-path": `url(#${id})` })
    ]);
}

/**
 * Tinted strip across the top of a card: when it happened on the left, how it is classified on the right.
 */
export function headerStrip(context: RenderContext, step: TimelineStep, x: number, y: number, width: number, accent: string): SVGGElement {
    const { palette } = context;
    const node = group();

    node.appendChild(path(topRoundedPath(x, y, width, HEADER_STRIP, CORNER), { fill: palette.tint(accent, HEADER_TINT) }));
    node.appendChild(line(x, y + HEADER_STRIP, x + width, y + HEADER_STRIP, { stroke: palette.tint(accent, HEADER_RULE_TINT), "stroke-width": 1 }));

    const badge = stepBadge(context, step);
    const badgeText = badge ? badge.toUpperCase() : "";
    const badgeWidth = badgeText.length * BADGE_CHAR;

    // A narrow card cannot hold both, and the date is the one that always has to be there
    const room = width - 32;
    const variants = momentVariants(step, context.time).map(value => value.toUpperCase());
    const stamp = variants.find(value => value.length * STAMP_CHAR <= room) ?? variants.at(-1) ?? "";
    const showBadge = badge !== null && stamp.length * STAMP_CHAR + badgeWidth + 56 <= width;

    node.appendChild(text(stamp, x + 16, y + HEADER_STRIP / 2 + 1, {
        "font-size": 10, "font-weight": 700, "letter-spacing": 0.7, fill: accent, "dominant-baseline": "central"
    }));

    if (showBadge) {
        node.appendChild(text(badgeText, x + width - 16, y + HEADER_STRIP / 2 + 1, {
            "font-size": 9.5, "font-weight": 700, "letter-spacing": 0.7, "text-anchor": "end",
            fill: palette.shade(accent, BADGE_SHADE), "dominant-baseline": "central"
        }));
    }
    return node;
}

/**
 * When a step lasted, its span is worth as much as its start, so both are shown. Narrow cards get a
 * shorter wording of the same thing rather than a stamp running off the edge, hence the ladder from
 * the full range down to the bare start date.
 */
export function momentVariants(step: TimelineStep, time: TimeFormats = DEFAULT_TIME): string[] {
    if (!step.at) return [""];
    const start = time.formatMoment(step);
    if (!step.until) return [start];

    const sameDay = step.until.toDateString() === step.at.toDateString();
    const end = sameDay && step.timeKnown ? time.formatTime(step.until) : time.formatMoment({ at: step.until, timeKnown: step.timeKnown });

    const variants = [`${start} to ${end}`];
    if (!sameDay) {
        variants.push(`${start} to ${time.formatDateShort(step.until)}`);
        variants.push(`${time.formatDateShort(step.at)} to ${time.formatDateShort(step.until)}`);
    }
    variants.push(start);
    variants.push(time.formatDate(step.at));
    return variants;
}

export interface MicroLabel {
    label: string;
    color: string;
}

function labelsFor(context: RenderContext, step: TimelineStep): MicroLabel[] {
    const { palette, store } = context;
    const entries: MicroLabel[] = [];
    if (step.outcome !== StepOutcome.Unknown) {
        entries.push({ label: store.outcomeInfo(step.outcome).label, color: outcomeColor(palette, step) });
    }
    const lasted = context.time.formatDuration(hoursBetween(step.at, step.until));
    if (step.until && lasted) {
        entries.push({ label: `lasted ${lasted}`, color: palette.inkMuted });
    }
    if (step.confidence !== Confidence.Confirmed) {
        entries.push({ label: step.confidence, color: palette.inkMuted });
    }
    step.tags.slice(0, 2).forEach(tag => entries.push({ label: tag, color: palette.inkMuted }));
    return entries;
}

/**
 * Small caps labels separated by hairlines. Reads as a classification line rather than a row of pills.
 */
export function microLabels(palette: Palette, entries: readonly MicroLabel[], x: number, y: number, width: number): SVGGElement {
    const node = group();
    let cursor = x;

    entries.forEach((entry, index) => {
        const label = truncate(entry.label.toUpperCase(), 9, MICRO_LABEL_MAX);
        const size = label.length * MICRO_CHAR + 4;
        if (cursor + size > x + width) return;

        if (index > 0) {
            node.appendChild(line(cursor - 5, y - 6, cursor - 5, y + 4, { stroke: palette.border, "stroke-width": 1 }));
        }
        node.appendChild(text(label, cursor, y, {
            "font-size": 9, "font-weight": 700, "letter-spacing": 0.8, fill: entry.color, "dominant-baseline": "central"
        }));
        cursor += size + 10;
    });
    return node;
}

function participants(context: RenderContext, step: TimelineStep, x: number, baseline: number, width: number, stacked: boolean): SVGGElement {
    const { store, palette, icons } = context;
    const node = group();
    const source = store.node(step.sourceNodeId);
    const target = store.node(step.targetNodeId);
    if (!source && !target) return node;

    const nodeLabel = (item: DiagramNode, itemX: number, itemY: number, maxWidth: number, arrow: boolean): number => {
        let cursorX = itemX;
        if (arrow) {
            node.appendChild(icons.draw(Icon.ArrowRight, cursorX + 5, itemY, 10, palette.borderStrong));
            cursorX += 14;
        }
        node.appendChild(iconTile(context, item, cursorX, itemY - 7, 14));
        const label = fitText(item.name, maxWidth - (cursorX - itemX) - 22, { size: 11, minSize: 7.5 });
        node.appendChild(text(label.text, cursorX + 20, itemY, { "font-size": label.size, fill: palette.ink, "dominant-baseline": "central" }));
        return (cursorX - itemX) + 20 + measure(label.text, label.size) + 8;
    };

    if (stacked) {
        let row = baseline - 40;
        if (source) {
            nodeLabel(source, x, row, width, false);
            row += 18;
        }
        if (target) {
            nodeLabel(target, x, row, width, source !== null);
        }
        return node;
    }

    let cursor = x;
    if (source) {
        cursor += nodeLabel(source, cursor, baseline - 20, Math.min(150, width / 2 - 10), false);
    }
    if (source && target) {
        node.appendChild(icons.draw(Icon.ArrowRight, cursor + 8, baseline - 20, 10, palette.borderStrong));
        cursor += 20;
    }
    if (target) {
        nodeLabel(target, cursor, baseline - 20, width - (cursor - x), false);
    }
    return node;
}

/**
 * Square tile carrying the icon of a record. Used everywhere a record needs to be recognised at a glance.
 */
export function iconTile(context: RenderContext, item: DiagramNode, x: number, y: number, size: number): SVGGElement {
    const { palette, icons, store } = context;
    const color = nodeColor(palette, item);
    return group({}, [
        rect(x, y, size, size, { rx: 4, fill: palette.tint(color, TILE_TINT) }),
        icons.draw(store.nodeIcon(item), x + size / 2, y + size / 2, size * 0.66, color)
    ]);
}

/**
 * Marker sitting on an axis, carrying the icon of the step it stands for.
 */
export function stepMarker(context: RenderContext, step: TimelineStep, x: number, y: number, radius: number): SVGGElement {
    const { palette, icons, store } = context;
    const accent = stepColor(palette, step);
    return group({ class: "tlg-step-marker", "data-step-id": step.id }, [
        circle(x, y, radius + 4, { fill: palette.surface }),
        circle(x, y, radius, {
            fill: step.isMilestone ? accent : palette.surface,
            stroke: accent,
            "stroke-width": step.isMilestone ? 0 : 2
        }),
        icons.draw(store.stepIcon(step), x, y, radius * 1.05, step.isMilestone ? palette.onColor : accent)
    ]);
}

/**
 * Compact box standing for a record inside a graph.
 */
export function nodeBox(context: RenderContext, item: DiagramNode, width: number, height: number): SVGGElement {
    const { palette, icons, store } = context;
    const node = group({ class: "tlg-node", "data-node-id": item.id });

    node.appendChild(rect(0, 0, width, height, { rx: CORNER, fill: palette.surface, stroke: palette.border, "stroke-width": 1 }));

    const tile = Math.min(28, height - 16);
    const tileY = (height - tile) / 2;
    node.appendChild(iconTile(context, item, 10, tileY, tile));

    if (item.compromised) {
        node.appendChild(rect(10 + tile - 7, tileY - 4, 11, 11, { rx: 3, fill: palette.sides[Side.Attacker].color }));
        node.appendChild(icons.draw(Icon.Compromised, 10 + tile - 1.5, tileY + 1.5, 8, palette.onColor));
    }

    const textX = 18 + tile;
    const room = width - textX - 10;
    const subtitle = item.identifier ?? item.role ?? store.kindInfo(item.kind).label;

    const nameFit = fitText(item.name, room, { size: 12.5, minSize: 8 });
    node.appendChild(text(nameFit.text, textX, height / 2 - 5, { "font-size": nameFit.size, "font-weight": 600, fill: palette.ink }));
    const subtitleFit = fitText(subtitle, room, { size: 10.5, minSize: 7 });
    node.appendChild(text(subtitleFit.text, textX, height / 2 + 10, { "font-size": subtitleFit.size, fill: palette.inkMuted }));
    return node;
}
