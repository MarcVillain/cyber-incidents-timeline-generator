import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Audience, NodeKind } from "../../src/core/enums.js";
import type { Diagram } from "../../src/core/models.js";
import { seedSampleData } from "../../src/core/sample.js";
import { TimelineService } from "../../src/core/service.js";
import { readIncidentCreate } from "../../src/core/validation.js";
import { openSqliteStore } from "../../src/server/index.js";
import { TableNames, upgradeSqliteSchema } from "../../src/server/sql/schema.js";
import { RowReader } from "../../src/server/sql/driver.js";
import { IN_MEMORY_DATABASE } from "../../src/server/sql/sqlite-driver.js";
import { BrowserStorageTimelineStore, type KeyValueStorage } from "../../src/storage/browser-storage-store.js";
import { MemoryTimelineStore, type StoreSnapshot } from "../../src/storage/memory-store.js";
import { SAMPLE_START } from "../support/fixtures.js";
import { runStoreContract } from "./store-contract.js";
import { runCatalogStoreContract } from "./catalog-store-contract.js";
import { BrowserStorageCatalogStore, MemoryCatalogStore } from "../../src/storage/catalog-stores.js";

const STORAGE_KEY = "test-timeline";
const CONCURRENT_WRITES = 20;
const SAMPLE_TIMESTAMP = "2026-01-12T08:00";
const SINGLE_AUDIENCE_VERSION = 1;
const SINGLE_END_VERSION = 2;
const EXACT_TIME_VERSION = 3;
const TIME_LABEL = "Following initial access";

function isStoredSnapshot(value: unknown): value is StoreSnapshot {
    return typeof value === "object" && value !== null && "steps" in value && Array.isArray(value.steps);
}

class MapStorage implements KeyValueStorage {
    readonly entries = new Map<string, string>();

    getItem(key: string): string | null {
        return this.entries.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.entries.set(key, value);
    }
}

runStoreContract("MemoryTimelineStore", async () => new MemoryTimelineStore());
runStoreContract("BrowserStorageTimelineStore", async () => new BrowserStorageTimelineStore(new MapStorage(), STORAGE_KEY));
runStoreContract("SqlTimelineStore on SQLite", async () => (await openSqliteStore(IN_MEMORY_DATABASE)).store);
runStoreContract("SqlTimelineStore with a table prefix", async () => (await openSqliteStore(IN_MEMORY_DATABASE, { tablePrefix: "host_tlg_" })).store);

runCatalogStoreContract("MemoryCatalogStore", async () => new MemoryCatalogStore());
runCatalogStoreContract("BrowserStorageCatalogStore", async () => new BrowserStorageCatalogStore(new MapStorage(), STORAGE_KEY));
runCatalogStoreContract("SqlCatalogStore on SQLite", async () => (await openSqliteStore(IN_MEMORY_DATABASE)).catalogStore);
runCatalogStoreContract("SqlCatalogStore with a table prefix", async () => (await openSqliteStore(IN_MEMORY_DATABASE, { tablePrefix: "host_tlg_" })).catalogStore);

describe("BrowserStorageTimelineStore", () => {
    it("survives a reload of the page", async () => {
        const storage = new MapStorage();
        const incident = await seedSampleData(new TimelineService(new BrowserStorageTimelineStore(storage, STORAGE_KEY)), SAMPLE_START);

        const reopened = new TimelineService(new BrowserStorageTimelineStore(storage, STORAGE_KEY));
        const diagram = await reopened.getDiagram(incident.id);
        assert.ok(diagram.steps.length > 0);
    });

    it("leaves storage untouched by a failed transaction", async () => {
        const storage = new MapStorage();
        const store = new BrowserStorageTimelineStore(storage, STORAGE_KEY);
        await assert.rejects(store.transaction(async () => {
            await store.insertIncident(readIncidentCreate({ title: "Scratch" }));
            throw new Error("abort");
        }));
        assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").incidents, []);
    });

    it("upgrades a snapshot holding one audience per step", async () => {
        const storage = new MapStorage();
        const service = new TimelineService(new BrowserStorageTimelineStore(storage, STORAGE_KEY));
        const incident = await service.createIncident({ title: "Earlier" });
        await service.createStep(incident.id, { title: "For everyone", timestamp: SAMPLE_TIMESTAMP });
        await service.createStep(incident.id, { title: "For executives", timestamp: SAMPLE_TIMESTAMP, audiences: [Audience.Executive] });

        const stored: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
        assert.ok(isStoredSnapshot(stored));
        const earlier = { ...stored, version: SINGLE_AUDIENCE_VERSION, steps: stored.steps.map(({ audiences, ...rest }) => ({ ...rest, audience: audiences[0] ?? Audience.Both })) };
        storage.setItem(STORAGE_KEY, JSON.stringify(earlier));

        const reloaded = new TimelineService(new BrowserStorageTimelineStore(storage, STORAGE_KEY));
        const steps = (await reloaded.getDiagram(incident.id)).steps;
        assert.deepEqual(steps.map(step => step.audiences), [[], [Audience.Executive]]);
    });

    it("upgrades a snapshot holding one source and one target per link", async () => {
        const storage = new MapStorage();
        const service = new TimelineService(new BrowserStorageTimelineStore(storage, STORAGE_KEY));
        const incident = await service.createIncident({ title: "Earlier" });
        const clerk = await service.createNode(incident.id, { name: "Clerk", kind: NodeKind.Person });
        const host = await service.createNode(incident.id, { name: "Host", kind: NodeKind.Workstation });
        await service.createLink(incident.id, { sourceNodeIds: [clerk.id], targetNodeIds: [host.id] });

        const stored: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
        assert.ok(isStoredSnapshot(stored));
        const earlier = {
            ...stored,
            version: SINGLE_END_VERSION,
            links: stored.links.map(({ sourceNodeIds, targetNodeIds, ...rest }) => ({ ...rest, sourceNodeId: sourceNodeIds[0], targetNodeId: targetNodeIds[0] }))
        };
        storage.setItem(STORAGE_KEY, JSON.stringify(earlier));

        const reloaded = new TimelineService(new BrowserStorageTimelineStore(storage, STORAGE_KEY));
        assert.deepEqual((await reloaded.getDiagram(incident.id)).links.map(link => [link.sourceNodeIds, link.targetNodeIds]), [[[clerk.id], [host.id]]]);
    });

    it("upgrades a snapshot holding no approximate flag nor time label", async () => {
        const storage = new MapStorage();
        const service = new TimelineService(new BrowserStorageTimelineStore(storage, STORAGE_KEY));
        const incident = await service.createIncident({ title: "Earlier" });
        await service.createStep(incident.id, { title: "Step", timestamp: SAMPLE_TIMESTAMP });

        const stored: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
        assert.ok(isStoredSnapshot(stored));
        const earlier = {
            ...stored,
            version: EXACT_TIME_VERSION,
            steps: stored.steps.map(({ timeApproximate, timeLabel, ...rest }) => rest)
        };
        storage.setItem(STORAGE_KEY, JSON.stringify(earlier));

        const reloaded = new TimelineService(new BrowserStorageTimelineStore(storage, STORAGE_KEY));
        const [step] = (await reloaded.getDiagram(incident.id)).steps;
        assert.equal(step?.timeApproximate, false);
        assert.equal(step?.timeLabel, null);
    });

    it("refuses data that is not a snapshot", () => {
        const storage = new MapStorage();
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
        assert.throws(() => new BrowserStorageTimelineStore(storage, STORAGE_KEY));
    });
});

describe("SqlTimelineStore", () => {
    it("refuses a table prefix that is not a plain identifier", async () => {
        await assert.rejects(openSqliteStore(IN_MEMORY_DATABASE, { tablePrefix: "x; DROP TABLE y" }));
    });

    it("serves the same diagram as the memory store", async () => {
        const memory = new TimelineService(new MemoryTimelineStore());
        const sqlite = new TimelineService((await openSqliteStore(IN_MEMORY_DATABASE)).store);
        const fromMemory = await seedSampleData(memory, SAMPLE_START);
        const fromSqlite = await seedSampleData(sqlite, SAMPLE_START);

        // Identifiers differ, since SQLite counts per table, so the diagrams are compared by content
        const shape = (diagram: Diagram): unknown => ({
            nodes: diagram.nodes.map(node => [node.name, node.kind, node.side, node.diamondVertex, node.compromised]),
            steps: diagram.steps.map(step => [step.title, step.timestamp, step.killChainPhase, step.tags, step.involvements.length]),
            links: diagram.links.map(link => [link.kind, link.confidence, link.label]),
            metrics: diagram.metrics,
            benchmark: diagram.benchmark
        });
        assert.deepEqual(shape(await sqlite.getDiagram(fromSqlite.id)), shape(await memory.getDiagram(fromMemory.id)));
    });

    it("reads the single audience a database written by an earlier release holds", async () => {
        const { driver, store } = await openSqliteStore(IN_MEMORY_DATABASE);
        const service = new TimelineService(store);
        const incident = await service.createIncident({ title: "Earlier" });
        const everyone = await service.createStep(incident.id, { title: "For everyone", timestamp: SAMPLE_TIMESTAMP });
        const technical = await service.createStep(incident.id, { title: "For engineers", timestamp: SAMPLE_TIMESTAMP });
        await driver.execute(`UPDATE ${store.tables.steps} SET audience = ? WHERE id = ?`, [Audience.Both, everyone.id]);
        await driver.execute(`UPDATE ${store.tables.steps} SET audience = ? WHERE id = ?`, [Audience.Technical, technical.id]);

        assert.deepEqual((await store.findStep(everyone.id))?.audiences, []);
        assert.deepEqual((await store.findStep(technical.id))?.audiences, [Audience.Technical]);
    });

    it("adds the time columns to a database written by an earlier release", async () => {
        const { driver, store } = await openSqliteStore(IN_MEMORY_DATABASE);
        await driver.execute(`ALTER TABLE ${store.tables.steps} DROP COLUMN time_approximate`);
        await driver.execute(`ALTER TABLE ${store.tables.steps} DROP COLUMN time_label`);
        await upgradeSqliteSchema(driver, store.tables);
        await upgradeSqliteSchema(driver, store.tables);

        const service = new TimelineService(store);
        const incident = await service.createIncident({ title: "Earlier" });
        const step = await service.createStep(incident.id, { title: "Step", timestamp: SAMPLE_TIMESTAMP, timeApproximate: true, timeLabel: TIME_LABEL });
        assert.equal((await store.findStep(step.id))?.timeLabel, TIME_LABEL);
    });

    it("keeps concurrent writes apart", async () => {
        const service = new TimelineService((await openSqliteStore(IN_MEMORY_DATABASE)).store);
        const incident = await service.createIncident({ title: "Busy" });
        await Promise.all(Array.from({ length: CONCURRENT_WRITES }, (_, index) => service.createNode(incident.id, { name: `Node ${index}`, kind: NodeKind.Server })));
        assert.equal((await service.getDiagram(incident.id)).nodes.length, CONCURRENT_WRITES);
    });
});

describe("SqlTimelineStore table names", () => {
    it("qualifies every table with the schema it was given", () => {
        const tables = new TableNames("tlg_", "app");
        assert.equal(tables.incidents, "app.tlg_incidents");
        assert.equal(tables.steps, "app.tlg_steps");
        assert.equal(tables.involvements, "app.tlg_step_involvements");
    });

    it("leaves the tables to the search path when given no schema", () => {
        assert.equal(new TableNames("tlg_").incidents, "tlg_incidents");
    });

    it("refuses a schema or a prefix that is not a plain identifier", () => {
        assert.throws(() => new TableNames("tlg_", "app; drop table"));
        assert.throws(() => new TableNames("tlg-", "app"));
    });
});

describe("reading a row", () => {
    it("takes a number the driver handed over as text, which is how PostgreSQL returns BIGINT", () => {
        const read = new RowReader({ id: "9101", ratio: "1.5", missing: null });
        assert.equal(read.number("id"), 9101);
        assert.equal(read.number("ratio"), 1.5);
        assert.equal(read.nullableNumber("missing"), null);
    });

    it("refuses a value no number can hold exactly, rather than rounding into another row", () => {
        assert.throws(() => new RowReader({ id: "9007199254740993" }).number("id"));
    });

    it("refuses text that is not a number", () => {
        assert.throws(() => new RowReader({ id: "9101; drop table" }).number("id"));
        assert.throws(() => new RowReader({ id: "" }).number("id"));
    });
});
