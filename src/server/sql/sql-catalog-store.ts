import { readCatalogSettings, type CatalogSettings } from "../../core/catalog-settings.js";
import type { CatalogStore } from "../../core/catalog-store.js";
import { RowReader, type SqlDriver } from "./driver.js";
import { DEFAULT_TABLE_PREFIX, TableNames } from "./schema.js";
import type { SqlTimelineStoreOptions } from "./sql-store.js";

// The table holds one row, the settings of the deployment
const SETTINGS_ROW = 1;

/**
 * The catalog settings in one row of the database the records live in, so a deployment keeps a single
 * place to back up.
 */
export class SqlCatalogStore implements CatalogStore {
    private readonly driver: SqlDriver;
    readonly tables: TableNames;

    constructor(driver: SqlDriver, options: SqlTimelineStoreOptions = {}) {
        this.driver = driver;
        this.tables = new TableNames(options.tablePrefix ?? DEFAULT_TABLE_PREFIX, options.schema ?? null);
    }

    async load(): Promise<CatalogSettings | null> {
        const [row] = await this.driver.query(`SELECT settings FROM ${this.tables.catalogSettings} WHERE id = ?`, [SETTINGS_ROW]);
        if (!row) return null;
        return readCatalogSettings(new RowReader(row).json("settings"));
    }

    async save(settings: CatalogSettings): Promise<void> {
        await this.driver.execute(
            `INSERT INTO ${this.tables.catalogSettings} (id, settings) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET settings = excluded.settings`,
            [SETTINGS_ROW, JSON.stringify(settings)]
        );
    }
}
