// How well the incident was handled.
//
// A duration on its own says nothing about whether it was good, so the slide is built around what the
// figures are measured against, and the setting picks which comparison to make:
//
//   Where the time went   the elapsed time split into its phases, so the reader sees which part ate it
//   Against target        each figure against a response objective
//   Against our history   each figure against the middle of what this scope's incidents usually take
//   What let it run       the moments that cost time, and what each of them cost
//
// Each gets the representation that suits it. A breakdown wants a proportional bar, a comparison wants
// paired bars on a shared scale, and a list of failures is better off staying a list.

import { Representation, Side, StepOutcome } from "../../core/enums.js";
import { Icon } from "../../core/icon.js";
import type { ResponseBenchmark, ResponseMetrics } from "../../core/models.js";
import { longestUnseen, responseEpisodes, responsePoints, type ResponseEpisode, type ResponsePoints, type Stretch } from "../../core/response.js";
import { formatDate, formatDateTime, formatDuration, hoursBetween, hoursFromMilliseconds } from "../../core/time.js";
import { fitText } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { group, rect, text, truncate, wrap } from "../svg.js";
import type { Palette } from "../theme.js";
import { defineRenderer, optionValue, type RenderContext, type RendererOption } from "./registry.js";

const TILE_HEIGHT = 122;
const TILE_GAP = 14;
const BODY_TOP = 26;
const BAR_HEIGHT = 132;
const ROW_MAX = 84;
const CAUSE_MAX = 116;
const ROOMY_SEGMENT = 180;
const LABEL_WIDTH = 150;
const VALUE_ROOM = 140;
const PERCENT = 100;

enum View {
    Breakdown = "breakdown",
    Target = "target",
    History = "history",
    Causes = "causes"
}

const VIEW_OPTION: RendererOption<View> = {
    id: "view",
    label: "Compare",
    fallback: View.Breakdown,
    choices: [
        { value: View.Breakdown, label: "Where the time went" },
        { value: View.Target, label: "Against target" },
        { value: View.History, label: "Against our history" },
        { value: View.Causes, label: "What let it run" }
    ]
};

interface Objective {
    label: string;
    hours: number;
    actual: (points: ResponsePoints) => number | null;
}

// What a response aims for when nobody has recorded a target of its own. Named so a reader can tell these
// are defaults rather than this team's commitments.
const DEFAULT_OBJECTIVES: readonly Objective[] = [
    { label: "Detect", hours: 24, actual: points => hoursBetween(points.firstAttack, points.firstNoticed) },
    { label: "Contain", hours: 72, actual: points => hoursBetween(points.firstNoticed, points.contained) },
    { label: "Eradicate", hours: 168, actual: points => hoursBetween(points.firstNoticed, points.eradicated) },
    { label: "Recover", hours: 336, actual: points => hoursBetween(points.firstNoticed, points.recovered) }
];

interface Figure {
    label: string;
    value: string | null;
    icon: Icon;
    color: string;
    hint: string;
}

interface ComparisonRow {
    label: string;
    actual: number | null;
    reference: number | null;
    color: string;
}

interface Comparison {
    caption: string | null;
    referenceLabel: string;
    rows: ComparisonRow[];
}

interface Phase {
    label: string;
    from: Date;
    to: Date;
    color: string;
}

interface Cause {
    title: string;
    at: Date | null;
    cost: number | null;
    note: string;
}

type Episode = ResponseEpisode<TimelineStep>;

/**
 * The figures worth quoting whichever comparison is on screen.
 */
function figures(palette: Palette, steps: readonly TimelineStep[], points: ResponsePoints, episodes: readonly Episode[]): Figure[] {
    const unseen = longestUnseen(steps);
    const responseEnd = episodes.at(-1)?.to ?? null;
    const failed = episodes.filter(episode => episode.failed).length;

    return [
        {
            label: "Time undetected",
            value: formatDuration(unseen ? unseen.hours : null),
            icon: Icon.ThreatActor,
            color: palette.sides[Side.Attacker].color,
            hint: unseen ? `${formatDate(unseen.from)} to ${formatDate(unseen.to)}` : "nothing was ever noticed"
        },
        {
            label: "Incident span",
            value: formatDuration(hoursBetween(points.firstAttack, responseEnd)),
            icon: Icon.Timeline,
            color: palette.sides[Side.Victim].color,
            hint: "first attacker action to the last thing the response did"
        },
        {
            label: "Response span",
            value: formatDuration(hoursBetween(points.firstNoticed, responseEnd)),
            icon: Icon.Recover,
            color: palette.good,
            hint: "from the first time anyone noticed"
        },
        {
            label: "Investigations",
            value: episodes.length > 0 ? String(episodes.length) : null,
            icon: Icon.Microscope,
            color: palette.sides[Side.Defender].color,
            hint: failed > 0 ? `${failed} of them left the threat in place` : "every one of them closed out"
        }
    ];
}

function tiles(context: RenderContext, entries: readonly Figure[], x: number, y: number): SVGGElement {
    const { palette, icons } = context;
    const node = group();
    const width = (CONTENT.width - TILE_GAP * (entries.length - 1)) / entries.length;

    entries.forEach((entry, index) => {
        const tileX = x + index * (width + TILE_GAP);
        const known = entry.value !== null;

        node.appendChild(rect(tileX, y, width, TILE_HEIGHT, {
            rx: 12, fill: palette.tint(entry.color, known ? 0.94 : 0.985), stroke: palette.tint(entry.color, known ? 0.76 : 0.94), "stroke-width": 1
        }));
        node.appendChild(rect(tileX + 18, y + 18, 28, 28, { rx: 6, fill: palette.tint(entry.color, known ? 0.8 : 0.92) }));
        node.appendChild(icons.draw(entry.icon, tileX + 32, y + 32, 16, known ? entry.color : palette.borderStrong));

        const label = fitText(entry.label.toUpperCase(), width - 74, { size: 10, minSize: 7.5 });
        node.appendChild(text(label.text, tileX + 56, y + 32, {
            "font-size": label.size, "font-weight": 700, "letter-spacing": 0.9, fill: palette.inkMuted, "dominant-baseline": "central"
        }));
        node.appendChild(text(entry.value ?? "not recorded", tileX + 18, y + 82, {
            "font-size": known ? 33 : 17, "font-weight": 700, fill: known ? palette.ink : palette.borderStrong
        }));
        node.appendChild(text(truncate(entry.hint, 10, width - 36), tileX + 18, y + TILE_HEIGHT - 16, { "font-size": 10, fill: palette.inkMuted }));
    });
    return node;
}

/**
 * Where the elapsed time actually went. One bar for the whole incident cut into the phases it passed
 * through, each sized by how long it really took. The first segment is the point of it: on most
 * incidents the time before anyone knew dwarfs the response that followed.
 */
function breakdown(palette: Palette, points: ResponsePoints, episodes: readonly Episode[], unseen: Stretch | null, top: number, height: number): SVGGElement {
    const node = group();
    const responseEnd = episodes.at(-1)?.to ?? null;
    // Only the two states the incident was ever in, and the split is the detection that held rather than
    // the first alarm: a notice whose remediation failed left the intruder exactly as hidden as before
    const known = points.detected ?? points.firstNoticed;
    const candidates: { label: string; from: Date | null; to: Date | null; color: string }[] = [
        { label: "Before anyone knew", from: points.firstAttack, to: known, color: palette.sides[Side.Attacker].color },
        { label: "Known and being worked", from: known, to: responseEnd, color: palette.sides[Side.Defender].color }
    ];
    const phases = candidates.filter((phase): phase is Phase => phase.from !== null && phase.to !== null && phase.to.getTime() > phase.from.getTime());

    const first = phases[0];
    const last = phases.at(-1);
    if (!first || !last) {
        node.appendChild(text("The recorded dates do not form a sequence yet.", CONTENT.x, top + 30, { "font-size": 12, fill: palette.inkMuted }));
        return node;
    }

    const length = (phase: Phase): number => phase.to.getTime() - phase.from.getTime();
    const total = phases.reduce((sum, phase) => sum + length(phase), 0);
    const barY = top + Math.max(24, (height - BAR_HEIGHT) / 2 - 20);
    let cursor = CONTENT.x;

    node.appendChild(text(`${formatDate(first.from)} to ${formatDate(last.to)}`, CONTENT.x, barY - 14, {
        "font-size": 10, "font-weight": 700, "letter-spacing": 0.6, fill: palette.inkMuted
    }));
    if (unseen) {
        node.appendChild(text(`Longest single stretch unseen: ${formatDuration(unseen.hours)}`, CONTENT.right, barY - 14, {
            "font-size": 10, "font-weight": 700, "text-anchor": "end", fill: palette.sides[Side.Attacker].color
        }));
    }

    // Rounded one by one, the shares can add up to 101; the last one takes whatever is left instead
    let shareLeft = PERCENT;
    phases.forEach((phase, index) => {
        const width = (length(phase) / total) * CONTENT.width;
        const share = index === phases.length - 1 ? shareLeft : Math.round((length(phase) / total) * PERCENT);
        shareLeft -= share;

        node.appendChild(rect(cursor, barY, Math.max(2, width), BAR_HEIGHT, { rx: 8, fill: palette.tint(phase.color, 0.72), stroke: phase.color, "stroke-width": 1 }));

        // Written under the bar when the segment is too narrow to hold it, rather than dropped
        const roomy = width > ROOMY_SEGMENT;
        const anchorX = roomy ? cursor + 18 : cursor;
        const anchorY = roomy ? barY + 42 : barY + BAR_HEIGHT + 22;

        node.appendChild(text(`${phase.label.toUpperCase()}   ${share}%`, anchorX, anchorY, {
            "font-size": 10.5, "font-weight": 700, "letter-spacing": 0.7, fill: roomy ? palette.ink : palette.inkMuted
        }));
        node.appendChild(text(formatDuration(hoursFromMilliseconds(length(phase))), anchorX, anchorY + (roomy ? 32 : 18), {
            "font-size": roomy ? 26 : 14, "font-weight": 700, fill: phase.color
        }));
        cursor += width;
    });
    return node;
}

function againstObjectives(palette: Palette, points: ResponsePoints): Comparison {
    return {
        caption: "Against a default objective, until this team records targets of its own",
        referenceLabel: "Objective",
        rows: DEFAULT_OBJECTIVES.map(objective => ({
            label: objective.label,
            actual: objective.actual(points),
            reference: objective.hours,
            color: palette.sides[Side.Defender].color
        }))
    };
}

function againstHistory(palette: Palette, benchmark: ResponseBenchmark, points: ResponsePoints): Comparison {
    if (benchmark.sampleSize === 0) {
        return { caption: null, referenceLabel: "Usually", rows: [] };
    }
    return {
        caption: `Middle of the last ${benchmark.sampleSize} incident(s)${benchmark.scope ? ` of ${benchmark.scope}` : ""}`,
        referenceLabel: "Usually",
        rows: [
            { label: "Detect", actual: hoursBetween(points.firstAttack, points.firstNoticed), reference: benchmark.medianTimeToDetectHours, color: palette.sides[Side.Defender].color },
            { label: "Contain", actual: hoursBetween(points.firstNoticed, points.contained), reference: benchmark.medianTimeToContainHours, color: palette.sides[Side.Victim].color },
            { label: "Recover", actual: hoursBetween(points.firstNoticed, points.recovered), reference: benchmark.medianTimeToRecoverHours, color: palette.good }
        ]
    };
}

/**
 * This incident against whatever it is held to, one row each, both bars on the same scale so the
 * comparison is the length of them rather than the numbers printed beside them.
 */
function comparison(palette: Palette, model: Comparison, top: number, height: number, emptyMessage: string): SVGGElement {
    const node = group();
    const rows = model.rows.filter(row => row.actual !== null || row.reference !== null);

    if (rows.length === 0) {
        node.appendChild(text(emptyMessage, CONTENT.x, top + 30, { "font-size": 12, fill: palette.inkMuted }));
        return node;
    }

    if (model.caption) {
        node.appendChild(text(model.caption, CONTENT.x, top + 4, { "font-size": 10.5, "font-weight": 700, "letter-spacing": 0.6, fill: palette.inkMuted }));
    }

    const rowTop = top + 28;
    const rowHeight = Math.min(ROW_MAX, (height - 44) / rows.length);
    const trackX = CONTENT.x + LABEL_WIDTH;
    const trackWidth = CONTENT.width - LABEL_WIDTH - VALUE_ROOM;
    const ceiling = Math.max(1, ...rows.flatMap(row => [row.actual ?? 0, row.reference ?? 0]));

    rows.forEach((row, index) => {
        const y = rowTop + index * rowHeight;
        const missed = row.actual !== null && row.reference !== null && row.actual > row.reference;
        const color = missed ? palette.sides[Side.Attacker].color : row.color;

        node.appendChild(text(row.label.toUpperCase(), CONTENT.x, y + 24, { "font-size": 11, "font-weight": 700, "letter-spacing": 0.8, fill: palette.ink }));

        if (row.reference !== null) {
            node.appendChild(rect(trackX, y + 8, Math.max(2, (row.reference / ceiling) * trackWidth), 12, { rx: 6, fill: palette.tint(palette.borderStrong, 0.5) }));
            node.appendChild(text(`${model.referenceLabel} ${formatDuration(row.reference)}`, CONTENT.right, y + 14, {
                "font-size": 10, "text-anchor": "end", "dominant-baseline": "central", fill: palette.inkMuted
            }));
        }

        if (row.actual !== null) {
            node.appendChild(rect(trackX, y + 26, Math.max(2, (row.actual / ceiling) * trackWidth), 18, { rx: 9, fill: palette.tint(color, 0.55), stroke: color, "stroke-width": 1 }));
            node.appendChild(text(formatDuration(row.actual), CONTENT.right, y + 35, {
                "font-size": 13, "font-weight": 700, "text-anchor": "end", "dominant-baseline": "central", fill: color
            }));
        } else {
            node.appendChild(text("not recorded", trackX, y + 35, { "font-size": 11, "dominant-baseline": "central", fill: palette.borderStrong }));
        }
    });
    return node;
}

/**
 * The moments that cost time, and what each of them cost. Not a measurement: a list of what would have
 * had to go differently for the figures above to be smaller.
 */
function causes(context: RenderContext, steps: readonly TimelineStep[], episodes: readonly Episode[], top: number, height: number): SVGGElement {
    const { palette, icons } = context;
    const node = group();
    const entries: Cause[] = [];

    episodes.forEach((episode, index) => {
        if (!episode.failed) return;
        const failure = episode.steps.find(step => step.outcome === StepOutcome.Failed);
        const next = episodes[index + 1];
        entries.push({
            title: failure ? failure.title : `Investigation ${index + 1} closed without fixing it`,
            at: failure ? failure.at : episode.to,
            cost: next ? hoursFromMilliseconds(next.from.getTime() - episode.to.getTime()) : null,
            note: next ? "before anyone looked again" : "and nothing followed it"
        });
    });

    steps
        .filter(step => step.outcome === StepOutcome.Failed && !entries.some(entry => entry.title === step.title))
        .forEach(step => entries.push({ title: step.title, at: step.at, cost: null, note: "recorded as failed" }));

    if (entries.length === 0) {
        node.appendChild(text("Nothing in the record is marked as failed, so there is no lost time to attribute.", CONTENT.x, top + 30, { "font-size": 12, fill: palette.inkMuted }));
        return node;
    }

    const rowHeight = Math.min(CAUSE_MAX, height / entries.length);
    const color = palette.sides[Side.Attacker].color;

    entries.forEach((entry, index) => {
        const y = top + index * rowHeight;
        node.appendChild(rect(CONTENT.x, y, CONTENT.width, rowHeight - 12, { rx: 10, fill: palette.tint(color, 0.965), stroke: palette.tint(color, 0.86), "stroke-width": 1 }));
        node.appendChild(rect(CONTENT.x + 18, y + 18, 30, 30, { rx: 6, fill: palette.tint(color, 0.86) }));
        node.appendChild(icons.draw(Icon.Warning, CONTENT.x + 33, y + 33, 17, color));

        wrap(entry.title, 14, CONTENT.width - 420, 2).forEach((lineText, lineIndex) => {
            node.appendChild(text(lineText, CONTENT.x + 62, y + 28 + lineIndex * 18, { "font-size": 14, "font-weight": 600, fill: palette.ink }));
        });
        node.appendChild(text(formatDateTime(entry.at), CONTENT.x + 62, y + rowHeight - 28, { "font-size": 10, fill: palette.inkMuted }));

        if (entry.cost !== null) {
            node.appendChild(text(formatDuration(entry.cost), CONTENT.right - 20, y + 36, { "font-size": 26, "font-weight": 700, "text-anchor": "end", fill: color }));
            node.appendChild(text(entry.note, CONTENT.right - 20, y + 56, { "font-size": 10, "text-anchor": "end", fill: palette.inkMuted }));
        } else {
            node.appendChild(text(entry.note, CONTENT.right - 20, y + 36, { "font-size": 11, "text-anchor": "end", fill: palette.inkMuted }));
        }
    });
    return node;
}

export const responseMetrics = defineRenderer<ResponseMetrics>({
    representation: Representation.ResponseMetrics,
    options: [VIEW_OPTION],

    pages(context) {
        return [context.store.metrics];
    },

    draw(context, _, pageIndex, pageCount) {
        const { store, palette } = context;
        const steps = store.visibleSteps();
        const points = responsePoints(steps);
        const episodes = responseEpisodes(steps);
        const view = optionValue(context, VIEW_OPTION);

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: VIEW_OPTION.choices.find(choice => choice.value === view)?.label ?? null,
            legend: []
        });

        if (!points.firstAttack && !points.firstNoticed) {
            content.appendChild(placeholder(context, "Not enough dates to measure", "Record when the attacker acted and when the response noticed."));
            return root;
        }

        content.appendChild(tiles(context, figures(palette, steps, points, episodes), CONTENT.x, CONTENT.y));

        const top = CONTENT.y + TILE_HEIGHT + BODY_TOP;
        const height = CONTENT.bottom - top;

        switch (view) {
            case View.Breakdown:
                content.appendChild(breakdown(palette, points, episodes, longestUnseen(steps), top, height));
                break;
            case View.Target:
                content.appendChild(comparison(palette, againstObjectives(palette, points), top, height, "No objective applies until the response has a detection recorded."));
                break;
            case View.History:
                content.appendChild(comparison(palette, againstHistory(palette, store.benchmark, points), top, height, "No earlier incident of this scope has a detection step to compare against."));
                break;
            case View.Causes:
                content.appendChild(causes(context, steps, episodes, top, height));
                break;
        }
        return root;
    }
});
