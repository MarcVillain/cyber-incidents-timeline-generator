import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog } from "../../src/core/catalog.js";
import { DOCUMENT_FORMAT, ImportMode, exportDocument, readDocument } from "../../src/core/document.js";
import { Involvement, LinkKind, NodeKind, Side, StepOutcome } from "../../src/core/enums.js";
import { ValidationError } from "../../src/core/errors.js";
import { TimelineService } from "../../src/core/service.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { seededService } from "../support/fixtures.js";

const MILESTONES = [{ key: "first_access", label: "First access" }];
const FIRST = "2026-01-12T08:00";

function service(): TimelineService {
    return new TimelineService(new MemoryTimelineStore(), { catalog: buildCatalog({ milestones: MILESTONES }) });
}

async function worked(): Promise<{ from: TimelineService; incidentId: number; document: unknown }> {
    const { service: from, incident } = await seededService();
    return { from, incidentId: incident.id, document: await from.exportDocument(incident.id) };
}

describe("a timeline as a document", () => {
    it("carries no database id and no incident id", async () => {
        const { document } = await worked();
        const text = JSON.stringify(document);
        assert.ok(!/"id":/.test(text), "the document carries an id");
        assert.ok(!/"incidentId":/.test(text), "the document carries an incident id");
        assert.equal((document as { format: string }).format, DOCUMENT_FORMAT);
    });

    it("names a record after what identifies it, so the same host is recognised elsewhere", async () => {
        const built = service();
        const incident = await built.createIncident({ title: "Incident" });
        await built.createNode(incident.id, { name: "WS-01", kind: NodeKind.Workstation, identifier: "ws-01.acme" });

        const document = await built.exportDocument(incident.id);
        assert.deepEqual(document.nodes.map(node => node.key), ["Workstation:ws-01.acme"]);
    });

    it("rebuilds the whole timeline somewhere else", async () => {
        const { from, incidentId, document } = await worked();
        const into = new TimelineService(new MemoryTimelineStore());
        const report = await into.importDocument(document);

        const before = await from.getSummary(incidentId);
        const after = await into.getSummary(report.incidentId);
        assert.equal(after.nodes.total, before.nodes.total);
        assert.equal(after.steps.total, before.steps.total);
        assert.equal(after.links.total, before.links.total);
        assert.equal(after.title, before.title);
    });

    it("keeps who did what to what, and what is grouped under what", async () => {
        const built = service();
        const incident = await built.createIncident({ title: "Incident" });
        const company = await built.createNode(incident.id, { name: "Acme", kind: NodeKind.Company });
        const clerk = await built.createNode(incident.id, { name: "Clerk", kind: NodeKind.Person, parentId: company.id });
        const host = await built.createNode(incident.id, { name: "WS-01", kind: NodeKind.Workstation });
        await built.createStep(incident.id, {
            title: "Opened the attachment", timestamp: FIRST, sourceNodeId: clerk.id, targetNodeId: host.id,
            outcome: StepOutcome.Succeeded, involvements: [{ nodeId: company.id, involvement: Involvement.Affected }]
        });
        await built.createLink(incident.id, { sourceNodeId: clerk.id, targetNodeId: host.id, kind: LinkKind.AccessGrantedTo });

        const into = new TimelineService(new MemoryTimelineStore());
        const report = await into.importDocument(await built.exportDocument(incident.id));
        const diagram = await into.getDiagram(report.incidentId);

        const rebuiltClerk = diagram.nodes.find(node => node.name === "Clerk");
        const rebuiltCompany = diagram.nodes.find(node => node.name === "Acme");
        const rebuiltHost = diagram.nodes.find(node => node.name === "WS-01");
        assert.equal(rebuiltClerk?.parentId, rebuiltCompany?.id);

        const step = diagram.steps[0];
        assert.equal(step?.sourceNodeId, rebuiltClerk?.id);
        assert.equal(step?.targetNodeId, rebuiltHost?.id);
        assert.deepEqual(step?.involvements, [{ nodeId: rebuiltCompany?.id, involvement: Involvement.Affected }]);
        assert.equal(diagram.links[0]?.sourceNodeId, rebuiltClerk?.id);
    });

    it("recognises a record it already holds when merging, and adds it twice when not", async () => {
        const { document } = await worked();
        const into = new TimelineService(new MemoryTimelineStore());
        const first = await into.importDocument(document);
        const merged = await into.importDocument(document, { into: first.incidentId, mode: ImportMode.Merge });
        assert.ok(merged.matched.nodes > 0);
        assert.equal(merged.created.nodes, 0);

        const added = await into.importDocument(document, { into: first.incidentId, mode: ImportMode.Add });
        assert.equal(added.matched.nodes, 0);
        assert.ok(added.created.nodes > 0);
    });

    it("moves every moment together when replayed on another date", async () => {
        const built = service();
        const incident = await built.createIncident({ title: "Exercise" });
        await built.createStep(incident.id, { title: "Started", timestamp: FIRST });
        await built.createStep(incident.id, { title: "Ended", timestamp: "2026-01-12T12:00" });

        const into = new TimelineService(new MemoryTimelineStore());
        const report = await into.importDocument(await built.exportDocument(incident.id), { shiftHours: 24 });
        const steps = (await into.getDiagram(report.incidentId)).steps;
        assert.deepEqual(steps.map(step => step.timestamp), ["2026-01-13T08:00:00", "2026-01-13T12:00:00"]);
    });

    it("refuses a milestone a step already holds rather than displacing it", async () => {
        const built = service();
        const incident = await built.createIncident({ title: "Incident" });
        await built.createStep(incident.id, { title: "Got in", timestamp: FIRST, milestoneKey: "first_access" });
        const document = await built.exportDocument(incident.id);

        const report = await built.importDocument(document, { into: incident.id });
        assert.deepEqual(report.milestonesTaken, ["first_access"]);
        const holders = (await built.getDiagram(incident.id)).steps.filter(step => step.milestoneKey === "first_access");
        assert.equal(holders.length, 1);
    });

    it("refuses a file that is not one of ours", () => {
        assert.throws(() => readDocument({ format: "something-else", version: 1, incident: { title: "x" } }), ValidationError);
        assert.throws(() => readDocument("not an object"), ValidationError);
    });

    it("refuses a document that names a record twice or points at one it does not carry", () => {
        const base = { format: DOCUMENT_FORMAT, version: 1, incident: { title: "Incident" }, steps: [], links: [], layouts: [] };
        assert.throws(() => readDocument({ ...base, nodes: [{ key: "a", name: "A", kind: NodeKind.Person }, { key: "a", name: "B", kind: NodeKind.Person }] }), ValidationError);
        assert.throws(() => readDocument({
            ...base,
            nodes: [{ key: "a", name: "A", kind: NodeKind.Person }],
            steps: [{ key: "s", title: "S", timestamp: FIRST, source: "missing" }]
        }), ValidationError);
    });

    it("writes nothing when the document turns out to be bad", async () => {
        const into = service();
        const before = (await into.listIncidents()).length;
        await assert.rejects(() => into.importDocument({ format: DOCUMENT_FORMAT, version: 1, incident: {} }));
        assert.equal((await into.listIncidents()).length, before);
    });

    it("exports what an empty incident holds, and imports it back", async () => {
        const built = service();
        const incident = await built.createIncident({ title: "Nothing happened", scope: "Acme" });
        const document = exportDocument(await built.getDiagram(incident.id));
        assert.deepEqual(document.nodes, []);

        const into = new TimelineService(new MemoryTimelineStore());
        const report = await into.importDocument(document);
        assert.equal((await into.getIncident(report.incidentId)).scope, "Acme");
    });

    it("keeps a pinned position", async () => {
        const { service: from, incident } = await seededService();
        const node = (await from.getDiagram(incident.id)).nodes[0];
        assert.ok(node);
        await from.saveLayout(incident.id, [{ nodeId: node.id, representation: "RelationshipGraph", x: 120, y: 240 }]);

        const into = new TimelineService(new MemoryTimelineStore());
        const report = await into.importDocument(await from.exportDocument(incident.id));
        const placements = (await into.getDiagram(report.incidentId)).nodes.flatMap(entry => entry.placements);
        assert.ok(placements.some(entry => entry.x === 120 && entry.y === 240), JSON.stringify(placements));
    });

    it("takes a title of the reader's choosing", async () => {
        const { document } = await worked();
        const into = new TimelineService(new MemoryTimelineStore());
        const report = await into.importDocument(document, { title: "Tabletop, March" });
        assert.equal((await into.getIncident(report.incidentId)).title, "Tabletop, March");
    });

    it("mentions a side, so a rebuilt timeline still reads the same", async () => {
        const built = service();
        const incident = await built.createIncident({ title: "Incident" });
        await built.createNode(incident.id, { name: "Crew", kind: NodeKind.ThreatActor, side: Side.Attacker });
        const into = new TimelineService(new MemoryTimelineStore());
        const report = await into.importDocument(await built.exportDocument(incident.id));
        assert.equal((await into.getDiagram(report.incidentId)).nodes[0]?.side, Side.Attacker);
    });
});
