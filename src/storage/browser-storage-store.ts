import { Audience, type RepresentationKey } from "../core/enums.js";
import type { Incident, IncidentFields, LayoutRecord, LinkRecord, NodeRecord, RecordId, StepRecord } from "../core/models.js";
import type { LinkData, NodeData, StepData, TimelineStore } from "../core/store.js";
import { MemoryTimelineStore, SNAPSHOT_VERSION, emptySnapshot, type StoreSnapshot } from "./memory-store.js";

/**
 * The part of the Web Storage API this store needs, so localStorage, sessionStorage or any look alike
 * can be handed in.
 */
export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export const DEFAULT_STORAGE_KEY = "cyber-incidents-timeline";

function isSnapshot(value: unknown): value is StoreSnapshot {
    if (typeof value !== "object" || value === null) return false;
    const candidate: Partial<Record<keyof StoreSnapshot, unknown>> = value;
    return candidate.version === SNAPSHOT_VERSION
        && typeof candidate.nextId === "number"
        && [candidate.incidents, candidate.nodes, candidate.steps, candidate.links, candidate.layouts].every(Array.isArray);
}

// Snapshots of this version held one audience per step, or Both for everyone, before the list
const SINGLE_AUDIENCE_VERSION = 1;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Snapshots of this version held one source and one target per link
const SINGLE_END_VERSION = 2;

function upgradeStep(step: unknown): unknown {
    if (!isRecord(step)) return step;
    const { audience, ...rest } = step;
    return { ...rest, audiences: typeof audience === "string" && audience !== Audience.Both ? [audience] : [] };
}

// Snapshots of this version held no approximate flag nor time label on the steps
const EXACT_TIME_VERSION = 3;

function upgradeStepTime(step: unknown): unknown {
    if (!isRecord(step)) return step;
    return { ...step, timeApproximate: false, timeLabel: null };
}

function upgradeLink(link: unknown): unknown {
    if (!isRecord(link)) return link;
    const { sourceNodeId, targetNodeId, ...rest } = link;
    return {
        ...rest,
        sourceNodeIds: typeof sourceNodeId === "number" ? [sourceNodeId] : [],
        targetNodeIds: typeof targetNodeId === "number" ? [targetNodeId] : []
    };
}

/**
 * Brings a snapshot an earlier release wrote up to the current shape, one version at a time, so a browser
 * keeps its incidents across the upgrade.
 */
function upgrade(value: unknown): unknown {
    if (!isRecord(value)) return value;
    if (value["version"] === SINGLE_AUDIENCE_VERSION && Array.isArray(value["steps"])) {
        return upgrade({ ...value, version: SINGLE_END_VERSION, steps: value["steps"].map(upgradeStep) });
    }
    if (value["version"] === SINGLE_END_VERSION && Array.isArray(value["links"])) {
        return upgrade({ ...value, version: EXACT_TIME_VERSION, links: value["links"].map(upgradeLink) });
    }
    if (value["version"] === EXACT_TIME_VERSION && Array.isArray(value["steps"])) {
        return { ...value, version: SNAPSHOT_VERSION, steps: value["steps"].map(upgradeStepTime) };
    }
    return value;
}

function readSnapshot(storage: KeyValueStorage, key: string): StoreSnapshot {
    const raw = storage.getItem(key);
    if (raw === null) {
        return emptySnapshot();
    }
    const parsed = upgrade(JSON.parse(raw));
    if (!isSnapshot(parsed)) {
        throw new Error(`The data stored under "${key}" is not a timeline generator snapshot of version ${SNAPSHOT_VERSION}.`);
    }
    return parsed;
}

/**
 * A memory store written through to browser storage. The whole diagram sits in one entry, which suits
 * the few hundred records an incident carries and keeps the tool usable from a single HTML file.
 */
export class BrowserStorageTimelineStore implements TimelineStore {
    private readonly storage: KeyValueStorage;
    private readonly key: string;
    private readonly memory: MemoryTimelineStore;
    private depth = 0;

    constructor(storage: KeyValueStorage, key: string = DEFAULT_STORAGE_KEY) {
        this.storage = storage;
        this.key = key;
        this.memory = new MemoryTimelineStore(readSnapshot(storage, key));
    }

    snapshot(): StoreSnapshot {
        return this.memory.snapshot();
    }

    /**
     * Written once per outermost operation, so a transaction that fails half way never leaves half of
     * itself in storage.
     */
    private persist(): void {
        if (this.depth === 0) {
            this.storage.setItem(this.key, JSON.stringify(this.memory.snapshot()));
        }
    }

    private async write<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
        const result = await operation();
        this.persist();
        return result;
    }

    listIncidents(): Promise<Incident[]> {
        return this.memory.listIncidents();
    }

    findIncident(id: RecordId): Promise<Incident | null> {
        return this.memory.findIncident(id);
    }

    insertIncident(fields: IncidentFields): Promise<Incident> {
        return this.write(() => this.memory.insertIncident(fields));
    }

    updateIncident(incident: Incident): Promise<void> {
        return this.write(() => this.memory.updateIncident(incident));
    }

    deleteIncident(id: RecordId): Promise<void> {
        return this.write(() => this.memory.deleteIncident(id));
    }

    listNodes(incidentId: RecordId): Promise<NodeRecord[]> {
        return this.memory.listNodes(incidentId);
    }

    findNode(id: RecordId): Promise<NodeRecord | null> {
        return this.memory.findNode(id);
    }

    insertNode(data: NodeData): Promise<NodeRecord> {
        return this.write(() => this.memory.insertNode(data));
    }

    updateNode(node: NodeRecord): Promise<void> {
        return this.write(() => this.memory.updateNode(node));
    }

    deleteNode(id: RecordId): Promise<void> {
        return this.write(() => this.memory.deleteNode(id));
    }

    listSteps(incidentId: RecordId): Promise<StepRecord[]> {
        return this.memory.listSteps(incidentId);
    }

    findStep(id: RecordId): Promise<StepRecord | null> {
        return this.memory.findStep(id);
    }

    insertStep(data: StepData): Promise<StepRecord> {
        return this.write(() => this.memory.insertStep(data));
    }

    updateStep(step: StepRecord): Promise<void> {
        return this.write(() => this.memory.updateStep(step));
    }

    deleteStep(id: RecordId): Promise<void> {
        return this.write(() => this.memory.deleteStep(id));
    }

    listLinks(incidentId: RecordId): Promise<LinkRecord[]> {
        return this.memory.listLinks(incidentId);
    }

    findLink(id: RecordId): Promise<LinkRecord | null> {
        return this.memory.findLink(id);
    }

    insertLink(data: LinkData): Promise<LinkRecord> {
        return this.write(() => this.memory.insertLink(data));
    }

    updateLink(link: LinkRecord): Promise<void> {
        return this.write(() => this.memory.updateLink(link));
    }

    deleteLink(id: RecordId): Promise<void> {
        return this.write(() => this.memory.deleteLink(id));
    }

    listLayouts(incidentId: RecordId): Promise<LayoutRecord[]> {
        return this.memory.listLayouts(incidentId);
    }

    saveLayout(layout: LayoutRecord): Promise<void> {
        return this.write(() => this.memory.saveLayout(layout));
    }

    deleteLayout(nodeId: RecordId, representation: RepresentationKey): Promise<void> {
        return this.write(() => this.memory.deleteLayout(nodeId, representation));
    }

    async transaction<TResult>(work: () => Promise<TResult>): Promise<TResult> {
        this.depth += 1;
        try {
            return await this.memory.transaction(work);
        } finally {
            this.depth -= 1;
            this.persist();
        }
    }
}
