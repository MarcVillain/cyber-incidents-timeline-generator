// The written account, generated from the same records, with the full list underneath. This is the
// appendix slide, and the one that still reads correctly with no colour at all.

import { AttackTactic, Representation, ResponsePhase, Side, StepOutcome } from "../../core/enums.js";
import { Icon } from "../../core/icon.js";
import { outcomeColor } from "../cards.js";
import { CONTENT, frame } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { circle, group, line, rect, stripTags, text, truncate, wrap } from "../svg.js";
import { defineRenderer, type RenderContext } from "./registry.js";
import type { Strings } from "../strings.js";

const SUMMARY_PAD = 18;
const SUMMARY_HEADER = 30;
const SUMMARY_LINE = 16;
const SUMMARY_SIZE = 12.5;
const SUMMARY_MAX_LINES = 6;
const SUMMARY_LINES_PER_SENTENCE = 3;
const ROW_HEIGHT = 34;
const TABLE_HEADER = 26;
const TABLE_GAP = 52;
const COMPROMISED_NAMED = 4;

enum ColumnKey {
    When = "when",
    Who = "who",
    What = "what",
    Where = "where",
    Stage = "stage"
}

interface ColumnDefinition {
    key: ColumnKey;
    label: string;
    share: number;
}

interface PlacedColumn extends ColumnDefinition {
    x: number;
    size: number;
}

function tableColumns(strings: Strings): readonly ColumnDefinition[] {
    return [
        { key: ColumnKey.When, label: strings.scene.when, share: 0.16 },
        { key: ColumnKey.Who, label: strings.scene.who, share: 0.16 },
        { key: ColumnKey.What, label: strings.scene.whatHappened, share: 0.40 },
        { key: ColumnKey.Where, label: strings.scene.onWhat, share: 0.16 },
        { key: ColumnKey.Stage, label: strings.scene.stage, share: 0.12 }
    ];
}

interface NarrativePage {
    summary: string[] | null;
    rows: TimelineStep[];
}

function rowsPerPage(): number {
    return Math.max(1, Math.floor((CONTENT.height - SUMMARY_PAD * 2 - SUMMARY_HEADER - SUMMARY_LINE * SUMMARY_MAX_LINES - TABLE_GAP) / ROW_HEIGHT));
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

    const attacker = steps.filter(step => step.side === Side.Attacker);
    const defender = steps.filter(step => step.side === Side.Defender);
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

    const stopped = steps.filter(step => step.outcome === StepOutcome.Blocked || step.outcome === StepOutcome.Failed);
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

function table(context: RenderContext, rows: readonly TimelineStep[], x: number, y: number, width: number): SVGGElement {
    const { store, palette } = context;
    const node = group();
    let cursor = x;
    const columns: PlacedColumn[] = tableColumns(context.strings).map(column => {
        const placed = { ...column, x: cursor, size: width * column.share };
        cursor += placed.size;
        return placed;
    });

    node.appendChild(rect(x, y, width, TABLE_HEADER, { rx: 6, fill: palette.surfaceAlt }));
    columns.forEach(column => {
        node.appendChild(text(column.label.toUpperCase(), column.x + 14, y + TABLE_HEADER / 2, {
            "font-size": 9.5, "font-weight": 700, "letter-spacing": 0.7, fill: palette.inkMuted, "dominant-baseline": "central"
        }));
    });

    rows.forEach((step, index) => {
        const rowY = y + TABLE_HEADER + index * ROW_HEIGHT;
        const centerY = rowY + ROW_HEIGHT / 2;
        const row = group({ class: "tlg-step tlg-row", "data-step-id": step.id });

        // Only painted pixels catch the pointer, so without this the gaps between words would not be clickable
        row.appendChild(rect(x, rowY, width, ROW_HEIGHT, { class: "tlg-hit", fill: "none", "pointer-events": "all" }));
        if (index % 2 === 1) {
            row.appendChild(rect(x, rowY, width, ROW_HEIGHT, { fill: palette.surfaceAlt, opacity: 0.6 }));
        }
        // A row is a line of a table, so it is marked by tinting the whole line rather than by a halo,
        // which on flat text only makes the words glow
        row.appendChild(rect(x, rowY, width, ROW_HEIGHT, { class: "tlg-row-band", fill: palette.accent, opacity: 0 }));
        row.appendChild(line(x, rowY + ROW_HEIGHT, x + width, rowY + ROW_HEIGHT, { stroke: palette.border, "stroke-width": 0.75 }));

        const cell = (key: ColumnKey, content: string, size: number, fill: string, weight = 400): void => {
            const column = columns.find(candidate => candidate.key === key);
            if (!column) return;
            row.appendChild(text(truncate(content, size, column.size - 26), column.x + 14, centerY, {
                "font-size": size, "font-weight": weight, fill, "dominant-baseline": "central"
            }));
        };

        const when = columns[0];
        if (when) {
            row.appendChild(rect(when.x, centerY - 7, 3, 14, { rx: 1.5, fill: palette.sides[step.side].color }));
        }
        cell(ColumnKey.When, context.time.formatMoment(step), 10.5, palette.inkMuted);
        cell(ColumnKey.Who, store.node(step.sourceNodeId)?.name ?? "-", 11, palette.ink);
        cell(ColumnKey.What, stripTags(step.title), 11.5, palette.ink, 600);
        cell(ColumnKey.Where, store.node(step.targetNodeId)?.name ?? "-", 11, palette.inkMuted);

        // Where the step sits in the attack or the response says more than a tick or a cross, and the
        // outcome still reads off the dot in front of it
        const stage = columns.find(column => column.key === ColumnKey.Stage);
        if (stage) {
            const label = step.side === Side.Defender ? store.responseInfo(step.responsePhase).label : store.tacticInfo(step.attackTactic).label;
            if (step.outcome !== StepOutcome.Unknown) {
                row.appendChild(circle(stage.x + 18, centerY, 4, { fill: outcomeColor(palette, step) }));
            }
            row.appendChild(text(truncate(label, 10.5, stage.size - 42), stage.x + 28, centerY, {
                "font-size": 10.5, "font-weight": 600, fill: palette.inkMuted, "dominant-baseline": "central"
            }));
        }
        node.appendChild(row);
    });
    return node;
}

export const narrative = defineRenderer<NarrativePage>({
    representation: Representation.Narrative,

    pages(context) {
        const steps = context.store.visibleSteps();
        const perPage = rowsPerPage();
        const pageCount = Math.max(1, Math.ceil(steps.length / perPage));
        return Array.from({ length: pageCount }, (_, index) => ({
            summary: index === 0 ? summarise(context) : null,
            rows: steps.slice(index * perPage, (index + 1) * perPage)
        }));
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
            top += panel.height + 18;
        }
        content.appendChild(table(context, page.rows, CONTENT.x, top, CONTENT.width));
        return root;
    }
});
