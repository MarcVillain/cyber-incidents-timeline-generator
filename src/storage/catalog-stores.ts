// Catalog stores for the browser: one in memory, one written through to browser storage.

import { readCatalogSettings, type CatalogSettings } from "../core/catalog-settings.js";
import type { CatalogStore } from "../core/catalog-store.js";
import type { KeyValueStorage } from "./browser-storage-store.js";

export class MemoryCatalogStore implements CatalogStore {
    private settings: CatalogSettings | null;

    constructor(settings: CatalogSettings | null = null) {
        this.settings = structuredClone(settings);
    }

    async load(): Promise<CatalogSettings | null> {
        return structuredClone(this.settings);
    }

    async save(settings: CatalogSettings): Promise<void> {
        this.settings = structuredClone(settings);
    }
}

/**
 * The catalog settings of a browser that holds its own incidents, in one entry of browser storage beside
 * them. What comes back is read like any stored JSON, since anything may have written it.
 */
export class BrowserStorageCatalogStore implements CatalogStore {
    private readonly storage: KeyValueStorage;
    private readonly key: string;

    constructor(storage: KeyValueStorage, key: string) {
        this.storage = storage;
        this.key = key;
    }

    async load(): Promise<CatalogSettings | null> {
        const raw = this.storage.getItem(this.key);
        return raw === null ? null : readCatalogSettings(JSON.parse(raw));
    }

    async save(settings: CatalogSettings): Promise<void> {
        this.storage.setItem(this.key, JSON.stringify(settings));
    }
}
