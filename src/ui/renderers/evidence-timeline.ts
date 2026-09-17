// Which source saw what, and when nothing was watching. The gaps are the point of this view.

import { Representation, Side } from "../../core/enums.js";
import { Icon } from "../../core/icon.js";
import { formatDate, formatDuration, hoursBetween } from "../../core/time.js";
import { timeAxis } from "../axis.js";
import { fitText } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { paginateGroups, timeScale, type TimeScale, type Weighted } from "../geometry.js";
import { circle, group, line, rect, text } from "../svg.js";
import type { Palette } from "../theme.js";
import { defineRenderer } from "./registry.js";
import type { SceneStrings } from "../strings.js";

const GUTTER = 208;
const AXIS_HEADROOM = 44;
const MIN_ROW_HEIGHT = 34;
const MAX_ROW_HEIGHT = 96;
const COVERAGE_HEIGHT = 40;
const NAMED_GAPS = 3;
const MIN_GAP_HOURS = 6;
const RIBBON = 18;
const TRACK_INSET = 30;
const LIT_MIN_WIDTH = 7;
const LIT_SHARE = 0.01;

interface Source extends Weighted {
    /** Null gathers the steps nobody named a source for. */
    name: string | null;
    label: string;
    steps: TimelineStep[];
}

interface Gap {
    from: Date;
    to: Date;
    hours: number;
}

function buildSources(steps: readonly TimelineStep[], words: SceneStrings): Source[] {
    const sources = new Map<string | null, Source>();
    steps.forEach(step => {
        const name = step.evidenceSource?.trim() || null;
        let source = sources.get(name);
        if (!source) {
            source = { name, label: name ?? words.noSourceRecorded, steps: [], weight: 1 };
            sources.set(name, source);
        }
        source.steps.push(step);
    });

    return [...sources.values()].sort((a, b) => {
        if (a.name === null) return 1;
        if (b.name === null) return -1;
        return b.steps.length - a.steps.length;
    });
}

/**
 * The stretches between two consecutive observations, which is where the incident ran unseen.
 */
function blindSpots(steps: readonly TimelineStep[]): Gap[] {
    const moments = steps.map(step => step.at).filter((at): at is Date => at !== null).sort((a, b) => a.getTime() - b.getTime());
    const gaps: Gap[] = [];
    moments.forEach((from, index) => {
        const to = moments[index + 1];
        const hours = to ? hoursBetween(from, to) : null;
        if (to && hours !== null && hours >= MIN_GAP_HOURS) {
            gaps.push({ from, to, hours });
        }
    });
    return gaps;
}

/**
 * A ribbon of the whole incident window showing where the record has something to say. A lit piece is a
 * moment somebody wrote down, not proof anyone was watching at the time, so it is drawn in the neutral
 * accent rather than a reassuring green. The longest empty stretches are shaded across their real width,
 * so a month of silence looks like a month and not like a tag sitting on the bar.
 */
function coverage(palette: Palette, scale: TimeScale, steps: readonly TimelineStep[], x: number, y: number, width: number): SVGGElement {
    const node = group();
    const attacker = palette.sides[Side.Attacker].color;
    node.appendChild(text("RECORD TRAIL", x - 190, y + 14, { "font-size": 10, "font-weight": 700, "letter-spacing": 0.8, fill: palette.inkMuted }));
    node.appendChild(rect(x, y, width, RIBBON, { rx: RIBBON / 2, fill: palette.tint(palette.inkMuted, 0.88) }));

    if (scale.collapsed) {
        node.appendChild(rect(x, y, width, RIBBON, { rx: RIBBON / 2, fill: palette.tint(palette.accent, 0.5) }));
        return node;
    }

    const gaps = blindSpots(steps);
    const named = new Set([...gaps].sort((a, b) => b.hours - a.hours).slice(0, NAMED_GAPS));

    gaps.forEach(gap => {
        const from = scale.at(gap.from);
        node.appendChild(rect(from, y, Math.max(1, scale.at(gap.to) - from), RIBBON, { fill: palette.tint(attacker, named.has(gap) ? 0.62 : 0.86) }));
    });

    const lit = Math.max(LIT_MIN_WIDTH, width * LIT_SHARE);
    steps.forEach(step => {
        if (!step.at) return;
        node.appendChild(rect(scale.at(step.at) - lit / 2, y, lit, RIBBON, { fill: palette.tint(palette.accent, 0.35) }));
    });

    named.forEach(gap => {
        const from = scale.at(gap.from);
        const to = scale.at(gap.to);
        const label = formatDuration(gap.hours) ?? "";
        const boxWidth = label.length * 5.6 + 12;
        if (to - from < boxWidth + 8) return;

        const middle = (from + to) / 2;
        node.appendChild(rect(middle - boxWidth / 2, y + 1, boxWidth, RIBBON - 2, { rx: (RIBBON - 2) / 2, fill: palette.surface, opacity: 0.9 }));
        node.appendChild(text(label, middle, y + RIBBON / 2, {
            "font-size": 9.5, "font-weight": 700, "text-anchor": "middle", "dominant-baseline": "central", fill: attacker
        }));
    });
    return node;
}

export const evidenceTimeline = defineRenderer<Source[]>({
    representation: Representation.EvidenceTimeline,

    pages(context) {
        const sources = buildSources(context.store.visibleSteps(), context.strings.scene);
        if (sources.length === 0) return [[]];
        const capacity = Math.max(1, Math.floor((CONTENT.height - AXIS_HEADROOM - COVERAGE_HEIGHT) / MIN_ROW_HEIGHT));
        return paginateGroups(sources, capacity);
    },

    draw(context, sources, pageIndex, pageCount) {
        const { store, palette, icons } = context;
        const allSteps = store.visibleSteps();
        const first = allSteps[0];
        const last = allSteps.at(-1);

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: first && last ? `${formatDate(first.at)} to ${formatDate(last.at)}` : null,
            legend: [
                { label: context.strings.scene.somethingRecorded, color: palette.accent },
                { label: context.strings.scene.nothingRecorded, color: palette.sides[Side.Attacker].color }
            ]
        });

        if (sources.length === 0) {
            content.appendChild(placeholder(context, context.strings.scene.emptyEvidenceTitle, context.strings.scene.emptyEvidenceHint));
            return root;
        }

        const trackX = CONTENT.x + GUTTER;
        const trackWidth = CONTENT.width - GUTTER;
        const available = CONTENT.height - AXIS_HEADROOM - COVERAGE_HEIGHT;
        const rowHeight = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, available / sources.length));
        const top = CONTENT.y + AXIS_HEADROOM + Math.max(0, (available - rowHeight * sources.length) / 2);
        const bottom = top + rowHeight * sources.length;
        const scale = timeScale(allSteps.map(step => step.at), trackX + TRACK_INSET, trackX + trackWidth - TRACK_INSET);

        // Row banding is laid down before the axis, otherwise the shaded rows paint over its grid
        sources.forEach((_, index) => {
            if (index % 2 === 1) {
                content.appendChild(rect(CONTENT.x, top + index * rowHeight, CONTENT.width, rowHeight, { fill: palette.surfaceAlt }));
            }
        });

        content.appendChild(timeAxis(palette, scale, { x: trackX, width: trackWidth, top, bottom: bottom + COVERAGE_HEIGHT }, context.time));

        sources.forEach((source, index) => {
            const rowTop = top + index * rowHeight;
            const center = rowTop + rowHeight / 2;
            const missing = source.name === null;
            const color = missing ? palette.inkMuted : palette.accent;

            content.appendChild(line(CONTENT.x, rowTop, CONTENT.right, rowTop, { stroke: palette.border, "stroke-width": 1 }));
            content.appendChild(icons.draw(missing ? Icon.Unknown : Icon.Evidence, CONTENT.x + 16, center, 16, color));

            const label = fitText(source.label, GUTTER - 90, { size: 12.5, minSize: 8 });
            content.appendChild(text(label.text, CONTENT.x + 34, center - 5, { "font-size": label.size, "font-weight": 600, fill: missing ? palette.inkMuted : palette.ink }));
            content.appendChild(text(`${source.steps.length} observation(s)`, CONTENT.x + 34, center + 10, { "font-size": 10, fill: palette.inkMuted }));
            content.appendChild(line(trackX, center, CONTENT.right, center, { stroke: palette.border, "stroke-width": 1, "stroke-dasharray": "1 6" }));

            source.steps.forEach(step => {
                const x = scale.at(step.at);
                const stepColor = palette.sides[step.side].color;
                content.appendChild(group({ class: "tlg-step", "data-step-id": step.id }, [
                    circle(x, center, 11, { fill: palette.tint(stepColor, 0.84), stroke: stepColor, "stroke-width": 1.4 }),
                    icons.draw(store.stepIcon(step), x, center, 12, stepColor)
                ]));
            });
        });

        content.appendChild(line(CONTENT.x, bottom, CONTENT.right, bottom, { stroke: palette.border, "stroke-width": 1 }));
        content.appendChild(coverage(palette, scale, allSteps, trackX, bottom + 8, trackWidth));
        return root;
    }
});
