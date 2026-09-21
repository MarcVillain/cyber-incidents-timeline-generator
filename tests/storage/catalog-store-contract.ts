import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog } from "../../src/core/catalog.js";
import type { CatalogSettings } from "../../src/core/catalog-settings.js";
import type { CatalogStore } from "../../src/core/catalog-store.js";

const LEGAL = { value: "legal", label: "Legal" };
const FIRST_ACCESS = { key: "first-access", label: "First access" };

function settings(): CatalogSettings {
    const defaults = buildCatalog();
    return { impactScale: null, milestones: [FIRST_ACCESS], vocabulary: { audiences: [...defaults.audiences, LEGAL] } };
}

/**
 * What every catalog store must do, whatever keeps the settings.
 */
export function runCatalogStoreContract(name: string, createStore: () => Promise<CatalogStore>): void {
    describe(`${name} catalog store contract`, () => {
        it("holds nothing until settings are saved", async () => {
            const store = await createStore();
            assert.equal(await store.load(), null);
        });

        it("hands back the settings saved last", async () => {
            const store = await createStore();
            await store.save(settings());
            assert.deepEqual(await store.load(), settings());

            const replaced: CatalogSettings = { impactScale: null, milestones: null, vocabulary: {} };
            await store.save(replaced);
            assert.deepEqual(await store.load(), replaced);
        });

        it("hands out copies that do not write back", async () => {
            const store = await createStore();
            await store.save(settings());
            const loaded = await store.load();
            loaded?.milestones?.push({ key: "extra", label: "Extra" });
            assert.deepEqual((await store.load())?.milestones, [FIRST_ACCESS]);
        });
    });
}
