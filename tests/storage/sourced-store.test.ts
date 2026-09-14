import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NodeKind } from "../../src/core/enums.js";
import { ForbiddenError, NotFoundError } from "../../src/core/errors.js";
import { TimelineService } from "../../src/core/service.js";
import { readIncidentCreate } from "../../src/core/validation.js";
import { openSqliteStore } from "../../src/server/index.js";
import { IN_MEMORY_DATABASE } from "../../src/server/sql/sqlite-driver.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { SourcedTimelineStore } from "../../src/storage/sourced-store.js";
import { FakeTicketing, ReadOnlyTicketing } from "../support/fake-source.js";
import { runStoreContract } from "./store-contract.js";

const RENAMED = "Renamed in the ticketing tool";
const TIMESTAMP = "2026-01-12T08:00";

// Changes sent to an outside tool cannot be rolled back with the local records
const NOT_TRANSACTIONAL = { transactionalIncidents: false };

runStoreContract("SourcedTimelineStore over memory", async () => new SourcedTimelineStore(new FakeTicketing(), new MemoryTimelineStore()), NOT_TRANSACTIONAL);
runStoreContract("SourcedTimelineStore over SQLite", async () => new SourcedTimelineStore(new FakeTicketing(), (await openSqliteStore(IN_MEMORY_DATABASE)).store), NOT_TRANSACTIONAL);

describe("SourcedTimelineStore", () => {
    it("shows incidents created in the tool under ids that stay the same", async () => {
        const tool = new FakeTicketing();
        const service = new TimelineService(new SourcedTimelineStore(tool, new MemoryTimelineStore()));
        const ticket = tool.add(readIncidentCreate({ title: "Opened in the ticketing tool" }));

        const [first] = await service.listIncidents();
        assert.ok(first);
        assert.equal(first.externalId, ticket.externalId);

        tool.tickets.set(ticket.externalId, { ...ticket, title: RENAMED });
        const [again] = await service.listIncidents();
        assert.equal(again?.id, first.id);
        assert.equal((await service.getIncident(first.id)).title, RENAMED);
    });

    it("keeps the timeline locally and sends incident changes to the tool", async () => {
        const tool = new FakeTicketing();
        const service = new TimelineService(new SourcedTimelineStore(tool, new MemoryTimelineStore()));
        const incident = await service.createIncident({ title: "Created from the timeline" });
        assert.ok(incident.externalId && tool.tickets.has(incident.externalId));

        await service.createNode(incident.id, { name: "Laptop", kind: NodeKind.Workstation });
        await service.createStep(incident.id, { title: "Malware detected", timestamp: TIMESTAMP });
        await service.updateIncident(incident.id, { title: RENAMED });
        assert.equal(tool.tickets.get(incident.externalId)?.title, RENAMED);

        const diagram = await service.getDiagram(incident.id);
        assert.equal(diagram.nodes.length, 1);
        assert.equal(diagram.incident.title, RENAMED);

        await service.deleteIncident(incident.id);
        assert.equal(tool.tickets.size, 0);
    });

    it("refuses what a read only tool does not allow, and still records timelines for its incidents", async () => {
        const tool = new ReadOnlyTicketing();
        const service = new TimelineService(new SourcedTimelineStore(tool, new MemoryTimelineStore()));
        tool.backing.add(readIncidentCreate({ title: "Owned elsewhere" }));
        const [incident] = await service.listIncidents();
        assert.ok(incident);

        await assert.rejects(service.createIncident({ title: "Not allowed" }), ForbiddenError);
        await assert.rejects(service.updateIncident(incident.id, { title: "Not allowed" }), ForbiddenError);
        await assert.rejects(service.deleteIncident(incident.id), ForbiddenError);
        assert.ok((await service.createStep(incident.id, { title: "Still recorded", timestamp: TIMESTAMP })).id > 0);
    });

    it("stops serving an incident the tool no longer has", async () => {
        const tool = new FakeTicketing();
        const service = new TimelineService(new SourcedTimelineStore(tool, new MemoryTimelineStore()));
        const incident = await service.createIncident({ title: "Closed and purged" });
        tool.tickets.clear();

        await assert.rejects(service.getDiagram(incident.id), NotFoundError);
        assert.deepEqual(await service.listIncidents(), []);
    });
});
