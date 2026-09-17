// One lane per party, time running left to right, so everybody's actions line up against each other.
//
// Chips sit at the moment they happened and never slide sideways to make room. When two would collide
// the later one drops onto a row underneath and the lane grows to hold the rows it needs. Only when the
// page itself runs out of height do the labels start shortening.

import { Representation, Side, StepOutcome } from "../../core/enums.js";
import { Icon } from "../../core/icon.js";
import type { DiagramNode, RecordId } from "../../core/models.js";
import { formatDate } from "../../core/time.js";
import { timeAxis } from "../axis.js";
import { fitText, iconTile, outcomeColor } from "../cards.js";
import { CONTENT, LegendStroke, frame, placeholder, sideLegend } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { clamp, packIntoRows, paginateGroups, timeScale, type Span, type TimeScale, type Weighted } from "../geometry.js";
import { arrowMarkers, circle, group, line, markerId, measure, path, rect, text, truncate } from "../svg.js";
import type { Palette } from "../theme.js";
import { defineRenderer, type RenderContext } from "./registry.js";

const GUTTER = 208;
const AXIS_HEADROOM = 40;
const CHIP_HEIGHT = 30;
const CHIP_MIN_WIDTH = 40;
const CHIP_GAP = 8;
const CHIP_PADDING = 44;
const ROW_UNIT = CHIP_HEIGHT + 6;
const LANE_PADDING = 14;
const TRACK_INSET = 70;

// How far the lanes may be squeezed before the page has to be split instead. Below these the chips would
// touch, which reads worse than a second slide.
const ROW_UNIT_MIN = CHIP_HEIGHT + 2;
const LANE_PADDING_MIN = 4;
const MAX_SUB_ROWS = 5;
const CHIP_LABEL_SIZE = 10.5;
const CHIP_LABEL_MIN = 8;
const LABEL_STEP = 0.5;
const LABEL_BUDGETS: readonly number[] = [128, 92, 60, 0];
const HANDOFF_ARROW = "tlg-handoff";
const TINT = 0.86;

interface Lane extends Weighted {
    node: DiagramNode | null;
    label: string;
    subtitle: string;
    side: Side;
    steps: TimelineStep[];
}

interface Chip extends Span {
    step: TimelineStep;
    label: string;
    labelSize: number;
    width: number;
    anchor: number;
    left: number;
    y: number;
}

interface PackedLane {
    lane: Lane;
    items: Chip[];
    rows: number;
    height: number;
    top: number;
    center: number;
}

interface LaneMetrics {
    rowUnit: number;
    padding: number;
    bonus: number;
}

/**
 * A page holds a number of chip rows, not a number of lanes: one busy party can take as much room as
 * four quiet ones, and counting lanes is what let a page overflow.
 */
function rowCapacity(): number {
    return Math.max(1, Math.floor((CONTENT.height - AXIS_HEADROOM) / (ROW_UNIT_MIN + LANE_PADDING_MIN)));
}

/**
 * The lane heights this page can afford. Everything is drawn at the comfortable size while it fits,
 * and tightened towards the floor when it does not.
 */
function laneMetrics(packed: readonly PackedLane[], available: number): LaneMetrics {
    const rows = packed.reduce((sum, entry) => sum + entry.rows, 0);
    const roomy = rows * ROW_UNIT + packed.length * LANE_PADDING;
    if (roomy <= available) return { rowUnit: ROW_UNIT, padding: LANE_PADDING, bonus: (available - roomy) / packed.length };

    const padding = Math.max(LANE_PADDING_MIN, (available - rows * ROW_UNIT_MIN) / packed.length);
    const rowUnit = Math.max(ROW_UNIT_MIN, (available - packed.length * padding) / rows);
    return { rowUnit, padding, bonus: 0 };
}

/**
 * Groups the steps by the party that performed them, keeping the busiest lanes first so the important
 * ones land on the first slide.
 */
function buildLanes(context: RenderContext, steps: readonly TimelineStep[]): Lane[] {
    const { store, strings } = context;
    const lanes = new Map<RecordId | null, Lane>();

    steps.forEach(step => {
        const key = step.sourceNodeId;
        let lane = lanes.get(key);
        const words = strings.scene;
        if (!lane) {
            const node = store.node(key);
            lane = {
                node,
                label: node ? node.name : words.unattributed,
                subtitle: node ? node.role ?? store.kindInfo(node.kind).label : words.noPartyRecorded,
                side: node ? node.side : Side.Unknown,
                steps: [],
                weight: 1
            };
            lanes.set(key, lane);
        }
        lane.steps.push(step);
    });

    return [...lanes.values()].sort((a, b) => b.steps.length - a.steps.length);
}

/**
 * A chip says the whole title if it can. Where the lane is too tight for it at full size the type comes
 * down half a point at a time first, and only a title that will not fit even at the smallest size gets
 * shortened.
 */
function chipLabel(step: TimelineStep, budget: number): { text: string; size: number } {
    if (budget === 0) return { text: "", size: CHIP_LABEL_SIZE };
    for (let size = CHIP_LABEL_SIZE; size >= CHIP_LABEL_MIN; size -= LABEL_STEP) {
        if (measure(step.title, size) <= budget) return { text: step.title, size };
    }
    return { text: truncate(step.title, CHIP_LABEL_MIN, budget), size: CHIP_LABEL_MIN };
}

function packLane(lane: Lane, scale: TimeScale, trackX: number, budget: number): { items: Chip[]; rows: number } {
    const items: Chip[] = lane.steps.map(step => {
        const { text: label, size: labelSize } = chipLabel(step, budget);
        const width = Math.max(CHIP_MIN_WIDTH, measure(label, labelSize) + (label ? CHIP_PADDING : 0));
        const anchor = scale.at(step.at);
        const left = clamp(anchor - width / 2, trackX + 6, CONTENT.right - width - 6);
        return { step, label, labelSize, width, anchor, left, start: left, end: left + width, row: 0, y: 0 };
    });
    return { items, rows: packIntoRows(items, CHIP_GAP, MAX_SUB_ROWS).rows };
}

/**
 * Picks the longest labels that still let every lane hold all of its rows on this page.
 */
function packAll(lanes: readonly Lane[], scale: TimeScale, trackX: number, available: number): PackedLane[] {
    let attempt: PackedLane[] = [];
    for (const budget of LABEL_BUDGETS) {
        attempt = lanes.map(lane => ({ lane, ...packLane(lane, scale, trackX, budget), height: 0, top: 0, center: 0 }));
        const needed = attempt.reduce((sum, entry) => sum + entry.rows * ROW_UNIT + LANE_PADDING, 0);
        if (needed <= available) break;
    }
    return attempt;
}

function trackScale(steps: readonly TimelineStep[], trackX: number, trackWidth: number): TimeScale {
    return timeScale(steps.map(step => step.at), trackX + TRACK_INSET, trackX + trackWidth - TRACK_INSET);
}

function laneHeader(context: RenderContext, lane: Lane, x: number, center: number): SVGGElement {
    const { palette, icons } = context;
    const node = group();
    const color = palette.sides[lane.side].color;

    if (lane.node) {
        node.appendChild(iconTile(context, lane.node, x, center - 13, 26));
    } else {
        node.appendChild(rect(x, center - 13, 26, 26, { rx: 4, fill: palette.tint(color, TINT) }));
        node.appendChild(icons.draw(Icon.Unknown, x + 13, center, 16, color));
    }

    const name = fitText(lane.label, GUTTER - 60, { size: 13, minSize: 8 });
    node.appendChild(text(name.text, x + 34, center - 5, { "font-size": name.size, "font-weight": 600, fill: palette.ink }));
    const role = fitText(lane.subtitle, GUTTER - 60, { size: 10.5, minSize: 7 });
    node.appendChild(text(role.text, x + 34, center + 10, { "font-size": role.size, fill: palette.inkMuted }));
    return node;
}

function stepChip(context: RenderContext, chip: Chip, scale: TimeScale): SVGGElement {
    const { palette, icons, store } = context;
    const { step, label, labelSize, width, left, anchor, y } = chip;
    const color = palette.sides[step.side].color;
    const node = group({ class: "tlg-step", "data-step-id": step.id });

    const runsTo = step.until && !scale.collapsed ? Math.min(scale.at(step.until), CONTENT.right - 6) : null;
    const duration = runsTo === null ? 0 : Math.max(0, runsTo - anchor);
    if (duration > 6) {
        node.appendChild(rect(anchor, y - 5, duration, 10, { rx: 5, fill: color, opacity: 0.22 }));
    }

    node.appendChild(rect(left, y - CHIP_HEIGHT / 2, width, CHIP_HEIGHT, {
        rx: CHIP_HEIGHT / 2, fill: palette.surface, stroke: color, "stroke-width": step.isMilestone ? 2 : 1
    }));

    const iconX = label ? left + 15 : left + width / 2;
    node.appendChild(circle(iconX, y, 11, { fill: step.isMilestone ? color : palette.tint(color, TINT) }));
    node.appendChild(icons.draw(store.stepIcon(step), iconX, y, 12, step.isMilestone ? palette.onColor : color));

    if (label) {
        node.appendChild(text(label, left + 31, y, { "font-size": labelSize, "font-weight": 500, fill: palette.ink, "dominant-baseline": "central" }));
    }

    if (step.outcome === StepOutcome.Blocked || step.outcome === StepOutcome.Failed) {
        node.appendChild(circle(left + width - 9, y - 10, 6.5, { fill: outcomeColor(palette, step) }));
        node.appendChild(icons.draw(store.outcomeInfo(step.outcome).icon, left + width - 9, y - 10, 8, palette.onColor));
    }
    return node;
}

/**
 * What one step led to. A step touches machines, accounts and files, and the next thing that happens to
 * one of them is the continuation of it. Drawing that pair follows the incident from the party that
 * acted to the party that had to deal with it, which is the thread a reader is looking for.
 */
function touchedBy(step: TimelineStep): Set<RecordId> {
    const ids = new Set<RecordId>();
    if (step.targetNodeId !== null) ids.add(step.targetNodeId);
    step.involvements.forEach(involvement => ids.add(involvement.nodeId));
    return ids;
}

function touches(step: TimelineStep, ids: ReadonlySet<RecordId>): boolean {
    if (step.sourceNodeId !== null && ids.has(step.sourceNodeId)) return true;
    if (step.targetNodeId !== null && ids.has(step.targetNodeId)) return true;
    return step.involvements.some(involvement => ids.has(involvement.nodeId));
}

function handoffs(palette: Palette, steps: readonly TimelineStep[], chips: ReadonlyMap<RecordId, Chip>): SVGGElement {
    const node = group();
    const pairs = new Map<RecordId, { step: TimelineStep; consequence: TimelineStep }>();

    steps.forEach((step, index) => {
        const touched = touchedBy(step);
        const from = chips.get(step.id);
        if (touched.size === 0 || !from) return;

        // Only a handover between two different parties is worth an arrow, and only when one end of it
        // is a turning point of the incident. Everything else is already told by the lanes and the
        // dates, and drawing it as well buries the few arrows that carry the plot.
        const consequence = steps.slice(index + 1).find(other => {
            const to = chips.get(other.id);
            return to !== undefined
                && Math.abs(to.y - from.y) > 2
                && other.side !== step.side
                && (step.isMilestone || other.isMilestone)
                && touches(other, touched);
        });
        if (!consequence) return;

        // Several earlier steps often land on the same next one. Only the last of them is drawn, because
        // that is the one that actually triggered it, and a fan of five says nothing.
        pairs.set(consequence.id, { step, consequence });
    });

    node.appendChild(arrowMarkers(HANDOFF_ARROW, [...pairs.values()].map(pair => palette.sides[pair.step.side].color)));

    const trackLeft = CONTENT.x + GUTTER + 8;
    pairs.forEach(({ step, consequence }) => {
        const from = chips.get(step.id);
        const to = chips.get(consequence.id);
        if (!from || !to) return;

        const downwards = to.y > from.y;
        const startX = clamp(from.left + from.width / 2, trackLeft, CONTENT.right - 8);
        const endX = clamp(to.left + to.width / 2, trackLeft, CONTENT.right - 8);
        const startY = from.y + (downwards ? CHIP_HEIGHT / 2 : -CHIP_HEIGHT / 2);
        const endY = to.y + (downwards ? -CHIP_HEIGHT / 2 - 3 : CHIP_HEIGHT / 2 + 3);
        const midY = (startY + endY) / 2;
        const color = palette.sides[step.side].color;

        node.appendChild(path(`M${startX},${startY} C${startX},${midY} ${endX},${midY} ${endX},${endY}`, {
            fill: "none", stroke: color, "stroke-width": 1.4, "stroke-dasharray": "4 3", opacity: 0.75,
            "marker-end": `url(#${markerId(HANDOFF_ARROW, color)})`
        }));
        node.appendChild(circle(startX, startY, 2, { fill: color, opacity: 0.75 }));
    });
    return node;
}

export const actorSwimlanes = defineRenderer<Lane[]>({
    representation: Representation.ActorSwimlanes,

    pages(context) {
        const steps = context.store.visibleSteps();
        const lanes = buildLanes(context, steps);
        if (lanes.length === 0) return [[]];

        const trackX = CONTENT.x + GUTTER;
        const scale = trackScale(steps, trackX, CONTENT.width - GUTTER);
        const firstBudget = LABEL_BUDGETS[0] ?? 0;
        lanes.forEach(lane => {
            lane.weight = packLane(lane, scale, trackX, firstBudget).rows;
        });
        return paginateGroups(lanes, rowCapacity());
    },

    draw(context, lanes, pageIndex, pageCount) {
        const { store, palette } = context;
        // Lanes hold their own steps in order, but the page range has to read across all of them
        const steps = lanes.flatMap(lane => lane.steps).sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
        const first = steps[0];
        const last = steps.at(-1);

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: first && last ? `${formatDate(first.at)} to ${formatDate(last.at)}` : null,
            legend: [...sideLegend(context, steps), { label: context.strings.scene.ledTo, color: palette.borderStrong, stroke: LegendStroke.Dashed }]
        });

        if (lanes.length === 0) {
            content.appendChild(placeholder(context, context.strings.scene.emptySwimlanesTitle, context.strings.scene.emptySwimlanesHint));
            return root;
        }

        const trackX = CONTENT.x + GUTTER;
        const trackWidth = CONTENT.width - GUTTER;
        const available = CONTENT.height - AXIS_HEADROOM;
        const scale = trackScale(store.visibleSteps(), trackX, trackWidth);
        const packed = packAll(lanes, scale, trackX, available);
        const metrics = laneMetrics(packed, available);
        const top = CONTENT.y + AXIS_HEADROOM;

        let cursor = top;
        packed.forEach(entry => {
            entry.height = entry.rows * metrics.rowUnit + metrics.padding + metrics.bonus;
            entry.top = cursor;
            entry.center = cursor + entry.height / 2;
            cursor += entry.height;
        });
        const bottom = cursor;

        content.appendChild(timeAxis(palette, scale, { x: trackX, width: trackWidth, top, bottom }, context.time));

        packed.forEach((entry, index) => {
            if (index % 2 === 1) {
                content.appendChild(rect(CONTENT.x, entry.top, CONTENT.width, entry.height, { fill: palette.surfaceAlt }));
            }
            content.appendChild(line(CONTENT.x, entry.top, CONTENT.right, entry.top, { stroke: palette.border, "stroke-width": 1 }));
            content.appendChild(laneHeader(context, entry.lane, CONTENT.x, entry.center));
            content.appendChild(line(trackX, entry.center, CONTENT.right, entry.center, { stroke: palette.border, "stroke-width": 1, "stroke-dasharray": "1 6" }));
        });

        content.appendChild(line(CONTENT.x, bottom, CONTENT.right, bottom, { stroke: palette.border, "stroke-width": 1 }));
        content.appendChild(line(trackX, top, trackX, bottom, { stroke: palette.border, "stroke-width": 1 }));

        // Where each chip actually landed, so a handoff can leave the chip it belongs to rather than the
        // middle of its lane, which is rarely where the chip ended up
        const chips = new Map<RecordId, Chip>();
        packed.forEach(entry => {
            const offset = (entry.rows - 1) / 2;
            entry.items.forEach(item => {
                item.y = entry.center + (item.row - offset) * metrics.rowUnit;
                chips.set(item.step.id, item);
            });
        });

        content.appendChild(handoffs(palette, steps, chips));
        packed.forEach(entry => entry.items.forEach(item => content.appendChild(stepChip(context, item, scale))));
        return root;
    }
});
