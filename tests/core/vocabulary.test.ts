import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog, type SideInfo } from "../../src/core/catalog.js";
import { Audience, AttackTactic, ResponsePhase, ResponseStage, Side, SideRole } from "../../src/core/enums.js";
import { Icon } from "../../src/core/icon.js";
import { buildMetrics } from "../../src/core/metrics.js";
import type { StepRecord } from "../../src/core/models.js";
import { ThemeToken } from "../../src/core/theme-token.js";
import { ValidationError } from "../../src/core/errors.js";
import { ValidationRules, readStepCreate, readStepUpdate } from "../../src/core/validation.js";
import { Vocabulary } from "../../src/core/vocabulary.js";

const INSIDER = "insider";
const LEGAL = "legal";
const MISSING = "gone";
const TIMESTAMP = "2026-01-01T06:00";
const DETECTED = "2026-01-01T12:00";
const HOURS_TO_DETECT = 6;

const INSIDER_SIDE: SideInfo = {
    side: INSIDER, label: "Insider", icon: Icon.User, role: SideRole.Attacker, colorToken: ThemeToken.SideAttacker, surfaceToken: ThemeToken.SurfaceAttacker
};

function customCatalog() {
    const defaults = buildCatalog();
    return buildCatalog({
        vocabulary: {
            sides: [...defaults.sides, INSIDER_SIDE],
            audiences: [...defaults.audiences, { value: LEGAL, label: "Legal" }]
        }
    });
}

describe("vocabulary", () => {
    it("takes lists a deployment rewrote, entries added included", () => {
        const catalog = customCatalog();
        assert.ok(catalog.sides.some(entry => entry.side === INSIDER));
        assert.ok(catalog.audiences.some(entry => entry.value === LEGAL));
    });

    it("refuses a list that drops the entry records fall back to", () => {
        const defaults = buildCatalog();
        assert.throws(() => buildCatalog({ vocabulary: { sides: defaults.sides.filter(entry => entry.side !== Side.Unknown) } }), /must keep/);
    });

    it("refuses a tactic landing in a kill chain phase the catalog does not have", () => {
        const defaults = buildCatalog();
        const tactics = defaults.attackTactics.map(entry => ({ ...entry, killChainPhase: MISSING }));
        assert.throws(() => buildCatalog({ vocabulary: { attackTactics: tactics } }), /kill chain phase/);
    });

    it("keeps Both out of the audiences, since it stands for everyone", () => {
        assert.throws(() => buildCatalog({ vocabulary: { audiences: [{ value: Audience.Both, label: "Both" }] } }), /everyone/);
    });

    it("answers a key the catalog no longer has as unknown", () => {
        const vocabulary = new Vocabulary(buildCatalog());
        assert.equal(vocabulary.side(MISSING).label, MISSING);
        assert.equal(vocabulary.sideRole(MISSING), SideRole.Neutral);
        assert.equal(vocabulary.responseStage(MISSING), ResponseStage.None);
    });

    it("measures a side added to the catalog like the camp it belongs to", () => {
        const catalog = customCatalog();
        const rules = new ValidationRules(catalog);
        const step = (id: number, fields: object): StepRecord => ({ ...readStepCreate({ title: `Step ${id}`, ...fields }, rules), id, incidentId: 1 });
        const metrics = buildMetrics([
            step(1, { timestamp: TIMESTAMP, side: INSIDER }),
            step(2, { timestamp: DETECTED, side: Side.Defender, responsePhase: ResponsePhase.Detect })
        ], new Vocabulary(catalog));
        assert.equal(metrics.timeToDetectHours, HOURS_TO_DETECT);
    });
});

describe("validation against the vocabulary", () => {
    it("accepts the keys of the catalog and refuses the others", () => {
        const rules = new ValidationRules(customCatalog());
        assert.equal(readStepCreate({ title: "Step", timestamp: TIMESTAMP, side: INSIDER }, rules).side, INSIDER);
        assert.throws(() => readStepCreate({ title: "Step", timestamp: TIMESTAMP, side: MISSING }, rules), ValidationError);
        assert.throws(() => readStepCreate({ title: "Step", timestamp: TIMESTAMP, attackTactic: MISSING }, rules), ValidationError);
        assert.equal(readStepCreate({ title: "Step", timestamp: TIMESTAMP, attackTactic: AttackTactic.Execution }, rules).attackTactic, AttackTactic.Execution);
    });

    it("reads the audiences as a list, each once, empty for everyone", () => {
        const rules = new ValidationRules(customCatalog());
        assert.deepEqual(readStepCreate({ title: "Step", timestamp: TIMESTAMP }, rules).audiences, []);
        assert.deepEqual(readStepUpdate({ audiences: [LEGAL, Audience.Executive, LEGAL] }, rules).audiences, [LEGAL, Audience.Executive]);
        assert.throws(() => readStepUpdate({ audiences: [MISSING] }, rules), ValidationError);
    });

    it("still reads the single audience earlier clients send", () => {
        const rules = new ValidationRules(customCatalog());
        assert.deepEqual(readStepUpdate({ audience: Audience.Both }, rules).audiences, []);
        assert.deepEqual(readStepUpdate({ audience: Audience.Technical }, rules).audiences, [Audience.Technical]);
    });
});
