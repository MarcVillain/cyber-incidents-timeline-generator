# Connectors

The way an incident is worked stays the same whatever sits behind it: an incident holds records (parties,
machines, accounts, files), steps (what happened, when, by whom, to what) and links, and `TimelineService`
enforces every rule on them. What changes from one organisation to the next is where incidents live, who owns
them and which endpoints reach them. This page shows where to plug each case in.

| Your situation | Plug in | Work |
|---|---|---|
| Nothing yet, you want a simple incident desk | The bundled app on SQLite, see [INSTALL.md](INSTALL.md) | None |
| Incidents and timelines in your own database | A `TimelineStore` or a `SqlDriver`, see [docs/storage.md](docs/storage.md) | One class |
| Incidents owned by a ticketing tool, SOAR or case manager, timelines kept here | An `IncidentSource` wrapped in `SourcedTimelineStore` | Five methods |
| An existing backend with its own routes, called from the browser | A `TimelineApi` adapter | One class, in the page |
| A backend in another language | [The REST contract](docs/rest-api.md) | Routes on your side |

Prefer the options near the top. The further down, the more of the rules your own code has to carry.

```
 workspace / app  ->  TimelineApi  ->  TimelineService  ->  TimelineStore
                          |                                     |
                  TimelineApi adapter                 SourcedTimelineStore
                  HttpTimelineApi -> REST               IncidentSource  +  local store
```

## Incidents owned by another tool

Most teams already have a place where incidents are opened, assigned and closed. That tool stays the
authority on the incident; this package keeps the timeline of each one. Write an `IncidentSource` that
translates the tool's tickets into incidents, and wrap it with the local store that will hold the timelines.

```ts
interface IncidentSource {
    readonly name: string;
    list(): Promise<ExternalIncident[]>;
    find(externalId: string): Promise<ExternalIncident | null>;
    create?(fields: IncidentFields): Promise<ExternalIncident>;
    update?(externalId: string, fields: IncidentFields): Promise<void>;
    delete?(externalId: string): Promise<void>;
}
```

`ExternalIncident` is an incident without its numeric id, carrying the key the tool uses in `externalId`.
Implement only what the tool allows. A tool that only exposes tickets for reading leaves `create`, `update`
and `delete` out, and those operations are refused with a `ForbiddenError` (HTTP `403`) that names the tool.

### Example: a ticketing REST API

The tool below lists tickets at `GET /rest/tickets?type=security`, uses `P1` to `P3` priorities and a ticket
key such as `SEC-1042`. The connector runs on the server, so the token never reaches a browser.

```ts
import {
    NotFoundError, TimelineService, SourcedTimelineStore, ValidationRules, buildCatalog, readIncidentCreate,
    type ExternalIncident, type IncidentFields, type IncidentSource, type ImpactScale
} from "cyber-incidents-timeline-generator";
import { createTimelineServer, openSqliteStore } from "cyber-incidents-timeline-generator/server";

interface Ticket {
    key: string;
    summary: string;
    priority: string | null;
    team: string | null;
    labels: string[];
}

// The ratings of the tool become the impact scale, so nothing is lost in translation
const PRIORITIES: ImpactScale = {
    unassessed: { level: "Unrated", label: "Not triaged", color: "#8a8f98" },
    levels: [
        { level: "P3", label: "Minor", color: "#1565c0" },
        { level: "P2", label: "Serious", color: "#e65100" },
        { level: "P1", label: "Major", color: "#c62828" }
    ]
};
const RULES = new ValidationRules(buildCatalog({ impactScale: PRIORITIES }));
const NOT_FOUND = 404;

function setting(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Set ${name} before starting the server.`);
    return value;
}

class TicketingSource implements IncidentSource {
    readonly name = "the ticketing tool";

    constructor(private readonly baseUrl: string, private readonly token: string) {}

    async list(): Promise<ExternalIncident[]> {
        const response = await this.call("GET", "/rest/tickets?type=security");
        const tickets: Ticket[] = await response.json();
        return tickets.map(ticket => this.toIncident(ticket));
    }

    async find(externalId: string): Promise<ExternalIncident | null> {
        const response = await this.call("GET", `/rest/tickets/${encodeURIComponent(externalId)}`);
        if (response.status === NOT_FOUND) return null;
        const ticket: Ticket = await response.json();
        return this.toIncident(ticket);
    }

    async create(fields: IncidentFields): Promise<ExternalIncident> {
        const response = await this.call("POST", "/rest/tickets", this.toTicket(fields));
        const ticket: Ticket = await response.json();
        return this.toIncident(ticket);
    }

    async update(externalId: string, fields: IncidentFields): Promise<void> {
        const response = await this.call("PUT", `/rest/tickets/${encodeURIComponent(externalId)}`, this.toTicket(fields));
        if (response.status === NOT_FOUND) throw new NotFoundError(`Ticket ${externalId} no longer exists.`);
    }

    // No delete: tickets are closed in the tool, never removed from here

    /**
     * Tool data is checked like any other input, so a priority the scale does not know is refused here
     * rather than drawn wrong later.
     */
    private toIncident(ticket: Ticket): ExternalIncident {
        const fields = readIncidentCreate({
            title: ticket.summary,
            referenceId: ticket.key,
            impact: ticket.priority ?? PRIORITIES.unassessed.level,
            scope: ticket.team,
            classifications: ticket.labels
        }, RULES);
        return { ...fields, externalId: ticket.key };
    }

    private toTicket(fields: IncidentFields): Partial<Ticket> {
        return {
            summary: fields.title,
            priority: fields.impact === PRIORITIES.unassessed.level ? null : fields.impact,
            team: fields.scope,
            labels: fields.classifications
        };
    }

    private async call(method: string, path: string, body?: Partial<Ticket>): Promise<Response> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        if (!response.ok && response.status !== NOT_FOUND) {
            throw new Error(`The ticketing tool answered ${response.status}.`);
        }
        return response;
    }
}

const { store: timelines } = await openSqliteStore("timeline.sqlite");
const source = new TicketingSource(setting("TICKETING_URL"), setting("TICKETING_TOKEN"));
const service = new TimelineService(new SourcedTimelineStore(source, timelines), { impactScale: PRIORITIES });

createTimelineServer({ api: service }).listen(8080, "127.0.0.1");
```

In the page, point the app at that server and match what the tool allows:

```js
await mountTimelineApp(element, {
    api: new HttpTimelineApi({ baseUrl: "/api" }),
    incidentPermissions: { canCreate: true, canEdit: true, canDelete: false }
});
```

### How it behaves

- **The tool is the authority.** Every list and every open reads the tool again. A ticket renamed there shows
  renamed here on the next read.
- **Ids stay stable.** The local store keeps one shadow row per ticket, which gives it the numeric id the
  timeline records point at, whatever the tool's keys look like.
- **Dates stay in the tool.** Opened, resolved, SLA and any other dates the tool tracks are not copied.
  Response times are measured from the steps of the timeline. Show the tool's own dates on the slides with
  `slideHeader`.
- **Tickets that disappear** stop being served: opening their timeline answers `404`. Their timeline rows
  stay in the local store until the incident is deleted through the service.
- **No shared transaction.** A change sent to the tool cannot be rolled back with the local records, so an
  operation failing half way can leave the tool changed. Keep `update` idempotent.
- **Latency.** `list` runs on every incident list and `find` on every open. Cache in the connector if the
  tool is slow or rate limited.
- **Permissions** of the tool are not guessed. Pass the matching `incidentPermissions` to the app, and use the
  `authorize` hook of `createTimelineHandler` to apply your own access rules per request and per incident.

### Testing a connector

`SourcedTimelineStore` passes the same store contract as every built in store. Copy
`tests/storage/store-contract.ts` and `tests/support/fake-source.ts` from the repository, replace the fake
with your connector pointed at a test instance of the tool, and run:

```ts
runStoreContract("Ticketing connector", async () => new SourcedTimelineStore(new TicketingSource(url, token), new MemoryTimelineStore()), { transactionalIncidents: false });
```

## A backend with its own routes

The workspace and the app only ever call `TimelineApi`. When the browser has to talk to an existing backend
whose routes and shapes differ from the REST contract, implement that interface in the page. Keep the
validation where it belongs: the backend has to enforce the same rules `TimelineService` does, or better,
run `TimelineService` itself.

```ts
import { HttpTimelineApi, readIncidentCreate, type Diagram, type DiagramStep, type Incident, type IncidentCreateInput, type RecordId, type StepCreateInput, type TimelineApi } from "cyber-incidents-timeline-generator";

interface Case {
    caseId: number;
    name: string;
    severity: string;
}

function toIncident(item: Case): Incident {
    return { ...readIncidentCreate({ title: item.name, impact: item.severity }), id: item.caseId };
}

/**
 * Incidents come from the case manager's own endpoints, timelines from the contract mounted under /api/timeline.
 */
export class CaseManagerApi implements TimelineApi {
    private readonly timeline = new HttpTimelineApi({ baseUrl: "/api/timeline" });

    async listIncidents(): Promise<Incident[]> {
        const response = await fetch("/cases?kind=security", { credentials: "same-origin" });
        const cases: Case[] = await response.json();
        return cases.map(toIncident);
    }

    async createIncident(input: IncidentCreateInput): Promise<Incident> {
        const response = await fetch("/cases", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: input.title, severity: input.impact }) });
        return toIncident(await response.json());
    }

    getDiagram(incidentId: RecordId): Promise<Diagram> {
        return this.timeline.getDiagram(incidentId);
    }

    createStep(incidentId: RecordId, input: StepCreateInput): Promise<DiagramStep> {
        return this.timeline.createStep(incidentId, input);
    }

    // getIncident, updateIncident, deleteIncident, getCatalog and the node, step, link and layout methods
    // follow one of the two patterns above
}
```

Every method returns a promise and throws on failure. Throw `ValidationError`, `NotFoundError` or
`ForbiddenError` from the core so the workspace shows the right message; anything else is reported as a
failure to save or load.

When only authentication differs, no adapter is needed: `HttpTimelineApi` takes `headers` (read before every
request, for CSRF or bearer tokens), `credentials` and a `fetch` of your own.

## A backend in another language

Implement the routes of [docs/rest-api.md](docs/rest-api.md) and point `HttpTimelineApi` or the app at them.
Validate at your boundary with the same rules, cascade deletions as described there, and answer errors with
the documented shape so messages reach the viewer. [schema/postgres.sql](schema/postgres.sql) is a ready table
layout, `external_id` included for incidents owned by another tool.
