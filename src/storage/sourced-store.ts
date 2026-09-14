import type { Representation } from "../core/enums.js";
import { ForbiddenError, NotFoundError } from "../core/errors.js";
import type { Incident, IncidentFields, LayoutRecord, LinkRecord, NodeRecord, RecordId, StepRecord } from "../core/models.js";
import type { LinkData, NodeData, StepData, TimelineStore } from "../core/store.js";

/**
 * An incident as the system that owns it describes it, identified by that system's own key.
 */
export type ExternalIncident = IncidentFields & { externalId: string };

/**
 * The connector to an incident handling tool that owns the incidents, such as a ticketing system or a SOAR
 * platform. Implement the methods the tool allows: a tool that only exposes incidents for reading leaves
 * create, update and delete out, and those operations are then refused.
 */
export interface IncidentSource {
    /** The name of the tool, used in the messages explaining why an operation was refused. */
    readonly name: string;
    list(): Promise<ExternalIncident[]>;
    find(externalId: string): Promise<ExternalIncident | null>;
    create?(fields: IncidentFields): Promise<ExternalIncident>;
    update?(externalId: string, fields: IncidentFields): Promise<void>;
    delete?(externalId: string): Promise<void>;
}

function hasExternalId(incident: Incident): incident is Incident & { externalId: string } {
    return incident.externalId !== null;
}

/**
 * Two incidents compared field by field, whatever order their fields were written in.
 */
function sameIncident(a: Incident, b: Incident): boolean {
    const canonical = (incident: Incident): string => JSON.stringify(incident, Object.keys(incident).sort());
    return canonical(a) === canonical(b);
}

/**
 * Incidents from an outside tool, with the timeline of each kept in a local store.
 *
 * The local store holds a shadow row per external incident. It gives the incident the numeric id the
 * timeline records point at, whatever kind of key the tool uses, and keeps a copy of the incident for the
 * benchmark. The tool stays the authority: every read goes back to it and refreshes the shadow.
 *
 * Changes to the tool cannot join a local transaction, so an operation failing half way may leave the tool
 * changed while the timeline records are rolled back.
 */
export class SourcedTimelineStore implements TimelineStore {
    private readonly source: IncidentSource;
    private readonly local: TimelineStore;

    constructor(source: IncidentSource, local: TimelineStore) {
        this.source = source;
        this.local = local;
    }

    private refused(action: string): ForbiddenError {
        return new ForbiddenError(`Incidents are managed in ${this.source.name}, which does not allow ${action} them here.`);
    }

    private async shadows(): Promise<Map<string, Incident & { externalId: string }>> {
        const incidents = await this.local.listIncidents();
        return new Map(incidents.filter(hasExternalId).map(incident => [incident.externalId, incident]));
    }

    /**
     * The incident as the tool has it, under the id of its shadow, creating or refreshing the shadow on the way.
     */
    private async adopt(external: ExternalIncident, shadow: Incident | undefined): Promise<Incident> {
        if (!shadow) {
            return this.local.insertIncident(external);
        }
        const current: Incident = { ...external, id: shadow.id };
        if (!sameIncident(shadow, current)) {
            await this.local.updateIncident(current);
        }
        return current;
    }

    private async requireShadow(id: RecordId): Promise<Incident & { externalId: string }> {
        const shadow = await this.local.findIncident(id);
        if (!shadow || !hasExternalId(shadow)) {
            throw new NotFoundError(`Incident ${id} is not linked to ${this.source.name}.`);
        }
        return shadow;
    }

    async listIncidents(): Promise<Incident[]> {
        const externals = await this.source.list();
        const shadows = await this.shadows();
        const incidents: Incident[] = [];
        for (const external of externals) {
            incidents.push(await this.adopt(external, shadows.get(external.externalId)));
        }
        return incidents;
    }

    async findIncident(id: RecordId): Promise<Incident | null> {
        const shadow = await this.local.findIncident(id);
        if (!shadow || !hasExternalId(shadow)) return null;
        const external = await this.source.find(shadow.externalId);
        return external ? this.adopt(external, shadow) : null;
    }

    async insertIncident(fields: IncidentFields): Promise<Incident> {
        if (!this.source.create) {
            throw this.refused("creating");
        }
        const external = await this.source.create(fields);
        return this.local.insertIncident(external);
    }

    async updateIncident(incident: Incident): Promise<void> {
        const shadow = await this.requireShadow(incident.id);
        if (!this.source.update) {
            throw this.refused("changing");
        }
        const { id, ...fields } = incident;
        await this.source.update(shadow.externalId, { ...fields, externalId: shadow.externalId });
        await this.local.updateIncident({ ...incident, externalId: shadow.externalId });
    }

    async deleteIncident(id: RecordId): Promise<void> {
        const shadow = await this.requireShadow(id);
        if (!this.source.delete) {
            throw this.refused("deleting");
        }
        await this.source.delete(shadow.externalId);
        await this.local.deleteIncident(id);
    }

    listNodes(incidentId: RecordId): Promise<NodeRecord[]> {
        return this.local.listNodes(incidentId);
    }

    findNode(id: RecordId): Promise<NodeRecord | null> {
        return this.local.findNode(id);
    }

    insertNode(data: NodeData): Promise<NodeRecord> {
        return this.local.insertNode(data);
    }

    updateNode(node: NodeRecord): Promise<void> {
        return this.local.updateNode(node);
    }

    deleteNode(id: RecordId): Promise<void> {
        return this.local.deleteNode(id);
    }

    listSteps(incidentId: RecordId): Promise<StepRecord[]> {
        return this.local.listSteps(incidentId);
    }

    findStep(id: RecordId): Promise<StepRecord | null> {
        return this.local.findStep(id);
    }

    insertStep(data: StepData): Promise<StepRecord> {
        return this.local.insertStep(data);
    }

    updateStep(step: StepRecord): Promise<void> {
        return this.local.updateStep(step);
    }

    deleteStep(id: RecordId): Promise<void> {
        return this.local.deleteStep(id);
    }

    listLinks(incidentId: RecordId): Promise<LinkRecord[]> {
        return this.local.listLinks(incidentId);
    }

    findLink(id: RecordId): Promise<LinkRecord | null> {
        return this.local.findLink(id);
    }

    insertLink(data: LinkData): Promise<LinkRecord> {
        return this.local.insertLink(data);
    }

    updateLink(link: LinkRecord): Promise<void> {
        return this.local.updateLink(link);
    }

    deleteLink(id: RecordId): Promise<void> {
        return this.local.deleteLink(id);
    }

    listLayouts(incidentId: RecordId): Promise<LayoutRecord[]> {
        return this.local.listLayouts(incidentId);
    }

    saveLayout(layout: LayoutRecord): Promise<void> {
        return this.local.saveLayout(layout);
    }

    deleteLayout(nodeId: RecordId, representation: Representation): Promise<void> {
        return this.local.deleteLayout(nodeId, representation);
    }

    transaction<TResult>(work: () => Promise<TResult>): Promise<TResult> {
        return this.local.transaction(work);
    }
}
