import type { CatalogSettings } from "./catalog-settings.js";

/**
 * Where the catalog settings of a deployment are kept. A separate port from the records, so a host can
 * keep its vocabulary in whatever already holds its configuration. Like the record stores, it only stores:
 * the service decides whether settings fit together.
 */
export interface CatalogStore {
    /** The settings saved last, or null when none were ever saved. */
    load(): Promise<CatalogSettings | null>;
    save(settings: CatalogSettings): Promise<void>;
}
