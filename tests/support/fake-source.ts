import type { IncidentFields } from "../../src/core/models.js";
import type { ExternalIncident, IncidentSource } from "../../src/storage/sourced-store.js";

const TICKET_PREFIX = "INC";
export const SOURCE_NAME = "Ticketing";

/**
 * An incident handling tool held in memory, keyed by ticket numbers the way a real tool would be.
 */
export class FakeTicketing implements IncidentSource {
    readonly name = SOURCE_NAME;
    readonly tickets = new Map<string, ExternalIncident>();
    private sequence = 1000;

    add(fields: IncidentFields): ExternalIncident {
        this.sequence += 1;
        const ticket: ExternalIncident = { ...structuredClone(fields), externalId: `${TICKET_PREFIX}${this.sequence}` };
        this.tickets.set(ticket.externalId, ticket);
        return structuredClone(ticket);
    }

    async list(): Promise<ExternalIncident[]> {
        return structuredClone([...this.tickets.values()]);
    }

    async find(externalId: string): Promise<ExternalIncident | null> {
        const ticket = this.tickets.get(externalId);
        return ticket ? structuredClone(ticket) : null;
    }

    async create(fields: IncidentFields): Promise<ExternalIncident> {
        return this.add(fields);
    }

    async update(externalId: string, fields: IncidentFields): Promise<void> {
        this.tickets.set(externalId, { ...structuredClone(fields), externalId });
    }

    async delete(externalId: string): Promise<void> {
        this.tickets.delete(externalId);
    }
}

/**
 * A tool that only lets incidents be read, as many ticketing integrations do.
 */
export class ReadOnlyTicketing implements IncidentSource {
    readonly name = SOURCE_NAME;
    readonly backing = new FakeTicketing();

    list(): Promise<ExternalIncident[]> {
        return this.backing.list();
    }

    find(externalId: string): Promise<ExternalIncident | null> {
        return this.backing.find(externalId);
    }
}
