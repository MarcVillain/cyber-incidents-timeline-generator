import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import type { SqlDriver, SqlRow, SqlValue } from "./driver.js";

export const IN_MEMORY_DATABASE = ":memory:";

function toSqlValue(column: string, value: SQLOutputValue): SqlValue {
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (value instanceof Uint8Array) {
        throw new Error(`Column ${column} holds binary data, which the timeline schema never stores.`);
    }
    return value;
}

function toRow(row: Record<string, SQLOutputValue>): SqlRow {
    const converted: Record<string, SqlValue> = {};
    for (const [column, value] of Object.entries(row)) {
        converted[column] = toSqlValue(column, value);
    }
    return converted;
}

/**
 * SQLite through the driver built into Node, so the reference server needs no native module.
 *
 * SQLite gives one connection, while requests run concurrently. Every statement and every transaction
 * therefore takes a turn, and statements issued from inside a transaction are recognised through async
 * context and run inside it rather than queueing behind it.
 */
export class SqliteDriver implements SqlDriver {
    private readonly database: DatabaseSync;
    private readonly scope = new AsyncLocalStorage<number>();
    private queue: Promise<void> = Promise.resolve();

    constructor(path: string = IN_MEMORY_DATABASE) {
        this.database = new DatabaseSync(path);
        this.database.exec("PRAGMA foreign_keys = ON");
        if (path !== IN_MEMORY_DATABASE) {
            this.database.exec("PRAGMA journal_mode = WAL");
        }
    }

    close(): void {
        this.database.close();
    }

    async query(sql: string, params: readonly SqlValue[] = []): Promise<SqlRow[]> {
        return this.exclusive(() => this.database.prepare(sql).all(...params).map(toRow));
    }

    async execute(sql: string, params: readonly SqlValue[] = []): Promise<void> {
        await this.exclusive(() => {
            this.database.prepare(sql).run(...params);
        });
    }

    /**
     * Runs a script of several statements, such as the schema. Not for anything built from input.
     */
    async executeScript(script: string): Promise<void> {
        await this.exclusive(() => this.database.exec(script));
    }

    async transaction<TResult>(work: () => Promise<TResult>): Promise<TResult> {
        const depth = this.scope.getStore();
        if (depth !== undefined) {
            return this.savepoint(depth, work);
        }

        return this.inTurn(() => this.scope.run(1, async () => {
            this.database.exec("BEGIN");
            try {
                const result = await work();
                this.database.exec("COMMIT");
                return result;
            } catch (error) {
                this.database.exec("ROLLBACK");
                throw error;
            }
        }));
    }

    private async savepoint<TResult>(depth: number, work: () => Promise<TResult>): Promise<TResult> {
        const name = `tlg_savepoint_${depth}`;
        this.database.exec(`SAVEPOINT ${name}`);
        try {
            const result = await this.scope.run(depth + 1, work);
            this.database.exec(`RELEASE ${name}`);
            return result;
        } catch (error) {
            this.database.exec(`ROLLBACK TO ${name}`);
            this.database.exec(`RELEASE ${name}`);
            throw error;
        }
    }

    private exclusive<TResult>(action: () => TResult): Promise<TResult> {
        if (this.scope.getStore() !== undefined) {
            return Promise.resolve(action());
        }
        return this.inTurn(async () => action());
    }

    private inTurn<TResult>(work: () => Promise<TResult>): Promise<TResult> {
        const turn = this.queue.then(work);
        this.queue = turn.then(() => undefined, () => undefined);
        return turn;
    }
}
