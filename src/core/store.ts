import type { Representation } from "./enums.js";
import type { Incident, IncidentFields, LayoutRecord, LinkRecord, NodeRecord, RecordId, StepRecord } from "./models.js";

export type NodeData = Omit<NodeRecord, "id">;
export type StepData = Omit<StepRecord, "id">;
export type LinkData = Omit<LinkRecord, "id">;

/**
 * The persistence port. Implement it to keep diagrams in any database: the service holds every rule,
 * so an implementation only stores and returns records as they are given.
 *
 * Every returned record must be a copy the caller may change freely.
 */
export interface TimelineStore {
    listIncidents(): Promise<Incident[]>;
    findIncident(id: RecordId): Promise<Incident | null>;
    insertIncident(fields: IncidentFields): Promise<Incident>;
    updateIncident(incident: Incident): Promise<void>;
    /** Removes the incident together with every record, step, link and layout belonging to it. */
    deleteIncident(id: RecordId): Promise<void>;

    listNodes(incidentId: RecordId): Promise<NodeRecord[]>;
    findNode(id: RecordId): Promise<NodeRecord | null>;
    insertNode(data: NodeData): Promise<NodeRecord>;
    updateNode(node: NodeRecord): Promise<void>;
    /** Removes the record and its layouts. Steps and links pointing at it are cleaned up by the service first. */
    deleteNode(id: RecordId): Promise<void>;

    listSteps(incidentId: RecordId): Promise<StepRecord[]>;
    findStep(id: RecordId): Promise<StepRecord | null>;
    insertStep(data: StepData): Promise<StepRecord>;
    updateStep(step: StepRecord): Promise<void>;
    deleteStep(id: RecordId): Promise<void>;

    listLinks(incidentId: RecordId): Promise<LinkRecord[]>;
    findLink(id: RecordId): Promise<LinkRecord | null>;
    insertLink(data: LinkData): Promise<LinkRecord>;
    updateLink(link: LinkRecord): Promise<void>;
    deleteLink(id: RecordId): Promise<void>;

    listLayouts(incidentId: RecordId): Promise<LayoutRecord[]>;
    /** Inserts or replaces the position of one record in one representation. */
    saveLayout(layout: LayoutRecord): Promise<void>;
    deleteLayout(nodeId: RecordId, representation: Representation): Promise<void>;

    /**
     * Runs the work atomically: either every change inside it is kept or none is. Calls may nest.
     */
    transaction<TResult>(work: () => Promise<TResult>): Promise<TResult>;
}
