import { ResponsePhase, Side } from "./enums.js";
import type { Incident, ResponseBenchmark, ResponseMetrics, StepRecord, WallClock } from "./models.js";
import { hoursBetween, parseWallClock } from "./time.js";

export const DEFAULT_BENCHMARK_SAMPLE_SIZE = 25;

const HOUR_DECIMALS = 100;

function roundedHoursBetween(from: WallClock | null, to: WallClock | null): number | null {
    const hours = hoursBetween(parseWallClock(from), parseWallClock(to));
    return hours === null ? null : Math.round(hours * HOUR_DECIMALS) / HOUR_DECIMALS;
}

function earliest(values: readonly (WallClock | null)[]): WallClock | null {
    let found: WallClock | null = null;
    let foundTime = Number.POSITIVE_INFINITY;
    for (const value of values) {
        const time = parseWallClock(value)?.getTime() ?? Number.POSITIVE_INFINITY;
        if (time < foundTime) {
            found = value;
            foundTime = time;
        }
    }
    return found;
}

function firstResponse(defenderSteps: readonly StepRecord[], phase: ResponsePhase): WallClock | null {
    return earliest(defenderSteps.filter(step => step.responsePhase === phase).map(step => step.timestamp));
}

/**
 * The response figures of an incident, read from its steps alone. The steps are the record of what
 * happened, so every figure can be traced back to a step on the slides.
 */
export function buildMetrics(steps: readonly StepRecord[]): ResponseMetrics {
    const attackerSteps = steps.filter(step => step.side === Side.Attacker);
    const defenderSteps = steps.filter(step => step.side === Side.Defender);

    const firstAttackerAction = earliest(attackerSteps.map(step => step.timestamp));
    const firstDefenderAction = earliest(defenderSteps.map(step => step.timestamp));
    const detection = firstResponse(defenderSteps, ResponsePhase.Detect);
    const containment = firstResponse(defenderSteps, ResponsePhase.Contain);
    const eradication = firstResponse(defenderSteps, ResponsePhase.Eradicate);
    const recovery = firstResponse(defenderSteps, ResponsePhase.Recover);

    return {
        firstAttackerAction,
        firstDefenderAction,
        detection,
        containment,
        eradication,
        recovery,
        dwellHours: roundedHoursBetween(firstAttackerAction, detection),
        timeToDetectHours: roundedHoursBetween(firstAttackerAction, detection),
        timeToContainHours: roundedHoursBetween(detection, containment),
        timeToRecoverHours: roundedHoursBetween(detection, recovery)
    };
}

export function median(values: readonly (number | null)[]): number | null {
    const known = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
    if (known.length === 0) {
        return null;
    }
    const middle = Math.floor(known.length / 2);
    return known.length % 2 === 1 ? known[middle] ?? null : ((known[middle - 1] ?? 0) + (known[middle] ?? 0)) / 2;
}

/**
 * An incident with the figures of its steps, as the benchmark compares them.
 */
export interface MeasuredIncident {
    incident: Incident;
    metrics: ResponseMetrics;
}

/**
 * The moment an incident is ordered by: the first thing anybody did in it.
 */
function referenceTime(metrics: ResponseMetrics): number | null {
    return parseWallClock(earliest([metrics.firstAttackerAction, metrics.firstDefenderAction]))?.getTime() ?? null;
}

/**
 * The middle of what the response usually takes, drawn from the incidents of the same scope that came
 * before this one and recorded a detection.
 */
export function buildBenchmark(current: MeasuredIncident, others: readonly MeasuredIncident[], sampleSize = DEFAULT_BENCHMARK_SAMPLE_SIZE): ResponseBenchmark {
    const reference = referenceTime(current.metrics);

    const sample = reference === null ? [] : others
        .filter(candidate => candidate.incident.id !== current.incident.id
            && candidate.incident.scope === current.incident.scope
            && candidate.metrics.detection !== null
            && (referenceTime(candidate.metrics) ?? Number.POSITIVE_INFINITY) < reference)
        .sort((a, b) => (referenceTime(b.metrics) ?? 0) - (referenceTime(a.metrics) ?? 0))
        .slice(0, sampleSize)
        .map(candidate => candidate.metrics);

    return {
        sampleSize: sample.length,
        scope: current.incident.scope,
        medianDwellHours: median(sample.map(entry => entry.dwellHours)),
        medianTimeToDetectHours: median(sample.map(entry => entry.timeToDetectHours)),
        medianTimeToContainHours: median(sample.map(entry => entry.timeToContainHours)),
        medianTimeToRecoverHours: median(sample.map(entry => entry.timeToRecoverHours))
    };
}
