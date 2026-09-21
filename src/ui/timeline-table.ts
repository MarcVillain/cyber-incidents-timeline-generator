// The timeline as a table: one row per visible step in timeline order, and the columns an analyst
// picked and named. The narrative slide draws it and the tabular exports write it, so both hold the
// same cells.

import { AttackTactic, KillChainPhase, ResponsePhase, Side } from "../core/enums.js";
import type { DiagramNode } from "../core/models.js";
import { hoursBetween, type TimeFormats } from "../core/time.js";
import type { DiagramStore, TimelineStep } from "./diagram-store.js";
import { OptionKind, type ListEntry, type RendererListOption } from "./renderers/registry.js";
import type { Strings, TableStrings } from "./strings.js";
import { stripTags } from "./svg.js";

export enum TableColumn {
    Number = "number",
    When = "when",
    Date = "date",
    Time = "time",
    Until = "until",
    Duration = "duration",
    Elapsed = "elapsed",
    Who = "who",
    WhoKind = "who-kind",
    What = "what",
    Details = "details",
    Where = "where",
    WhereKind = "where-kind",
    WhereIdentifier = "where-identifier",
    WhereCriticality = "where-criticality",
    WhereCompromised = "where-compromised",
    Involved = "involved",
    Side = "side",
    Stage = "stage",
    Tactic = "tactic",
    KillChain = "kill-chain",
    ResponsePhase = "response-phase",
    Technique = "technique",
    Severity = "severity",
    Confidence = "confidence",
    Outcome = "outcome",
    Audience = "audience",
    Milestone = "milestone",
    Evidence = "evidence",
    Tags = "tags",
    Reference = "reference"
}

export const TABLE_COLUMNS_OPTION_ID = "columns";

const LIST_JOIN = ", ";

interface ColumnInfo {
    /** How wide the column is against the others, which the slide turns into a share and a sheet into characters. */
    weight: number;
    label(words: TableStrings): string;
}

const COLUMNS: Readonly<Record<TableColumn, ColumnInfo>> = {
    [TableColumn.Number]: { weight: 5, label: words => words.number },
    [TableColumn.When]: { weight: 16, label: words => words.when },
    [TableColumn.Date]: { weight: 11, label: words => words.date },
    [TableColumn.Time]: { weight: 7, label: words => words.time },
    [TableColumn.Until]: { weight: 16, label: words => words.until },
    [TableColumn.Duration]: { weight: 9, label: words => words.duration },
    [TableColumn.Elapsed]: { weight: 9, label: words => words.elapsed },
    [TableColumn.Who]: { weight: 16, label: words => words.who },
    [TableColumn.WhoKind]: { weight: 12, label: words => words.whoKind },
    [TableColumn.What]: { weight: 40, label: words => words.what },
    [TableColumn.Details]: { weight: 44, label: words => words.details },
    [TableColumn.Where]: { weight: 16, label: words => words.where },
    [TableColumn.WhereKind]: { weight: 12, label: words => words.whereKind },
    [TableColumn.WhereIdentifier]: { weight: 16, label: words => words.whereIdentifier },
    [TableColumn.WhereCriticality]: { weight: 10, label: words => words.whereCriticality },
    [TableColumn.WhereCompromised]: { weight: 9, label: words => words.whereCompromised },
    [TableColumn.Involved]: { weight: 22, label: words => words.involved },
    [TableColumn.Side]: { weight: 10, label: words => words.side },
    [TableColumn.Stage]: { weight: 14, label: words => words.stage },
    [TableColumn.Tactic]: { weight: 14, label: words => words.tactic },
    [TableColumn.KillChain]: { weight: 14, label: words => words.killChain },
    [TableColumn.ResponsePhase]: { weight: 12, label: words => words.responsePhase },
    [TableColumn.Technique]: { weight: 10, label: words => words.technique },
    [TableColumn.Severity]: { weight: 10, label: words => words.severity },
    [TableColumn.Confidence]: { weight: 10, label: words => words.confidence },
    [TableColumn.Outcome]: { weight: 10, label: words => words.outcome },
    [TableColumn.Audience]: { weight: 10, label: words => words.audience },
    [TableColumn.Milestone]: { weight: 14, label: words => words.milestone },
    [TableColumn.Evidence]: { weight: 14, label: words => words.evidence },
    [TableColumn.Tags]: { weight: 16, label: words => words.tags },
    [TableColumn.Reference]: { weight: 12, label: words => words.reference }
};

const DEFAULT_COLUMNS: readonly TableColumn[] = [TableColumn.When, TableColumn.Who, TableColumn.What, TableColumn.Where, TableColumn.Stage];

export function columnLabel(strings: Strings, column: TableColumn): string {
    return COLUMNS[column].label(strings.table);
}

/** The heading a column is shown under: the name it was given, or its own. */
export function headingOf(strings: Strings, entry: ListEntry<TableColumn>): string {
    return entry.label ?? columnLabel(strings, entry.value);
}

export function columnWeight(column: TableColumn): number {
    return COLUMNS[column].weight;
}

export function tableColumnsOption(strings: Strings): RendererListOption<TableColumn> {
    return {
        kind: OptionKind.List,
        id: TABLE_COLUMNS_OPTION_ID,
        label: strings.options.columns,
        description: strings.options.columnsDescription,
        renamable: true,
        example: (context, column) => columnExample(tableSource(context.store, context.time, context.strings), column),
        fallback: DEFAULT_COLUMNS,
        choices: Object.values(TableColumn).map(column => ({ value: column, label: columnLabel(strings, column) }))
    };
}

/** Where the step sits in the attack or in the response, whichever side took it. */
export function stageLabel(store: DiagramStore, step: TimelineStep): string {
    return step.side === Side.Defender ? store.responseInfo(step.responsePhase).label : store.tacticInfo(step.attackTactic).label;
}

/**
 * What every cell of one table reads besides its step, worked out once rather than per cell.
 */
export interface TableSource {
    store: DiagramStore;
    time: TimeFormats;
    strings: Strings;
    /** The moment of the first visible step, which the time since the start is counted from. */
    start: Date | null;
}

export function tableSource(store: DiagramStore, time: TimeFormats, strings: Strings): TableSource {
    return { store, time, strings, start: store.visibleSteps()[0]?.at ?? null };
}

function yesNo(words: TableStrings, value: boolean): string {
    return value ? words.yes : words.no;
}

function targetCell(source: TableSource, step: TimelineStep, read: (node: DiagramNode) => string): string {
    const node = source.store.node(step.targetNodeId);
    return node ? read(node) : "";
}

function milestoneCell(source: TableSource, step: TimelineStep): string {
    const named = source.store.catalog.milestones.find(entry => entry.key === step.milestoneKey);
    if (named) return named.label;
    return step.isMilestone ? source.strings.table.yes : "";
}

function involvedCell(source: TableSource, step: TimelineStep): string {
    const { store, strings } = source;
    return step.involvements.flatMap(entry => {
        const node = store.node(entry.nodeId);
        if (!node) return [];
        const role = store.catalog.involvements.find(option => option.value === entry.involvement)?.label ?? entry.involvement;
        return [strings.table.involvement(node.name, role)];
    }).join(LIST_JOIN);
}

/**
 * The text of one cell, or an empty string when the step records nothing for the column, so each
 * output decides how to show a gap. The index is the position of the step in the whole table.
 */
export function cellText(source: TableSource, step: TimelineStep, column: TableColumn, index: number): string {
    const { store, time, strings } = source;
    const words = strings.table;
    switch (column) {
        case TableColumn.Number:
            return String(index + 1);
        case TableColumn.When:
            return time.formatMoment(step);
        case TableColumn.Date:
            return time.formatDate(step.at);
        case TableColumn.Time:
            return step.timeKnown ? time.formatTime(step.at) : "";
        case TableColumn.Until:
            return time.formatMoment({ at: step.until, timeKnown: step.timeKnown });
        case TableColumn.Duration:
            return time.formatDuration(hoursBetween(step.at, step.until)) ?? "";
        case TableColumn.Elapsed: {
            const elapsed = time.formatDuration(hoursBetween(source.start, step.at));
            return elapsed === null ? "" : words.sinceStart(elapsed);
        }
        case TableColumn.Who:
            return store.node(step.sourceNodeId)?.name ?? "";
        case TableColumn.WhoKind: {
            const node = store.node(step.sourceNodeId);
            return node ? store.kindInfo(node.kind).label : "";
        }
        case TableColumn.What:
            return stripTags(step.title);
        case TableColumn.Details:
            return stripTags(step.description);
        case TableColumn.Where:
            return targetCell(source, step, node => node.name);
        case TableColumn.WhereKind:
            return targetCell(source, step, node => store.kindInfo(node.kind).label);
        case TableColumn.WhereIdentifier:
            return targetCell(source, step, node => node.identifier ?? "");
        case TableColumn.WhereCriticality:
            return targetCell(source, step, node => store.impactLevel(node.criticality)?.label ?? node.criticality);
        case TableColumn.WhereCompromised:
            return targetCell(source, step, node => yesNo(words, node.compromised));
        case TableColumn.Involved:
            return involvedCell(source, step);
        case TableColumn.Side:
            return store.sideInfo(step.side).label;
        case TableColumn.Stage:
            return stageLabel(store, step);
        case TableColumn.Tactic:
            return step.attackTactic === AttackTactic.None ? "" : store.tacticInfo(step.attackTactic).label;
        case TableColumn.KillChain:
            return step.killChainPhase === KillChainPhase.None ? "" : store.killChainInfo(step.killChainPhase).label;
        case TableColumn.ResponsePhase:
            return step.responsePhase === ResponsePhase.None ? "" : store.responseInfo(step.responsePhase).label;
        case TableColumn.Technique:
            return step.mitreTechniqueId ?? "";
        case TableColumn.Severity:
            return store.impactLevel(step.severity)?.label ?? step.severity;
        case TableColumn.Confidence:
            return store.catalog.confidences.find(entry => entry.value === step.confidence)?.label ?? step.confidence;
        case TableColumn.Outcome:
            return store.outcomeInfo(step.outcome).label;
        case TableColumn.Audience:
            return store.catalog.audiences.find(entry => entry.value === step.audience)?.label ?? step.audience;
        case TableColumn.Milestone:
            return milestoneCell(source, step);
        case TableColumn.Evidence:
            return step.evidenceSource ?? "";
        case TableColumn.Tags:
            return step.tags.join(LIST_JOIN);
        case TableColumn.Reference:
            return step.externalId ?? "";
    }
}

/** The first thing the column would say about the steps on screen, or null when it says nothing. */
export function columnExample(source: TableSource, column: TableColumn): string | null {
    const steps = source.store.visibleSteps();
    for (const [index, step] of steps.entries()) {
        const text = cellText(source, step, column, index);
        if (text !== "") return text;
    }
    return null;
}

export interface TableHeading {
    label: string;
    weight: number;
}

export interface TableData {
    headings: readonly TableHeading[];
    rows: readonly (readonly string[])[];
}

export function timelineTable(store: DiagramStore, time: TimeFormats, strings: Strings, columns: readonly ListEntry<TableColumn>[]): TableData {
    const source = tableSource(store, time, strings);
    return {
        headings: columns.map(entry => ({ label: headingOf(strings, entry), weight: columnWeight(entry.value) })),
        rows: store.visibleSteps().map((step, index) => columns.map(entry => cellText(source, step, entry.value, index)))
    };
}
