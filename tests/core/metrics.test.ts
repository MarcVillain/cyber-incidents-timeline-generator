import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResponsePhase, Side, StepOutcome } from "../../src/core/enums.js";
import { buildBenchmark, buildMetrics, median, type MeasuredIncident } from "../../src/core/metrics.js";
import type { Incident, StepRecord } from "../../src/core/models.js";
import { detections, longestUnseen, responseEpisodes, responsePoints, type TimedStep } from "../../src/core/response.js";
import { formatWallClock, parseWallClock } from "../../src/core/time.js";
import { readIncidentCreate, readStepCreate } from "../../src/core/validation.js";

const SCOPE = "Scope";
const OTHER_SCOPE = "Other";
const MS_PER_HOUR = 3_600_000;

function incident(id: number, fields: Partial<Incident>): Incident {
    return { ...readIncidentCreate({ title: `Incident ${id}`, scope: SCOPE }), ...fields, id };
}

function step(id: number, timestamp: string, side: Side, extra: Partial<StepRecord> = {}): StepRecord {
    return { ...readStepCreate({ title: `Step ${id}`, timestamp }), side, ...extra, id, incidentId: 1 };
}

/**
 * An incident measured from an attack and, when given, a detection some hours later.
 */
function measured(id: number, attackedAt: string, detectAfterHours: number | null, scope = SCOPE): MeasuredIncident {
    const attack = step(id * 10, attackedAt, Side.Attacker);
    const steps = [attack];
    if (detectAfterHours !== null) {
        const detectedAt = new Date((parseWallClock(attackedAt)?.getTime() ?? 0) + detectAfterHours * MS_PER_HOUR);
        steps.push(step(id * 10 + 1, formatWallClock(detectedAt), Side.Defender, { responsePhase: ResponsePhase.Detect }));
    }
    return { incident: incident(id, { scope }), metrics: buildMetrics(steps) };
}

function timed(timestamp: string, side: Side, outcome = StepOutcome.Unknown, responsePhase = ResponsePhase.None): TimedStep {
    return { at: parseWallClock(timestamp), side, outcome, responsePhase };
}

describe("response metrics from the service", () => {
    it("reads every figure from the steps", () => {
        const metrics = buildMetrics([
            step(1, "2026-01-01T06:00", Side.Attacker),
            step(2, "2026-01-01T12:00", Side.Defender, { responsePhase: ResponsePhase.Detect }),
            step(3, "2026-01-02T00:00", Side.Defender, { responsePhase: ResponsePhase.Contain })
        ]);

        assert.equal(metrics.firstAttackerAction, "2026-01-01T06:00:00");
        assert.equal(metrics.detection, "2026-01-01T12:00:00");
        assert.equal(metrics.dwellHours, 6);
        assert.equal(metrics.timeToContainHours, 12);
        assert.equal(metrics.timeToRecoverHours, null);
    });

    it("takes the median of known values only", () => {
        assert.equal(median([3, null, 1, 2]), 2);
        assert.equal(median([4, 1, 2, 3]), 2.5);
        assert.equal(median([null]), null);
    });

    it("benchmarks against earlier incidents of the same scope with a detection", () => {
        const current = measured(10, "2026-06-01T00:00", null);
        const history = [
            measured(1, "2026-01-01T00:00", 10),
            measured(2, "2026-02-01T00:00", 20),
            measured(3, "2026-03-01T00:00", null),
            measured(4, "2026-04-01T00:00", 1, OTHER_SCOPE),
            measured(5, "2026-07-01T00:00", 1)
        ];

        const benchmark = buildBenchmark(current, [current, ...history]);
        assert.equal(benchmark.sampleSize, 2);
        assert.equal(benchmark.medianTimeToDetectHours, 15);
    });
});

describe("response analysis of the steps", () => {
    const steps: TimedStep[] = [
        timed("2026-01-01T00:00", Side.Attacker),
        timed("2026-01-02T00:00", Side.Defender, StepOutcome.Detected, ResponsePhase.Detect),
        timed("2026-01-02T06:00", Side.Defender, StepOutcome.Failed, ResponsePhase.Contain),
        timed("2026-02-01T00:00", Side.Attacker),
        timed("2026-02-10T00:00", Side.Defender, StepOutcome.Detected, ResponsePhase.Detect),
        timed("2026-02-10T12:00", Side.Defender, StepOutcome.Blocked, ResponsePhase.Contain)
    ];

    it("ignores a detection whose response failed", () => {
        assert.deepEqual(detections(steps).map(moment => moment.getMonth()), [1]);
    });

    it("measures the longest run the intruder had before a detection that held", () => {
        const unseen = longestUnseen(steps);
        assert.equal(unseen?.from.getMonth(), 0);
        assert.equal(unseen?.to.getDate(), 10);
    });

    it("splits the response into its episodes", () => {
        const episodes = responseEpisodes(steps);
        assert.equal(episodes.length, 2);
        assert.equal(episodes[0]?.failed, true);
        assert.equal(episodes[1]?.failed, false);
    });

    it("tells the first notice apart from the detection that held", () => {
        const points = responsePoints(steps);
        assert.equal(points.firstNoticed?.getMonth(), 0);
        assert.equal(points.detected?.getMonth(), 1);
        assert.equal(points.contained?.getDate(), 2);
    });
});
