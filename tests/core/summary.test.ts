import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog, killChainPhaseOf } from "../../src/core/catalog.js";
import { AttackTactic, KillChainPhase, NodeKind, Side, StepOutcome } from "../../src/core/enums.js";
import { TimelineService } from "../../src/core/service.js";
import { summarise } from "../../src/core/summary.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { seededService } from "../support/fixtures.js";

const MILESTONES = [{ key: "first_access", label: "First access" }, { key: "containment", label: "Containment" }];
const FIRST = "2026-01-12T08:00";
const LATER = "2026-01-14T17:30";

describe("summary", () => {
    it("counts what the incident holds", async () => {
        const { service, incident } = await seededService();
        const summary = await service.getSummary(incident.id);

        const diagram = await service.getDiagram(incident.id);
        assert.equal(summary.incidentId, incident.id);
        assert.equal(summary.title, incident.title);
        assert.equal(summary.nodes.total, diagram.nodes.length);
        assert.equal(summary.steps.total, diagram.steps.length);
        assert.equal(summary.links.total, diagram.links.length);
        assert.equal(summary.nodes.compromised, diagram.nodes.filter(node => node.compromised).length);
        assert.equal(summary.steps.milestones, diagram.steps.filter(step => step.isMilestone).length);
    });

    it("tallies only the values that occur", async () => {
        const { service, incident } = await seededService();
        const summary = await service.getSummary(incident.id);

        assert.ok((summary.steps.bySide[Side.Attacker] ?? 0) > 0);
        assert.equal(Object.values(summary.steps.byOutcome).every(count => count > 0), true);
        assert.ok(summary.steps.techniques.length > 0);
        assert.ok(summary.steps.evidenceSources.length > 0);
    });

    it("derives the kill chain phase the same way the board does", async () => {
        const { service, incident } = await seededService();
        const summary = await service.getSummary(incident.id);
        const diagram = await service.getDiagram(incident.id);

        const expected = diagram.steps.filter(step => killChainPhaseOf(step.attackTactic) === KillChainPhase.Delivery).length;
        assert.equal(summary.steps.byKillChainPhase[KillChainPhase.Delivery] ?? 0, expected);
        assert.ok((summary.steps.byTactic[AttackTactic.InitialAccess] ?? 0) > 0);
    });

    it("reports the span from the records", async () => {
        const service = new TimelineService(new MemoryTimelineStore());
        const incident = await service.createIncident({ title: "Incident" });
        await service.createStep(incident.id, { title: "First", timestamp: FIRST });
        await service.createStep(incident.id, { title: "Last", timestamp: LATER });

        const summary = await service.getSummary(incident.id);
        assert.equal(summary.span.start, `${FIRST}:00`);
        assert.equal(summary.span.end, `${LATER}:00`);
        assert.ok(summary.span.hours && summary.span.hours > 24);
    });

    it("names the milestones held and the ones still missing", async () => {
        const service = new TimelineService(new MemoryTimelineStore(), { catalog: buildCatalog({ milestones: MILESTONES }) });
        const incident = await service.createIncident({ title: "Incident" });
        const step = await service.createStep(incident.id, { title: "Got in", timestamp: FIRST, milestoneKey: "first_access" });

        const summary = await service.getSummary(incident.id);
        assert.deepEqual(summary.milestones, [{ key: "first_access", stepId: step.id, timestamp: `${FIRST}:00`, timeKnown: true }]);
        assert.deepEqual(summary.missingMilestones, ["containment"]);
    });

    it("counts an incident with nothing in it", async () => {
        const service = new TimelineService(new MemoryTimelineStore());
        const incident = await service.createIncident({ title: "Empty" });
        const summary = summarise(await service.getDiagram(incident.id));

        assert.equal(summary.nodes.total, 0);
        assert.equal(summary.steps.total, 0);
        assert.equal(summary.span.start, null);
        assert.equal(summary.span.hours, null);
        assert.deepEqual(summary.steps.techniques, []);
    });

    it("counts the whole incident, not the filtered view", async () => {
        const service = new TimelineService(new MemoryTimelineStore());
        const incident = await service.createIncident({ title: "Incident" });
        await service.createNode(incident.id, { name: "Clerk", kind: NodeKind.Person, side: Side.Victim });
        await service.createStep(incident.id, { title: "Blocked", timestamp: FIRST, outcome: StepOutcome.Blocked });

        const summary = await service.getSummary(incident.id);
        assert.equal(summary.nodes.byKind[NodeKind.Person], 1);
        assert.equal(summary.steps.byOutcome[StepOutcome.Blocked], 1);
    });
});
