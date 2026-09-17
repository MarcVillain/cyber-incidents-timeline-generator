// What a diagram holds, counted rather than drawn. A host reporting on its incidents needs the figures
// without a browser, and reads them from the same records the representations do.

import type { AttackTactic, Audience, Confidence, Involvement, KillChainPhase, LinkKind, NodeCategory, NodeKind, ResponsePhase, Side, StepOutcome } from "./enums.js";
import { killChainPhaseOf } from "./catalog.js";
import type { Diagram, DiagramNode, DiagramStep, ImpactLevel, RecordId, ResponseMetrics, WallClock } from "./models.js";
import { hoursBetween, parseWallClock } from "./time.js";

/** A count per value of a vocabulary, holding only the values that occur. */
export type Tally<TKey extends string> = Readonly<Partial<Record<TKey, number>>>;

/** The step holding a named milestone, and when it says the milestone happened. */
export interface MilestoneMoment {
    key: string;
    stepId: RecordId;
    timestamp: WallClock;
    timeKnown: boolean;
}

export interface NodeSummary {
    total: number;
    compromised: number;
    byKind: Tally<NodeKind>;
    byCategory: Tally<NodeCategory>;
    bySide: Tally<Side>;
    byCriticality: Tally<ImpactLevel>;
}

export interface StepSummary {
    total: number;
    milestones: number;
    withoutTime: number;
    bySide: Tally<Side>;
    byOutcome: Tally<StepOutcome>;
    byTactic: Tally<AttackTactic>;
    byKillChainPhase: Tally<KillChainPhase>;
    byResponsePhase: Tally<ResponsePhase>;
    byAudience: Tally<Audience>;
    byConfidence: Tally<Confidence>;
    /** Every technique named at least once, in the order they first appear. */
    techniques: readonly string[];
    /** Every evidence source named at least once. */
    evidenceSources: readonly string[];
    tags: Tally<string>;
}

export interface LinkSummary {
    total: number;
    byKind: Tally<LinkKind>;
    byConfidence: Tally<Confidence>;
    byInvolvement: Tally<Involvement>;
}

/** When the incident starts and ends according to the records, and how long that is. */
export interface SpanSummary {
    start: WallClock | null;
    end: WallClock | null;
    hours: number | null;
}

/**
 * Everything a host can count about one incident. Derived from the records, so it never disagrees with
 * what the representations draw.
 */
export interface DiagramSummary {
    incidentId: RecordId;
    title: string;
    referenceId: string | null;
    impact: ImpactLevel;
    scope: string | null;
    classifications: readonly string[];
    nodes: NodeSummary;
    steps: StepSummary;
    links: LinkSummary;
    span: SpanSummary;
    metrics: ResponseMetrics;
    /** The named milestones that are claimed, in the order the catalog declares them. */
    milestones: readonly MilestoneMoment[];
    /** The keys the catalog declares that no step holds. */
    missingMilestones: readonly string[];
}

function tallyOf<TKey extends string>(values: readonly TKey[]): Tally<TKey> {
    const counts: Partial<Record<TKey, number>> = {};
    values.forEach(value => {
        counts[value] = (counts[value] ?? 0) + 1;
    });
    return counts;
}

function distinct(values: readonly (string | null)[]): string[] {
    const kept = new Set<string>();
    values.forEach(value => {
        const trimmed = value?.trim();
        if (trimmed) kept.add(trimmed);
    });
    return [...kept];
}

function summariseNodes(nodes: readonly DiagramNode[]): NodeSummary {
    return {
        total: nodes.length,
        compromised: nodes.filter(node => node.compromised).length,
        byKind: tallyOf(nodes.map(node => node.kind)),
        byCategory: tallyOf(nodes.map(node => node.category)),
        bySide: tallyOf(nodes.map(node => node.side)),
        byCriticality: tallyOf(nodes.map(node => node.criticality))
    };
}

function summariseSteps(steps: readonly DiagramStep[]): StepSummary {
    return {
        total: steps.length,
        milestones: steps.filter(step => step.isMilestone).length,
        withoutTime: steps.filter(step => parseWallClock(step.timestamp) === null).length,
        bySide: tallyOf(steps.map(step => step.side)),
        byOutcome: tallyOf(steps.map(step => step.outcome)),
        byTactic: tallyOf(steps.map(step => step.attackTactic)),
        byKillChainPhase: tallyOf(steps.map(step => killChainPhaseOf(step.attackTactic))),
        byResponsePhase: tallyOf(steps.map(step => step.responsePhase)),
        byAudience: tallyOf(steps.map(step => step.audience)),
        byConfidence: tallyOf(steps.map(step => step.confidence)),
        techniques: distinct(steps.map(step => step.mitreTechniqueId)),
        evidenceSources: distinct(steps.map(step => step.evidenceSource)),
        tags: tallyOf(steps.flatMap(step => step.tags))
    };
}

function summariseSpan(steps: readonly DiagramStep[]): SpanSummary {
    const moments = steps
        .flatMap(step => [step.timestamp, step.endTimestamp])
        .map(value => (value === null ? null : parseWallClock(value)))
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime());

    const first = moments[0] ?? null;
    const last = moments.at(-1) ?? null;
    const step = steps.find(entry => parseWallClock(entry.timestamp)?.getTime() === first?.getTime());
    const lastStep = steps.find(entry => (parseWallClock(entry.endTimestamp) ?? parseWallClock(entry.timestamp))?.getTime() === last?.getTime());

    return {
        start: step?.timestamp ?? null,
        end: lastStep ? lastStep.endTimestamp ?? lastStep.timestamp : null,
        hours: hoursBetween(first, last)
    };
}

function summariseMilestones(diagram: Diagram): { milestones: MilestoneMoment[]; missing: string[] } {
    const held = new Map<string, DiagramStep>();
    diagram.steps.forEach(step => {
        if (step.milestoneKey !== null && !held.has(step.milestoneKey)) {
            held.set(step.milestoneKey, step);
        }
    });

    const milestones: MilestoneMoment[] = [];
    const missing: string[] = [];
    diagram.catalog.milestones.forEach(entry => {
        const step = held.get(entry.key);
        if (step) {
            milestones.push({ key: entry.key, stepId: step.id, timestamp: step.timestamp, timeKnown: step.timeKnown });
        } else {
            missing.push(entry.key);
        }
    });
    return { milestones, missing };
}

/**
 * Counts one diagram. Pure, so a scheduled job can call it on the server with nothing but the records.
 */
export function summarise(diagram: Diagram): DiagramSummary {
    const { milestones, missing } = summariseMilestones(diagram);
    return {
        incidentId: diagram.incident.id,
        title: diagram.incident.title,
        referenceId: diagram.incident.referenceId,
        impact: diagram.incident.impact,
        scope: diagram.incident.scope,
        classifications: diagram.incident.classifications,
        nodes: summariseNodes(diagram.nodes),
        steps: summariseSteps(diagram.steps),
        links: {
            total: diagram.links.length,
            byKind: tallyOf(diagram.links.map(link => link.kind)),
            byConfidence: tallyOf(diagram.links.map(link => link.confidence)),
            byInvolvement: tallyOf(diagram.steps.flatMap(step => step.involvements.map(entry => entry.involvement)))
        },
        span: summariseSpan(diagram.steps),
        metrics: diagram.metrics,
        milestones,
        missingMilestones: missing
    };
}
