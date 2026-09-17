import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Involvement, Side } from "../../src/core/enums.js";
import { ValidationError } from "../../src/core/errors.js";
import { FieldLimits, readLayouts, readNodeCreate, readNodeUpdate, readStepCreate } from "../../src/core/validation.js";

const TIMESTAMP = "2026-01-12T08:00";

function issuesOf(action: () => unknown): string[] {
    try {
        action();
    } catch (error) {
        if (error instanceof ValidationError) return error.issues.map(issue => issue.field);
        throw error;
    }
    assert.fail("expected a validation error");
}

describe("validation", () => {
    it("reports every problem of a payload at once", () => {
        const fields = issuesOf(() => readNodeCreate({ side: "Nowhere", compromised: "yes" }));
        assert.deepEqual(fields.sort(), ["compromised", "kind", "name", "side"]);
    });

    it("refuses something that is not an object", () => {
        assert.deepEqual(issuesOf(() => readNodeCreate("node")), ["body", "name", "kind"]);
    });

    it("fills defaults on create and trims text", () => {
        const node = readNodeCreate({ name: "  Clerk  ", kind: "Person" });
        assert.equal(node.name, "Clerk");
        assert.equal(node.side, Side.Unknown);
        assert.equal(node.parentId, null);
    });

    it("keeps only the fields sent on update, and a null clears", () => {
        assert.deepEqual(readNodeUpdate({ role: null }), { role: null });
        assert.deepEqual(readNodeUpdate({}), {});
    });

    it("enforces the length limits", () => {
        assert.deepEqual(issuesOf(() => readNodeUpdate({ name: "x".repeat(FieldLimits.NodeName + 1) })), ["name"]);
    });

    it("refuses a colour that is not a plain CSS colour", () => {
        assert.deepEqual(issuesOf(() => readNodeUpdate({ colorOverride: "red;background:url(x)" })), ["colorOverride"]);
        assert.deepEqual(readNodeUpdate({ colorOverride: "#aa0000" }), { colorOverride: "#aa0000" });
    });

    it("refuses a step ending before it started", () => {
        assert.deepEqual(issuesOf(() => readStepCreate({ title: "Step", timestamp: TIMESTAMP, endTimestamp: "2026-01-12T07:00" })), ["endTimestamp"]);
    });

    it("lists a record only once among the involvements", () => {
        const step = readStepCreate({
            title: "Step",
            timestamp: TIMESTAMP,
            involvements: [{ nodeId: 3 }, { nodeId: 3, involvement: "Target" }],
            tags: [" edr ", "edr", ""]
        });
        assert.deepEqual(step.involvements, [{ nodeId: 3, involvement: Involvement.Target }]);
        assert.deepEqual(step.tags, ["edr"]);
    });

    it("refuses a technique that is not an ATT&CK identifier", () => {
        assert.deepEqual(issuesOf(() => readStepCreate({ title: "Step", timestamp: TIMESTAMP, mitreTechniqueId: "phishing" })), ["mitreTechniqueId"]);
    });

    it("reads layouts and points at the broken entry", () => {
        assert.deepEqual(readLayouts([{ nodeId: 1, representation: "RelationshipGraph", x: 10, y: null }]), [{ nodeId: 1, representation: "RelationshipGraph", x: 10, y: null }]);
        assert.deepEqual(issuesOf(() => readLayouts([{ nodeId: 1, representation: "Nowhere", x: 1, y: 1 }])), ["layouts[0].representation", "layouts[0]."]);
        assert.deepEqual(issuesOf(() => readLayouts({})), ["layouts"]);
    });
});

describe("host metadata", () => {
    it("stores a bag of host values untouched", () => {
        const node = readNodeCreate({ name: "Clerk", kind: "Person", metadata: { crudyId: "a-b-c", depth: 2, tags: ["x"] } });
        assert.deepEqual(node.metadata, { crudyId: "a-b-c", depth: 2, tags: ["x"] });
    });

    it("defaults to nothing, and an empty bag is nothing", () => {
        assert.equal(readNodeCreate({ name: "Clerk", kind: "Person" }).metadata, null);
        assert.equal(readNodeCreate({ name: "Clerk", kind: "Person", metadata: {} }).metadata, null);
    });

    it("clears with a null and is left alone when not sent", () => {
        assert.deepEqual(readNodeUpdate({ metadata: null }), { metadata: null });
        assert.deepEqual(readNodeUpdate({}), {});
    });

    it("refuses anything that is not a plain object", () => {
        assert.deepEqual(issuesOf(() => readNodeCreate({ name: "A", kind: "Person", metadata: "x" })), ["metadata"]);
        assert.deepEqual(issuesOf(() => readNodeCreate({ name: "A", kind: "Person", metadata: [1, 2] })), ["metadata"]);
    });

    it("refuses a bag beyond the key and size limits", () => {
        const wide: Record<string, number> = {};
        for (let index = 0; index <= FieldLimits.MetadataKeys; index += 1) wide[`k${index}`] = index;
        assert.deepEqual(issuesOf(() => readNodeCreate({ name: "A", kind: "Person", metadata: wide })), ["metadata"]);

        const long = { note: "x".repeat(FieldLimits.MetadataLength) };
        assert.deepEqual(issuesOf(() => readNodeCreate({ name: "A", kind: "Person", metadata: long })), ["metadata"]);
    });

    it("carries on every record, and a step also takes an external id", () => {
        const step = readStepCreate({ title: "Opened", timestamp: TIMESTAMP, externalId: "ticket-8", metadata: { source: "SIEM" } });
        assert.equal(step.externalId, "ticket-8");
        assert.deepEqual(step.metadata, { source: "SIEM" });
    });
});
