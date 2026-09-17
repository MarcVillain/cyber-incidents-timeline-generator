# Storage

`TimelineService` keeps its rules to itself and persists through the `TimelineStore` interface. Pick a store
that exists, reuse the SQL store on another engine, or implement the interface for anything else.

| Store | Where it runs | Suited to |
|---|---|---|
| `MemoryTimelineStore` | Anywhere | Tests, demos, a diagram built and exported in one sitting |
| `BrowserStorageTimelineStore` | Browser | A personal tool with no server, kept in `localStorage` |
| `SqlTimelineStore` + `SqliteDriver` | Node 22.13+ | The reference server, small teams, a single file database |
| `SqlTimelineStore` + your `SqlDriver` | Node | PostgreSQL, MySQL, SQL Server and other SQL engines |
| `SourcedTimelineStore` | Anywhere | Incidents owned by a ticketing tool or SOAR, timelines kept in another store |
| Your own `TimelineStore` | Anywhere | Document stores, remote services, an existing data model |

Connecting to an incident handling tool is covered in [CONNECTORS.md](../CONNECTORS.md). A backend written in
another language does not use these at all: it implements
[the REST contract](rest-api.md) over its own storage.

## SQLite

```js
import { TimelineService } from "cyber-incidents-timeline-generator";
import { openSqliteStore } from "cyber-incidents-timeline-generator/server";

const { store, driver } = await openSqliteStore("timeline.sqlite", { tablePrefix: "tlg_" });
const service = new TimelineService(store);
// driver.close() when shutting down
```

`openSqliteStore` creates any missing table. It uses the SQLite driver built into Node, so nothing native
has to be installed. SQLite has a single connection, so the driver runs statements and transactions one at a
time and recognises statements issued inside a transaction through async context.

## Another SQL engine

`SqlTimelineStore` needs three operations from a database:

```ts
interface SqlDriver {
    query(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
    execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
    transaction<TResult>(work: () => Promise<TResult>): Promise<TResult>;
}
```

The store writes standard SQL with `?` placeholders and `INSERT ... RETURNING id`. Times are text, flags are
`0` or `1`, and child rows are deleted explicitly, so the schema needs no engine specific feature. Nested
transactions must behave as savepoints.

A PostgreSQL driver on the `pg` package looks like this:

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import type { SqlDriver, SqlRow, SqlValue } from "cyber-incidents-timeline-generator/server";

export class PostgresDriver implements SqlDriver {
    private readonly pool: pg.Pool;
    private readonly scope = new AsyncLocalStorage<{ client: pg.PoolClient; depth: number }>();

    constructor(pool: pg.Pool) {
        this.pool = pool;
    }

    async query(sql: string, params: readonly SqlValue[] = []): Promise<SqlRow[]> {
        const client = this.scope.getStore()?.client ?? this.pool;
        const result = await client.query(numbered(sql), [...params]);
        return result.rows;
    }

    async execute(sql: string, params: readonly SqlValue[] = []): Promise<void> {
        await this.query(sql, params);
    }

    async transaction<TResult>(work: () => Promise<TResult>): Promise<TResult> {
        const current = this.scope.getStore();
        const client = current?.client ?? await this.pool.connect();
        const depth = current ? current.depth + 1 : 1;
        const begin = current ? `SAVEPOINT tlg_${depth}` : "BEGIN";
        const commit = current ? `RELEASE SAVEPOINT tlg_${depth}` : "COMMIT";
        const rollback = current ? `ROLLBACK TO SAVEPOINT tlg_${depth}` : "ROLLBACK";

        try {
            await client.query(begin);
            const result = await this.scope.run({ client, depth }, work);
            await client.query(commit);
            return result;
        } catch (error) {
            await client.query(rollback);
            throw error;
        } finally {
            if (!current) client.release();
        }
    }
}

function numbered(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}
```

Integer columns come back as numbers with `pg` by default. Create the tables from
[schema/postgres.sql](../schema/postgres.sql), replacing the `tlg_` prefix if you chose another one, then:

```ts
const service = new TimelineService(new SqlTimelineStore(new PostgresDriver(pool), { tablePrefix: "tlg_" }));
```

Check a new driver with the shared contract tests: add a line to `tests/storage/stores.test.ts`.

```ts
runStoreContract("SqlTimelineStore on PostgreSQL", async () => new SqlTimelineStore(await freshDriver()));
```

## Your own store

Implement every method of `TimelineStore` from `cyber-incidents-timeline-generator/core`. The contract is short:

- Return copies. The service changes what it receives before writing it back.
- `deleteIncident` removes everything belonging to the incident; `deleteNode` removes the record and its
  layouts. Everything else about deleting is done by the service before it calls the store.
- `saveLayout` inserts or replaces the position of one record in one representation.
- `transaction` is atomic and may be nested.

Run `runStoreContract` against it, as the built in stores do.

## More than one tenant

The package holds no opinion about tenancy. Its tables carry no organisation column and its service
takes no tenant argument: whoever opens the connection decides what the connection can see.

Three ways, in the order they usually make sense:

1. **A schema per tenant.** One `search_path` per connection, the same tables underneath. Nothing in the
   package changes, and one tenant's data cannot be read by another even through a bug in a query.
2. **A prefix per tenant.** `new SqlTimelineStore(driver, { tablePrefix: "acme_tlg_" })`. Cheaper to set
   up than a schema, and the prefix is checked against a plain identifier before it reaches any SQL.
3. **A column and row level security.** `schema/postgres-rls.sql` is a worked example: an `org_id` on the
   incident, a policy on every table reaching it by its incident, and a setting read from the connection.
   The role running the queries must not own the tables, since an owner is not subject to the policies.

Whichever you pick, the authorization decision belongs to the host. `createTimelineHandler` takes an
`Authorizer` for the REST layer, and a host embedding `TimelineService` directly should wrap it rather
than trusting the identifiers arriving in a request.
