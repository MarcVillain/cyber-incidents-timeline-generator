import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AttackTactic, DiamondVertex, Involvement, KillChainPhase, LinkKind, NodeCategory, NodeKind, Representation, Side } from "../../src/core/enums.js";
import { NotFoundError, ValidationError } from "../../src/core/errors.js";
import { TimelineService } from "../../src/core/service.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { CUSTOM_SCALE, createIncident, createService, person, seededService } from "../support/fixtures.js";

const LATER = "2026-01-12T10:00";
const EARLIER = "2026-01-12T09:00";
const MISSING_ID = 9999;

describe("TimelineService", () => {
    it("lists, reads, updates and deletes incidents", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        await service.updateIncident(incident.id, { referenceId: "INC-1", classifications: ["Phishing"] });

        const read = await service.getIncident(incident.id);
        assert.equal(read.referenceId, "INC-1");
        assert.deepEqual(read.classifications, ["Phishing"]);
        assert.equal((await service.listIncidents()).length, 1);

        await service.deleteIncident(incident.id);
        await assert.rejects(service.getIncident(incident.id), NotFoundError);
    });

    it("refuses an incident without a title", async () => {
        const { service } = createService();
        await assert.rejects(service.createIncident({ title: "" }), ValidationError);
    });

    it("derives what the diagram carries about a record", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const actor = await service.createNode(incident.id, { name: "Actor", kind: NodeKind.Person, side: Side.Attacker, identifier: "APT-X" });

        assert.equal(actor.category, NodeCategory.Actor);
        assert.equal(actor.diamondVertex, DiamondVertex.Adversary);
        assert.equal(await service.getCatalog().then(catalog => catalog.nodeKinds.length > 0), true);
    });

    it("keeps a group inside the same incident and refuses cycles", async () => {
        const { service } = createService();
        const first = await createIncident(service, "First");
        const second = await createIncident(service, "Second");
        const foreign = await service.createNode(second.id, person("Elsewhere"));

        await assert.rejects(service.createNode(first.id, person("Member", { parentId: foreign.id })), ValidationError);

        const company = await service.createNode(first.id, { name: "Company", kind: NodeKind.Company });
        const team = await service.createNode(first.id, { name: "Team", kind: NodeKind.Team, parentId: company.id });
        await assert.rejects(service.updateNode(first.id, company.id, { parentId: team.id }), ValidationError);
        await assert.rejects(service.updateNode(first.id, company.id, { parentId: company.id }), ValidationError);
    });

    it("never reaches a record through another incident", async () => {
        const { service } = createService();
        const first = await createIncident(service, "First");
        const second = await createIncident(service, "Second");
        const node = await service.createNode(first.id, person("Clerk"));

        await assert.rejects(service.updateNode(second.id, node.id, { name: "Stolen" }), NotFoundError);
        await assert.rejects(service.deleteNode(second.id, node.id), NotFoundError);
        await assert.rejects(service.createStep(second.id, { title: "Step", timestamp: LATER, sourceNodeId: node.id }), ValidationError);
        await assert.rejects(service.getDiagram(MISSING_ID), NotFoundError);
    });

    it("removes a record with its members, its links and every mention of it", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const company = await service.createNode(incident.id, { name: "Company", kind: NodeKind.Company });
        const member = await service.createNode(incident.id, person("Member", { parentId: company.id }));
        const outsider = await service.createNode(incident.id, person("Outsider"));
        const step = await service.createStep(incident.id, {
            title: "Step", timestamp: LATER, sourceNodeId: member.id, targetNodeId: outsider.id,
            involvements: [{ nodeId: company.id, involvement: Involvement.Affected }]
        });
        await service.createLink(incident.id, { sourceNodeId: member.id, targetNodeId: outsider.id, kind: LinkKind.Owns });

        await service.deleteNode(incident.id, company.id);

        const diagram = await service.getDiagram(incident.id);
        assert.deepEqual(diagram.nodes.map(node => node.name), ["Outsider"]);
        assert.equal(diagram.links.length, 0);
        const kept = diagram.steps.find(entry => entry.id === step.id);
        assert.equal(kept?.sourceNodeId, null);
        assert.equal(kept?.targetNodeId, outsider.id);
        assert.deepEqual(kept?.involvements, []);
    });

    it("removes the relationships a step established along with it", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const a = await service.createNode(incident.id, person("A"));
        const b = await service.createNode(incident.id, person("B"));
        const step = await service.createStep(incident.id, { title: "Step", timestamp: LATER });
        await service.createLink(incident.id, { sourceNodeId: a.id, targetNodeId: b.id, stepId: step.id });

        await service.deleteStep(incident.id, step.id);
        assert.equal((await service.getDiagram(incident.id)).links.length, 0);
    });

    it("checks the times of a step on the merged record", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const step = await service.createStep(incident.id, { title: "Step", timestamp: LATER });
        await assert.rejects(service.updateStep(incident.id, step.id, { endTimestamp: EARLIER }), ValidationError);
    });

    it("keeps the kill chain phase in step with the tactic and orders steps in time", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        await service.createStep(incident.id, { title: "Later", timestamp: LATER, attackTactic: AttackTactic.Exfiltration });
        await service.createStep(incident.id, { title: "Earlier", timestamp: EARLIER, attackTactic: AttackTactic.InitialAccess });

        const diagram = await service.getDiagram(incident.id);
        assert.deepEqual(diagram.steps.map(step => step.title), ["Earlier", "Later"]);
        assert.equal(diagram.steps[0]?.killChainPhase, KillChainPhase.Delivery);
    });

    it("pins and releases a record in one representation", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const node = await service.createNode(incident.id, person("Pinned"));

        await service.saveLayout(incident.id, [{ nodeId: node.id, representation: Representation.RelationshipGraph, x: 12, y: 34 }]);
        assert.deepEqual((await service.getDiagram(incident.id)).nodes[0]?.placements, [{ representation: Representation.RelationshipGraph, x: 12, y: 34 }]);

        await service.saveLayout(incident.id, [{ nodeId: node.id, representation: Representation.RelationshipGraph, x: null, y: null }]);
        assert.deepEqual((await service.getDiagram(incident.id)).nodes[0]?.placements, []);
        await assert.rejects(service.saveLayout(incident.id, [{ nodeId: MISSING_ID, representation: Representation.RelationshipGraph, x: 1, y: 1 }]), ValidationError);
    });

    it("maintains the canonical key of a record", async () => {
        const { service, store } = createService();
        const incident = await createIncident(service);
        const node = await service.createNode(incident.id, { name: "Server", kind: NodeKind.Server, identifier: "FS01" });
        await service.updateNode(incident.id, node.id, { identifier: "FS02" });
        assert.equal((await store.findNode(node.id))?.canonicalKey, "Server:fs02");
    });

    it("rates incidents, records and steps on the impact scale it was configured with", async () => {
        const service = new TimelineService(new MemoryTimelineStore(), { impactScale: CUSTOM_SCALE });
        const incident = await service.createIncident({ title: "Rated", impact: "P1" });
        assert.equal(incident.impact, "P1");
        assert.equal((await service.createIncident({ title: "Unrated" })).impact, CUSTOM_SCALE.unassessed.level);

        await assert.rejects(service.createIncident({ title: "Default key", impact: "High" }), ValidationError);
        await assert.rejects(service.createStep(incident.id, { title: "Step", timestamp: LATER, severity: "Critical" }), ValidationError);
        const node = await service.createNode(incident.id, person("Server", { criticality: "P2" }));
        assert.equal((await service.getDiagram(incident.id)).nodes.find(entry => entry.id === node.id)?.criticality, "P2");
        assert.deepEqual((await service.getCatalog()).impactScale, CUSTOM_SCALE);
    });

    it("serves the sample incident with metrics and a benchmark", async () => {
        const { service, incident } = await seededService();
        const diagram = await service.getDiagram(incident.id);

        assert.ok(diagram.nodes.length > 5);
        assert.ok(diagram.steps.length > 10);
        assert.equal(diagram.metrics.dwellHours, 9);
        assert.equal(diagram.benchmark.sampleSize, 4);
        assert.equal(diagram.benchmark.scope, incident.scope);
    });
});
