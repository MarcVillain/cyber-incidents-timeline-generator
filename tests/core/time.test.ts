import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDuration, hoursBetween, joinWallClock, momentBetween, normalizeWallClock, parseWallClock, splitWallClock } from "../../src/core/time.js";

const MOMENT = "2026-03-05T09:30:00";

describe("wall clock times", () => {
    it("drops a zone suffix instead of applying it", () => {
        assert.equal(normalizeWallClock("2026-03-05T09:30:00Z"), MOMENT);
        assert.equal(normalizeWallClock("2026-03-05T09:30:00+02:00"), MOMENT);
    });

    it("fills a missing time and missing seconds", () => {
        assert.equal(normalizeWallClock("2026-03-05"), "2026-03-05T00:00:00");
        assert.equal(normalizeWallClock("2026-03-05T09:30"), MOMENT);
    });

    it("refuses dates that do not exist", () => {
        assert.equal(normalizeWallClock("2026-02-30T10:00"), null);
        assert.equal(normalizeWallClock("yesterday"), null);
    });

    it("keeps the clock reading whatever the zone of the machine", () => {
        const parsed = parseWallClock(`${MOMENT}Z`);
        assert.equal(parsed?.getHours(), 9);
        assert.equal(parsed?.getMinutes(), 30);
    });

    it("splits and joins a moment, leaving the time out when it is not known", () => {
        const date = parseWallClock(MOMENT);
        assert.deepEqual(splitWallClock(date, false), { date: "2026-03-05", time: null });
        assert.equal(joinWallClock("2026-03-05", "09:30"), MOMENT);
        assert.equal(joinWallClock("2026-03-05", null), "2026-03-05T00:00:00");
    });

    it("measures hours and refuses negative spans", () => {
        const from = parseWallClock("2026-03-05T08:00");
        const to = parseWallClock("2026-03-05T11:30");
        assert.equal(hoursBetween(from, to), 3.5);
        assert.equal(hoursBetween(to, from), null);
    });

    it("finds the whole minute halfway between two moments, never before the first", () => {
        const from = new Date(2026, 2, 5, 9, 30);
        assert.deepEqual(momentBetween(from, new Date(2026, 2, 5, 9, 45)), new Date(2026, 2, 5, 9, 37));
        assert.deepEqual(momentBetween(from, from), from);

        const late = new Date(2026, 2, 5, 9, 30, 40);
        assert.deepEqual(momentBetween(late, new Date(2026, 2, 5, 9, 31)), late);
    });

    it("formats durations at a readable unit", () => {
        assert.equal(formatDuration(0.5), "30min");
        assert.equal(formatDuration(5), "5h");
        assert.equal(formatDuration(72), "3d");
        assert.equal(formatDuration(null), null);
    });
});
