import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog } from "../../src/core/catalog.js";
import { CatalogList, emptyCatalogSettings, readCatalogSettings, type CatalogSettings } from "../../src/core/catalog-settings.js";
import { Side } from "../../src/core/enums.js";
import { ConflictError, ValidationError } from "../../src/core/errors.js";
import { TimelineService } from "../../src/core/service.js";
import { MemoryCatalogStore } from "../../src/storage/catalog-stores.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { seedSampleData } from "../../src/core/sample.js";
import { SAMPLE_START } from "../support/fixtures.js";

const LEGAL = { value: "legal", label: "Legal" };
const MISSING_PHASE = "gone";

function withLegal(): CatalogSettings {
    return { ...emptyCatalogSettings(), vocabulary: { audiences: [...buildCatalog().audiences, LEGAL] } };
}

function withoutThirdParty(): CatalogSettings {
    return { ...emptyCatalogSettings(), vocabulary: { sides: buildCatalog().sides.filter(entry => entry.side !== Side.ThirdParty) } };
}

describe("catalog settings", () => {
    it("refuses settings any part of which cannot be read", () => {
        assert.throws(() => readCatalogSettings(null), ValidationError);
        assert.throws(() => readCatalogSettings({ vocabulary: { sides: [{ side: "x" }] } }), /vocabulary.sides/);
        assert.throws(() => readCatalogSettings({ impactScale: { levels: [] } }), /impactScale/);
        assert.deepEqual(readCatalogSettings({}), emptyCatalogSettings());
    });

    it("keeps settings in the store and serves the catalog they make", async () => {
        const catalogStore = new MemoryCatalogStore();
        const service = new TimelineService(new MemoryTimelineStore(), { catalogStore });
        const catalog = await service.saveCatalogSettings(withLegal());
        assert.ok(catalog.audiences.some(entry => entry.value === LEGAL.value));
        assert.deepEqual(await service.getCatalogSettings(), withLegal());

        const restarted = new TimelineService(new MemoryTimelineStore(), { catalogStore });
        assert.ok((await restarted.getCatalog()).audiences.some(entry => entry.value === LEGAL.value));
    });

    it("validates records against the saved catalog", async () => {
        const service = new TimelineService(new MemoryTimelineStore(), { catalogStore: new MemoryCatalogStore() });
        const incident = await service.createIncident({ title: "Legal" });
        await assert.rejects(service.createStep(incident.id, { title: "Step", timestamp: "2026-01-12T08:00", audiences: [LEGAL.value] }), ValidationError);
        await service.saveCatalogSettings(withLegal());
        const step = await service.createStep(incident.id, { title: "Step", timestamp: "2026-01-12T08:00", audiences: [LEGAL.value] });
        assert.deepEqual(step.audiences, [LEGAL.value]);
    });

    it("refuses settings that do not hold together, and keeps the previous ones", async () => {
        const service = new TimelineService(new MemoryTimelineStore(), { catalogStore: new MemoryCatalogStore() });
        const tactics = buildCatalog().attackTactics.map(entry => ({ ...entry, killChainPhase: MISSING_PHASE }));
        await assert.rejects(service.saveCatalogSettings({ ...emptyCatalogSettings(), vocabulary: { attackTactics: tactics } }), ValidationError);
        assert.deepEqual(await service.getCatalogSettings(), emptyCatalogSettings());
    });

    it("refuses to save where the catalog is kept in code", async () => {
        const service = new TimelineService(new MemoryTimelineStore());
        await assert.rejects(service.saveCatalogSettings(withLegal()), ConflictError);
        assert.deepEqual(await service.getCatalogSettings(), emptyCatalogSettings());
    });

    it("counts the records still holding an entry the settings remove", async () => {
        const service = new TimelineService(new MemoryTimelineStore(), { catalogStore: new MemoryCatalogStore() });
        await seedSampleData(service, SAMPLE_START);
        const usage = await service.catalogUsage(withoutThirdParty());
        const thirdParty = usage.find(entry => entry.list === CatalogList.Sides && entry.key === Side.ThirdParty);
        assert.ok(thirdParty && thirdParty.records > 0);
        assert.deepEqual(await service.catalogUsage(withLegal()), []);
    });

    it("reads settings another process saved once told to", async () => {
        const catalogStore = new MemoryCatalogStore();
        const service = new TimelineService(new MemoryTimelineStore(), { catalogStore });
        assert.ok(!(await service.getCatalog()).audiences.some(entry => entry.value === LEGAL.value));
        await catalogStore.save(withLegal());
        service.reloadCatalog();
        assert.ok((await service.getCatalog()).audiences.some(entry => entry.value === LEGAL.value));
    });
});
