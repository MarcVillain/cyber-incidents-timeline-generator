// The plain account of the incident: an arrow running left to right, a marker per step, and the story
// blocks hanging off it.
//
// Four sizings share one layout. Comfortable and Compact run a single arrow with the blocks above and
// below it. Stacked runs three shorter arrows with every block underneath, which keeps the subtext and
// still fills the slide. Rows runs two arrows with blocks on both sides, which fits the most steps.
//
// How many lines of subtext a block shows is worked out from the room the sizing leaves, so the blocks
// use the height available instead of stopping at a fixed number of lines.

import { Representation } from "../../core/enums.js";
import { formatDate, formatDuration, formatTime, hoursBetween } from "../../core/time.js";
import { cardFooterHeight, stepCard, stepCardHeight, stepMarker, titleLayout } from "../cards.js";
import { CONTENT, frame, placeholder, sideLegend } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { paginate } from "../geometry.js";
import { arrowMarker, el, group, line, rect, text } from "../svg.js";
import type { Palette } from "../theme.js";
import { defineRenderer, optionValue, type RenderContext, type RendererOption } from "./registry.js";
import type { Strings } from "../strings.js";

enum Density {
    Comfortable = "comfortable",
    Compact = "compact",
    Stacked = "stacked",
    Rows = "rows"
}

interface DensityLayout {
    cardWidth: number;
    slot: number;
    rows: number;
    alternate: boolean;
    marker: number;
    gap: number;
}

const DENSITIES: Readonly<Record<Density, DensityLayout>> = {
    [Density.Comfortable]: { cardWidth: 292, slot: 158, rows: 1, alternate: true, marker: 19, gap: 44 },
    [Density.Compact]: { cardWidth: 168, slot: 88, rows: 1, alternate: true, marker: 15, gap: 34 },
    // Blocks that all hang on the same side need a full card width between them, not half of one. The
    // width is kept above the point where the footer has to stack, which buys back subtext lines.
    [Density.Stacked]: { cardWidth: 252, slot: 264, rows: 3, alternate: false, marker: 14, gap: 22 },
    [Density.Rows]: { cardWidth: 238, slot: 126, rows: 2, alternate: true, marker: 14, gap: 22 }
};

function densityOption(strings: Strings): RendererOption<Density> {
    return {
        id: "density",
        label: strings.options.density,
        fallback: Density.Comfortable,
        choices: [
            { value: Density.Comfortable, label: strings.options.densityComfortable },
            { value: Density.Compact, label: strings.options.densityCompact },
            { value: Density.Stacked, label: strings.options.densityStacked },
            { value: Density.Rows, label: strings.options.densityRows }
        ]
    };
}

// What a card spends before its subtext, leaving aside the title, whose height varies
const CARD_CHROME = 51;
const BODY_LINE = 15;
const MAX_BODY_LINES = 10;
const CARD_MIN_HEIGHT = 112;
const AXIS_HEADROOM = 22;
const AXIS_ARROW = "tlg-axis-arrow";
const GAP_LABEL_MIN_HOURS = 0.5;
const GAP_LABEL_MIN_ROOM = 74;

function densityOf(context: RenderContext): DensityLayout {
    return DENSITIES[optionValue(context, densityOption(context.strings))];
}

function perRow(density: DensityLayout): number {
    return Math.max(2, Math.floor((CONTENT.width - density.cardWidth) / density.slot) + 1);
}

function bandHeight(density: DensityLayout): number {
    return CONTENT.height / density.rows;
}

/**
 * The tallest a card may be in this sizing, and from that how many lines of subtext it can hold. Titles
 * come first, so a page of long ones simply leaves less room for the subtext under them.
 */
function budget(density: DensityLayout, steps: readonly TimelineStep[]): { ceiling: number; lines: number } {
    const band = bandHeight(density);
    const ceiling = density.alternate ? band / 2 - density.gap : band - AXIS_HEADROOM - density.gap - 4;
    const inner = density.cardWidth - 32;
    const titleHeight = Math.max(0, ...steps.map(step => {
        const title = titleLayout(step.title, inner);
        return title.lines.length * title.lineHeight;
    }));
    const room = ceiling - CARD_CHROME - titleHeight - cardFooterHeight(density.cardWidth) - 4;
    return { ceiling, lines: Math.max(0, Math.min(MAX_BODY_LINES, Math.floor(room / BODY_LINE))) };
}

/**
 * Cards in one band all take the height of the fullest, so the row of blocks lines up on the arrow
 * without leaving a gap under the shorter ones.
 */
function cardHeightFor(steps: readonly TimelineStep[], density: DensityLayout): number {
    const { ceiling, lines } = budget(density, steps);
    const needed = Math.max(CARD_MIN_HEIGHT, ...steps.map(step => stepCardHeight(step, density.cardWidth, lines)));
    return Math.min(needed, ceiling);
}

function gapLabel(previous: TimelineStep, next: TimelineStep): string | null {
    const hours = hoursBetween(previous.at, next.at);
    if (hours === null || hours < GAP_LABEL_MIN_HOURS) return null;
    return `+${formatDuration(hours)}`;
}

function axis(palette: Palette, steps: readonly TimelineStep[], positions: readonly number[], axisY: number): SVGGElement {
    const node = group();
    const first = positions[0] ?? CONTENT.x;
    const last = positions.at(-1) ?? CONTENT.x;
    const tail = Math.max(CONTENT.x + 12, first - 50);
    const head = Math.min(CONTENT.right - 12, last + 60);

    node.appendChild(line(tail, axisY, first, axisY, { stroke: palette.border, "stroke-width": 4, "stroke-linecap": "round" }));

    for (let index = 0; index < positions.length - 1; index += 1) {
        const from = positions[index] ?? 0;
        const to = positions[index + 1] ?? 0;
        const previous = steps[index];
        const next = steps[index + 1];
        if (!previous || !next) continue;

        node.appendChild(line(from, axisY, to, axisY, {
            stroke: palette.sides[next.side].color, "stroke-width": 4, "stroke-linecap": "round", opacity: 0.55
        }));

        const elapsed = gapLabel(previous, next);
        if (!elapsed || to - from < GAP_LABEL_MIN_ROOM) continue;

        // Set on the arrow itself, so it never lands on the clock times sitting beside it
        const midX = (from + to) / 2;
        const width = elapsed.length * 5.6 + 10;
        node.appendChild(rect(midX - width / 2, axisY - 7, width, 14, { rx: 7, fill: palette.surface }));
        node.appendChild(text(elapsed, midX, axisY, {
            "font-size": 9.5, "text-anchor": "middle", "dominant-baseline": "central", "font-weight": 700, fill: palette.borderStrong
        }));
    }

    node.appendChild(line(last, axisY, head, axisY, {
        stroke: palette.borderStrong, "stroke-width": 4, "stroke-linecap": "round", "marker-end": `url(#${AXIS_ARROW})`
    }));
    return node;
}

export const sequentialTimeline = defineRenderer<TimelineStep[]>({
    representation: Representation.SequentialTimeline,
    options: strings => [densityOption(strings)],

    pages(context) {
        const density = densityOf(context);
        return paginate(context.store.visibleSteps(), perRow(density) * density.rows);
    },

    draw(context, pageSteps, pageIndex, pageCount) {
        const { palette } = context;
        const density = densityOf(context);
        const first = pageSteps[0];
        const last = pageSteps.at(-1);

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: first && last ? `${formatDate(first.at)} to ${formatDate(last.at)}` : null,
            legend: sideLegend(context, pageSteps)
        });

        if (pageSteps.length === 0) {
            content.appendChild(placeholder(context, context.strings.scene.emptyTimelineTitle, context.strings.scene.emptyTimelineHint));
            return root;
        }

        content.appendChild(el("defs", {}, [arrowMarker(AXIS_ARROW, palette.borderStrong, { refX: 6, size: 5 })]));

        const columns = perRow(density);
        const band = bandHeight(density);
        const lines = budget(density, pageSteps).lines;
        const cardHeight = cardHeightFor(pageSteps, density);

        for (let rowIndex = 0; rowIndex < density.rows; rowIndex += 1) {
            const rowSteps = pageSteps.slice(rowIndex * columns, (rowIndex + 1) * columns);
            if (rowSteps.length === 0) break;

            const axisY = density.alternate
                ? CONTENT.y + band * rowIndex + band / 2
                : CONTENT.y + band * rowIndex + AXIS_HEADROOM;

            const spanWidth = (rowSteps.length - 1) * density.slot;
            const startX = CONTENT.x + Math.max(density.cardWidth / 2, (CONTENT.width - spanWidth) / 2);
            const positions = rowSteps.map((_, index) => startX + index * density.slot);

            content.appendChild(axis(palette, rowSteps, positions, axisY));

            rowSteps.forEach((step, index) => {
                const x = positions[index] ?? startX;
                const above = density.alternate && index % 2 === 0;
                const cardX = x - density.cardWidth / 2;
                const cardY = above ? axisY - density.gap - cardHeight : axisY + density.gap;

                content.appendChild(line(
                    x, above ? cardY + cardHeight : axisY + density.marker,
                    x, above ? axisY - density.marker : cardY,
                    { stroke: palette.border, "stroke-width": 1.5, "stroke-dasharray": "3 3" }
                ));

                content.appendChild(stepCard(context, step, cardX, cardY, density.cardWidth, cardHeight, lines));
                content.appendChild(stepMarker(context, step, x, axisY, density.marker));

                // When blocks alternate there is barely a card width of free space beside a marker, so a
                // clock label there would run under the block opposite. The card header carries the full
                // date and time anyway, and only the one sided sizings have room to repeat it.
                if (!density.alternate) {
                    content.appendChild(text(formatTime(step.at), x, axisY - density.marker - 8, {
                        "font-size": 10.5, "font-weight": 600, "text-anchor": "middle", fill: palette.inkMuted
                    }));
                }
            });
        }
        return root;
    }
});
