import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { AttackTactic, Audience, DiamondVertex, KillChainPhase, RecordType, Representation, Side } from "../../src/core/enums.js";
import type { Diagram } from "../../src/core/models.js";
import { DiagramStore, StoreChange } from "../../src/ui/diagram-store.js";
import { History } from "../../src/ui/history.js";
import { seededService } from "../support/fixtures.js";

const MISSING_ID = 9999;
const FIRST_TAG = "credential access";
const SECOND_TAG = "ransomware";

describe("DiagramStore", () => {
    let sample: Diagram;

    before(async () => {
        const seeded = await seededService();
        sample = await seeded.service.getDiagram(seeded.incident.id);
    });

    function loaded(): DiagramStore {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        return store;
    }

    it("filters steps by audience and milestone, and keeps the groups of the records they touch", () => {
        const store = loaded();
        const all = store.visibleSteps().length;

        store.setFilters({ milestonesOnly: true });
        assert.ok(store.visibleSteps().length < all);
        assert.ok(store.visibleSteps().every(step => step.isMilestone));

        const kept = new Set(store.visibleNodes().map(node => node.id));
        store.visibleNodes().forEach(node => {
            if (node.parentId !== null) assert.ok(kept.has(node.parentId));
        });

        store.setFilters({ milestonesOnly: false, audience: Audience.Technical });
        assert.ok(store.visibleSteps().every(step => step.audience !== Audience.Executive));
    });

    it("gathers the tags of the timeline once each, in order", () => {
        const store = loaded();
        const [first, second] = store.steps;
        assert.ok(first && second);
        store.patchStep(first.id, { tags: [SECOND_TAG, FIRST_TAG] });
        store.patchStep(second.id, { tags: [FIRST_TAG] });

        assert.deepEqual(store.tags, [FIRST_TAG, SECOND_TAG]);
    });

    it("applies a patch in place, recomputes what depends on it and returns what it replaced", () => {
        const store = loaded();
        const changes: StoreChange[] = [];
        store.subscribe(change => changes.push(change));

        const step = store.steps[0];
        const node = store.nodes.find(candidate => candidate.side === Side.Victim);
        assert.ok(step && node);

        const previous = store.patchStep(step.id, { attackTactic: AttackTactic.Exfiltration, timestamp: "2030-01-01T00:00:00" });
        assert.deepEqual(Object.keys(previous ?? {}).sort(), ["attackTactic", "timestamp"]);
        assert.equal(store.step(step.id)?.killChainPhase, KillChainPhase.ActionsOnObjectives);
        assert.equal(store.steps.at(-1)?.id, step.id);

        store.patchNode(node.id, { side: Side.Attacker });
        assert.notEqual(store.node(node.id)?.diamondVertex, DiamondVertex.Victim);
        assert.deepEqual(changes, [StoreChange.Records, StoreChange.Records]);
        assert.equal(store.patchLink(MISSING_ID, { label: "x" }), null);
    });

    it("selects records and pins placements", () => {
        const store = loaded();
        const node = store.nodes[0];
        assert.ok(node);
        store.setSelection({ type: RecordType.Node, id: node.id });
        assert.deepEqual(store.selection, { type: RecordType.Node, id: node.id });

        store.setPlacement(node.id, Representation.RelationshipGraph, { x: 5, y: 6 });
        assert.deepEqual(store.placement(node, Representation.RelationshipGraph), { x: 5, y: 6 });
        store.setPlacement(node.id, Representation.RelationshipGraph, null);
        assert.equal(store.placement(node, Representation.RelationshipGraph), null);
    });
});

describe("History", () => {
    it("undoes and redoes in order and follows renamed records", async () => {
        const applied: string[] = [];
        const history = new History();
        history.push({ label: "first", undo: () => { applied.push("undo first"); }, redo: () => { applied.push("redo first"); } });
        history.push({ label: "second", undo: () => { applied.push("undo second"); }, redo: () => { applied.push("redo second"); } });

        assert.equal(await history.undo(), "second");
        assert.equal(await history.undo(), "first");
        assert.equal(await history.undo(), null);
        assert.equal(await history.redo(), "first");
        assert.deepEqual(applied, ["undo second", "undo first", "redo first"]);

        history.rename(RecordType.Node, 1, 5);
        history.rename(RecordType.Node, 5, 9);
        assert.equal(history.resolve(RecordType.Node, 1), 9);
        assert.equal(history.resolve(RecordType.Step, 1), 1);
    });

    it("drops an entry that fails to replay", async () => {
        const history = new History();
        history.push({ label: "broken", undo: () => { throw new Error("gone"); }, redo: () => undefined });
        await assert.rejects(history.undo(), /gone/);
        assert.equal(history.canUndo, false);
        assert.equal(history.canRedo, false);
    });
});
