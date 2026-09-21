// The written account, generated from the same records, with the full list underneath. This is the
// appendix slide, and the one that still reads correctly with no colour at all.

import { AttackTactic, Representation, ResponsePhase, SideRole, StepOutcome } from "../../core/enums.js";
import { Icon } from "../../core/icon.js";
import { outcomeColor, stoppedOutcome } from "../cards.js";
import { CONTENT, frame } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { circle, group, line, rect, text, truncate, wrap } from "../svg.js";
import { TableColumn, cellText, columnWeight, headingOf, stageLabel, tableColumnsOption, tableSource } from "../timeline-table.js";
import { defineRenderer, optionList, optionValue, type RenderContext, type RendererOption } from "./registry.js";
import type { Strings } from "../strings.js";

const SUMMARY_PAD = 18;
const SUMMARY_HEADER = 30;
const SUMMARY_LINE = 16;
const SUMMARY_SIZE = 12.5;
const SUMMARY_MAX_LINES = 6;
const SUMMARY_LINES_PER_SENTENCE = 3;
const SUMMARY_GAP = 18;
const SUMMARY_ROOM = SUMMARY_PAD * 2 + SUMMARY_HEADER + SUMMARY_LINE * SUMMARY_MAX_LINES + SUMMARY_GAP;
const TABLE_FOOT = 8;
const COMPROMISED_NAMED = 4;
const SIDE_MARK_WIDTH = 3;
const OUTCOME_DOT = 4;
const OUTCOME_GAP = 2;
const EMPTY_CELL = "-";

enum RowDensity {
    Comfortable = "comfortable",
    Compact = "compact"
}

enum SummaryDisplay {
    Shown = "shown",
    Hidden = "hidden"
}

interface RowLayout {
    height: number;
    header: number;
    pad: number;
    headingSize: number;
    textSize: number;
    mutedSize: number;
    sideMark: number;
}

const ROW_LAYOUTS: Readonly<Record<RowDensity, RowLayout>> = {
    [RowDensity.Comfortable]: { height: 34, header: 26, pad: 14, headingSize: 9.5, textSize: 11.5, mutedSize: 10.5, sideMark: 14 },
    [RowDensity.Compact]: { height: 21, header: 20, pad: 7, headingSize: 8.5, textSize: 10, mutedSize: 9.5, sideMark: 11 }
};

function rowsOption(strings: Strings): RendererOption<RowDensity> {
    return {
        id: "rows",
        label: strings.options.rows,
        description: strings.options.rowsDescription,
        fallback: RowDensity.Comfortable,
        choices: [
            { value: RowDensity.Comfortable, label: strings.options.densityComfortable },
            { value: RowDensity.Compact, label: strings.options.densityCompact }
        ]
    };
}

function summaryOption(strings: Strings): RendererOption<SummaryDisplay> {
    return {
        id: "summary",
        label: strings.options.summary,
        description: strings.options.summaryDescription,
        fallback: SummaryDisplay.Shown,
        choices: [
            { value: SummaryDisplay.Shown, label: strings.options.summaryShown },
            { value: SummaryDisplay.Hidden, label: strings.options.summaryHidden }
        ]
    };
}

interface PlacedColumn {
    key: TableColumn;
    heading: string;
    x: number;
    size: number;
}

// Columns written in the ink of the story; the rest are the quieter annotations around it
const PLAIN_COLUMNS: ReadonlySet<TableColumn> = new Set([TableColumn.Who, TableColumn.What, TableColumn.Details, TableColumn.Involved]);

interface NarrativePage {
    summary: string[] | null;
    rows: TimelineStep[];
    /** Where the first row of the page sits in the whole timeline. */
    offset: number;
}

function rowsThatFit(room: number, layout: RowLayout): number {
    return Math.max(1, Math.floor((room - layout.header - TABLE_FOOT) / layout.height));
}

/**
 * The first slide gives the summary its room and every later one hands the whole slide to the table.
 */
function paginateRows(steps: readonly TimelineStep[], layout: RowLayout, withSummary: boolean): TimelineStep[][] {
    const first = rowsThatFit(CONTENT.height - (withSummary ? SUMMARY_ROOM : 0), layout);
    const rest = rowsThatFit(CONTENT.height, layout);
    const pages: TimelineStep[][] = [steps.slice(0, first)];
    for (let index = first; index < steps.length; index += rest) {
        pages.push(steps.slice(index, index + rest));
    }
    return pages;
}

function lower(value: string): string {
    const trimmed = value.trim();
    return trimmed ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1) : trimmed;
}

function nodeSuffix(context: RenderContext, step: TimelineStep): string {
    const words = context.strings.narrative;
    const source = context.store.node(step.sourceNodeId);
    const target = context.store.node(step.targetNodeId);
    if (source && target) return words.byAgainst(source.name, target.name);
    if (source) return words.by(source.name);
    if (target) return words.against(target.name);
    return "";
}

/**
 * Plain sentences describing the incident, built from the records rather than written by hand.
 */
function summarise(context: RenderContext): string[] {
    const { store } = context;
    const words = context.strings.narrative;
    const steps = store.visibleSteps();
    const first = steps[0];
    if (!first) {
        return [words.nothingRecorded];
    }

    const attacker = steps.filter(step => store.sideRole(step.side) === SideRole.Attacker);
    const defender = steps.filter(step => store.sideRole(step.side) === SideRole.Defender);
    const compromised = store.nodes.filter(node => node.compromised);
    const sentences: string[] = [];

    sentences.push(words.firstAction(lower(first.title), context.time.formatMoment(first), nodeSuffix(context, first)));

    if (attacker.length > 0) {
        const tactics = [...new Set(attacker.map(step => step.attackTactic).filter(tactic => tactic !== AttackTactic.None))]
            .map(tactic => store.tacticInfo(tactic).label);
        sentences.push(words.attackerActions(attacker.length, tactics));
    }

    const dwell = context.time.formatDuration(store.metrics.dwellHours);
    if (dwell) {
        sentences.push(words.dwell(dwell));
    }

    if (defender.length > 0) {
        const phases = [...new Set(defender.map(step => step.responsePhase).filter(phase => phase !== ResponsePhase.None))]
            .map(phase => store.responseInfo(phase).label);
        sentences.push(words.responseActions(defender.length, phases));
    }

    if (compromised.length > 0) {
        const named = compromised.slice(0, COMPROMISED_NAMED).map(node => node.name);
        sentences.push(words.compromisedRecords(compromised.length, named, compromised.length > COMPROMISED_NAMED));
    }

    const stopped = steps.filter(step => stoppedOutcome(store.outcomeMeaning(step.outcome)));
    if (stopped.length > 0) {
        sentences.push(words.stoppedAttempts(stopped.length));
    }
    return sentences;
}

/**
 * The written account, in a card exactly as tall as the sentences it holds.
 */
function summaryPanel(context: RenderContext, sentences: readonly string[], x: number, y: number): { node: SVGGElement; height: number } {
    const { palette, icons } = context;
    const node = group();
    const inner = CONTENT.width - SUMMARY_PAD * 2;

    const lines: string[] = [];
    sentences.forEach(sentence => {
        wrap(sentence, SUMMARY_SIZE, inner, SUMMARY_LINES_PER_SENTENCE).forEach(lineText => {
            if (lines.length < SUMMARY_MAX_LINES) lines.push(lineText);
        });
    });

    const height = SUMMARY_PAD * 2 + SUMMARY_HEADER + lines.length * SUMMARY_LINE;
    node.appendChild(rect(x, y, CONTENT.width, height, { rx: 12, fill: palette.tint(palette.accent, 0.96), stroke: palette.tint(palette.accent, 0.82), "stroke-width": 1 }));
    node.appendChild(icons.draw(Icon.Text, x + SUMMARY_PAD + 6, y + SUMMARY_PAD + 5, 15, palette.accent));
    node.appendChild(text("WHAT HAPPENED", x + SUMMARY_PAD + 24, y + SUMMARY_PAD + 5, {
        "font-size": 10.5, "font-weight": 700, "letter-spacing": 0.9, fill: palette.accent, "dominant-baseline": "central"
    }));

    lines.forEach((lineText, index) => {
        node.appendChild(text(lineText, x + SUMMARY_PAD, y + SUMMARY_PAD + SUMMARY_HEADER + index * SUMMARY_LINE + 4, {
            "font-size": SUMMARY_SIZE, fill: palette.ink, "dominant-baseline": "central"
        }));
    });
    return { node, height };
}

function placeColumns(context: RenderContext, x: number, width: number): PlacedColumn[] {
    const entries = optionList(context, tableColumnsOption(context.strings));
    const total = entries.reduce((sum, entry) => sum + columnWeight(entry.value), 0);
    let cursor = x;
    return entries.map(entry => {
        const placed = { key: entry.value, heading: headingOf(context.strings, entry), x: cursor, size: width * columnWeight(entry.value) / total };
        cursor += placed.size;
        return placed;
    });
}

function table(context: RenderContext, page: NarrativePage, x: number, y: number, width: number): SVGGElement {
    const { store, palette } = context;
    const layout = ROW_LAYOUTS[optionValue(context, rowsOption(context.strings))];
    const columns = placeColumns(context, x, width);
    const source = tableSource(store, context.time, context.strings);
    const node = group();

    node.appendChild(rect(x, y, width, layout.header, { rx: 6, fill: palette.surfaceAlt }));
    columns.forEach(column => {
        node.appendChild(text(truncate(column.heading.toUpperCase(), layout.headingSize, column.size - layout.pad * 2), column.x + layout.pad, y + layout.header / 2, {
            "font-size": layout.headingSize, "font-weight": 700, "letter-spacing": 0.7, fill: palette.inkMuted, "dominant-baseline": "central"
        }));
    });

    page.rows.forEach((step, index) => {
        const rowY = y + layout.header + index * layout.height;
        const centerY = rowY + layout.height / 2;
        const row = group({ class: "tlg-step tlg-row", "data-step-id": step.id });

        // Only painted pixels catch the pointer, so without this the gaps between words would not be clickable
        row.appendChild(rect(x, rowY, width, layout.height, { class: "tlg-hit", fill: "none", "pointer-events": "all" }));
        if (index % 2 === 1) {
            row.appendChild(rect(x, rowY, width, layout.height, { fill: palette.surfaceAlt, opacity: 0.6 }));
        }
        // A row is a line of a table, so it is marked by tinting the whole line rather than by a halo,
        // which on flat text only makes the words glow
        row.appendChild(rect(x, rowY, width, layout.height, { class: "tlg-row-band", fill: palette.accent, opacity: 0 }));
        row.appendChild(line(x, rowY + layout.height, x + width, rowY + layout.height, { stroke: palette.border, "stroke-width": 0.75 }));
        row.appendChild(rect(x, centerY - layout.sideMark / 2, SIDE_MARK_WIDTH, layout.sideMark, { rx: SIDE_MARK_WIDTH / 2, fill: palette.side(step.side).color }));

        columns.forEach(column => {
            if (column.key === TableColumn.Stage) {
                // Where the step sits in the attack or the response says more than a tick or a cross, and
                // the outcome still reads off the dot in front of it
                const dotX = column.x + layout.pad + OUTCOME_DOT;
                if (step.outcome !== StepOutcome.Unknown) {
                    row.appendChild(circle(dotX, centerY, OUTCOME_DOT, { fill: outcomeColor(context, step) }));
                }
                const labelX = dotX + OUTCOME_DOT + OUTCOME_GAP * 2;
                row.appendChild(text(truncate(stageLabel(store, step), layout.mutedSize, column.x + column.size - layout.pad - labelX), labelX, centerY, {
                    "font-size": layout.mutedSize, "font-weight": 600, fill: palette.inkMuted, "dominant-baseline": "central"
                }));
                return;
            }
            const strong = column.key === TableColumn.What;
            const plain = PLAIN_COLUMNS.has(column.key);
            const size = plain ? layout.textSize : layout.mutedSize;
            row.appendChild(text(truncate(cellText(source, step, column.key, page.offset + index) || EMPTY_CELL, size, column.size - layout.pad * 2), column.x + layout.pad, centerY, {
                "font-size": size, "font-weight": strong ? 600 : 400, fill: plain ? palette.ink : palette.inkMuted, "dominant-baseline": "central"
            }));
        });
        node.appendChild(row);
    });
    return node;
}

export const narrative = defineRenderer<NarrativePage>({
    representation: Representation.Narrative,
    filters: strings => strings.filters.narrative,
    options: strings => [rowsOption(strings), summaryOption(strings), tableColumnsOption(strings)],

    pages(context) {
        const layout = ROW_LAYOUTS[optionValue(context, rowsOption(context.strings))];
        const withSummary = optionValue(context, summaryOption(context.strings)) === SummaryDisplay.Shown;
        let offset = 0;
        return paginateRows(context.store.visibleSteps(), layout, withSummary).map((rows, index) => {
            const page = { summary: withSummary && index === 0 ? summarise(context) : null, rows, offset };
            offset += rows.length;
            return page;
        });
    },

    draw(context, page, pageIndex, pageCount) {
        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: `${context.store.visibleSteps().length} step(s) recorded`,
            legend: []
        });

        let top = CONTENT.y;
        if (page.summary) {
            const panel = summaryPanel(context, page.summary, CONTENT.x, top);
            content.appendChild(panel.node);
            top += panel.height + SUMMARY_GAP;
        }
        content.appendChild(table(context, page, CONTENT.x, top, CONTENT.width));
        return root;
    }
});
