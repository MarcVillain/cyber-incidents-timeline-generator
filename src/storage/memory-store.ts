import type { RepresentationKey } from "../core/enums.js";
import type { Incident, IncidentFields, LayoutRecord, LinkRecord, NodeRecord, RecordId, StepRecord } from "../core/models.js";
import type { LinkData, NodeData, StepData, TimelineStore } from "../core/store.js";

export const SNAPSHOT_VERSION = 1;

/**
 * Everything a memory store holds, in a shape that survives JSON. Used to persist the store in the
 * browser and to move a diagram between machines.
 */
export interface StoreSnapshot {
    version: typeof SNAPSHOT_VERSION;
    nextId: RecordId;
    incidents: Incident[];
    nodes: NodeRecord[];
    steps: StepRecord[];
    links: LinkRecord[];
    layouts: LayoutRecord[];
}

export function emptySnapshot(): StoreSnapshot {
    return { version: SNAPSHOT_VERSION, nextId: 1, incidents: [], nodes: [], steps: [], links: [], layouts: [] };
}

function replaceById<TRecord extends { id: RecordId }>(records: TRecord[], record: TRecord): void {
    const index = records.findIndex(existing => existing.id === record.id);
    if (index === -1) {
        throw new Error(`No stored record has id ${record.id}.`);
    }
    records[index] = structuredClone(record);
}

function findById<TRecord extends { id: RecordId }>(records: readonly TRecord[], id: RecordId): TRecord | null {
    const found = records.find(record => record.id === id);
    return found ? structuredClone(found) : null;
}

/**
 * Keeps everything in memory. The reference implementation of the persistence port, and the store used
 * when the workspace runs with no server at all.
 */
export class MemoryTimelineStore implements TimelineStore {
    private state: StoreSnapshot;
    private depth = 0;

    constructor(snapshot: StoreSnapshot = emptySnapshot()) {
        this.state = structuredClone(snapshot);
    }

    snapshot(): StoreSnapshot {
        return structuredClone(this.state);
    }

    private nextId(): RecordId {
        const id = this.state.nextId;
        this.state.nextId += 1;
        return id;
    }

    async listIncidents(): Promise<Incident[]> {
        return structuredClone(this.state.incidents);
    }

    async findIncident(id: RecordId): Promise<Incident | null> {
        return findById(this.state.incidents, id);
    }

    async insertIncident(fields: IncidentFields): Promise<Incident> {
        const incident: Incident = { ...structuredClone(fields), id: this.nextId() };
        this.state.incidents.push(incident);
        return structuredClone(incident);
    }

    async updateIncident(incident: Incident): Promise<void> {
        replaceById(this.state.incidents, incident);
    }

    async deleteIncident(id: RecordId): Promise<void> {
        const nodeIds = new Set(this.state.nodes.filter(node => node.incidentId === id).map(node => node.id));
        this.state.layouts = this.state.layouts.filter(layout => !nodeIds.has(layout.nodeId));
        this.state.links = this.state.links.filter(link => link.incidentId !== id);
        this.state.steps = this.state.steps.filter(step => step.incidentId !== id);
        this.state.nodes = this.state.nodes.filter(node => node.incidentId !== id);
        this.state.incidents = this.state.incidents.filter(incident => incident.id !== id);
    }

    async listNodes(incidentId: RecordId): Promise<NodeRecord[]> {
        return structuredClone(this.state.nodes.filter(node => node.incidentId === incidentId));
    }

    async findNode(id: RecordId): Promise<NodeRecord | null> {
        return findById(this.state.nodes, id);
    }

    async insertNode(data: NodeData): Promise<NodeRecord> {
        const node: NodeRecord = { ...structuredClone(data), id: this.nextId() };
        this.state.nodes.push(node);
        return structuredClone(node);
    }

    async updateNode(node: NodeRecord): Promise<void> {
        replaceById(this.state.nodes, node);
    }

    async deleteNode(id: RecordId): Promise<void> {
        this.state.layouts = this.state.layouts.filter(layout => layout.nodeId !== id);
        this.state.nodes = this.state.nodes.filter(node => node.id !== id);
    }

    async listSteps(incidentId: RecordId): Promise<StepRecord[]> {
        return structuredClone(this.state.steps.filter(step => step.incidentId === incidentId));
    }

    async findStep(id: RecordId): Promise<StepRecord | null> {
        return findById(this.state.steps, id);
    }

    async insertStep(data: StepData): Promise<StepRecord> {
        const step: StepRecord = { ...structuredClone(data), id: this.nextId() };
        this.state.steps.push(step);
        return structuredClone(step);
    }

    async updateStep(step: StepRecord): Promise<void> {
        replaceById(this.state.steps, step);
    }

    async deleteStep(id: RecordId): Promise<void> {
        this.state.steps = this.state.steps.filter(step => step.id !== id);
    }

    async listLinks(incidentId: RecordId): Promise<LinkRecord[]> {
        return structuredClone(this.state.links.filter(link => link.incidentId === incidentId));
    }

    async findLink(id: RecordId): Promise<LinkRecord | null> {
        return findById(this.state.links, id);
    }

    async insertLink(data: LinkData): Promise<LinkRecord> {
        const link: LinkRecord = { ...structuredClone(data), id: this.nextId() };
        this.state.links.push(link);
        return structuredClone(link);
    }

    async updateLink(link: LinkRecord): Promise<void> {
        replaceById(this.state.links, link);
    }

    async deleteLink(id: RecordId): Promise<void> {
        this.state.links = this.state.links.filter(link => link.id !== id);
    }

    async listLayouts(incidentId: RecordId): Promise<LayoutRecord[]> {
        const nodeIds = new Set(this.state.nodes.filter(node => node.incidentId === incidentId).map(node => node.id));
        return structuredClone(this.state.layouts.filter(layout => nodeIds.has(layout.nodeId)));
    }

    async saveLayout(layout: LayoutRecord): Promise<void> {
        await this.deleteLayout(layout.nodeId, layout.representation);
        this.state.layouts.push(structuredClone(layout));
    }

    async deleteLayout(nodeId: RecordId, representation: RepresentationKey): Promise<void> {
        this.state.layouts = this.state.layouts.filter(layout => layout.nodeId !== nodeId || layout.representation !== representation);
    }

    /**
     * Rolls the whole state back when the work fails. Meant for a single user in a browser tab, where
     * nothing else writes while a transaction is open.
     */
    async transaction<TResult>(work: () => Promise<TResult>): Promise<TResult> {
        if (this.depth > 0) {
            return work();
        }

        const before = structuredClone(this.state);
        this.depth += 1;
        try {
            return await work();
        } catch (error) {
            this.state = before;
            throw error;
        } finally {
            this.depth -= 1;
        }
    }
}
