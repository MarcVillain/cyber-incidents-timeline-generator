import { createServer, type Server } from "node:http";
import { createTimelineHandler, type TimelineHttpOptions, type TimelineRequestHandler } from "./http.js";
import { createStaticHandler, type StaticMount } from "./static.js";
import { SqliteDriver } from "./sql/sqlite-driver.js";
import { SqlTimelineStore, type SqlTimelineStoreOptions } from "./sql/sql-store.js";
import { sqliteSchema } from "./sql/schema.js";

export * from "./http.js";
export * from "./static.js";
export * from "./sql/driver.js";
export * from "./sql/schema.js";
export * from "./sql/sql-store.js";
export * from "./sql/sqlite-driver.js";

export interface TimelineServerOptions extends TimelineHttpOptions {
    staticMounts?: readonly StaticMount[];
}

const STATUS_NOT_FOUND = 404;

/**
 * A plain Node HTTP server answering the REST contract and, optionally, a few static folders.
 */
export function createTimelineServer(options: TimelineServerOptions): Server {
    const handlers: TimelineRequestHandler[] = [createTimelineHandler(options)];
    if (options.staticMounts && options.staticMounts.length > 0) {
        handlers.push(createStaticHandler(options.staticMounts));
    }

    return createServer(async (request, response) => {
        for (const handler of handlers) {
            if (await handler(request, response)) return;
        }
        response.statusCode = STATUS_NOT_FOUND;
        response.end();
    });
}

/**
 * Opens a SQLite file, creates the tables it is missing and returns a store over it.
 */
export async function openSqliteStore(path: string, options: SqlTimelineStoreOptions = {}): Promise<{ driver: SqliteDriver; store: SqlTimelineStore }> {
    const driver = new SqliteDriver(path);
    const store = new SqlTimelineStore(driver, options);
    await driver.executeScript(sqliteSchema(store.tables));
    return { driver, store };
}
