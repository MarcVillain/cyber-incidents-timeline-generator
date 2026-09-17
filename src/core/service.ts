import { buildCatalog, canonicalKeyOf, checkImpactScale, type Catalog, type ImpactScale } from "./catalog.js";
import { NotFoundError, ValidationError } from "./errors.js";
import { toDiagramLink, toDiagramNode, toDiagramStep } from "./mapping.js";
import { DEFAULT_BENCHMARK_SAMPLE_SIZE, buildBenchmark, buildMetrics, type MeasuredIncident } from "./metrics.js";
import type {
    Diagram,
    DiagramLink,
    DiagramNode,
    DiagramStep,
    Incident,
    IncidentCreateInput,
    IncidentUpdateInput,
    LayoutInput,
    LinkCreateInput,
    LinkFields,
    LinkRecord,
    LinkUpdateInput,
    NodeCreateInput,
    NodeRecord,
    NodeUpdateInput,
    RecordId,
    StepCreateInput,
    StepFields,
    StepRecord,
    StepUpdateInput
} from "./models.js";
import type { TimelineStore } from "./store.js";
import { parseWallClock } from "./time.js";
import { summarise, type DiagramSummary } from "./summary.js";
import {
    checkStepTimes,
    readIncidentCreate,
    readIncidentUpdate,
    readLayouts,
    readLinkCreate,
    readLinkUpdate,
    readNodeCreate,
    readNodeUpdate,
    readStepCreate,
    readStepUpdate,
    ValidationRules
} from "./validation.js";

/**
 * Everything the workspace asks of whatever keeps its data. Implemented in process by TimelineService
 * and over the network by HttpTimelineApi, so the same workspace runs on either without knowing which.
 *
 * Every operation on a record carries the incident it belongs to, so a caller can never reach across
 * incidents by guessing an identifier.
 */
export interface TimelineApi {
    listIncidents(): Promise<Incident[]>;
    getIncident(incidentId: RecordId): Promise<Incident>;
    createIncident(input: IncidentCreateInput): Promise<Incident>;
    updateIncident(incidentId: RecordId, input: IncidentUpdateInput): Promise<void>;
    deleteIncident(incidentId: RecordId): Promise<void>;

    getDiagram(incidentId: RecordId): Promise<Diagram>;
    getCatalog(): Promise<Catalog>;

    /** What the incident holds, counted. The same figures the diagram would draw, without drawing it. */
    getSummary(incidentId: RecordId): Promise<DiagramSummary>;

    createNode(incidentId: RecordId, input: NodeCreateInput): Promise<DiagramNode>;
    updateNode(incidentId: RecordId, nodeId: RecordId, input: NodeUpdateInput): Promise<void>;
    /** Removes the record and the records grouped under it. Steps keep existing without their author or target. */
    deleteNode(incidentId: RecordId, nodeId: RecordId): Promise<void>;

    createStep(incidentId: RecordId, input: StepCreateInput): Promise<DiagramStep>;
    updateStep(incidentId: RecordId, stepId: RecordId, input: StepUpdateInput): Promise<void>;
    /** Removes the step and the relationships it established. */
    deleteStep(incidentId: RecordId, stepId: RecordId): Promise<void>;

    createLink(incidentId: RecordId, input: LinkCreateInput): Promise<DiagramLink>;
    updateLink(incidentId: RecordId, linkId: RecordId, input: LinkUpdateInput): Promise<void>;
    deleteLink(incidentId: RecordId, linkId: RecordId): Promise<void>;

    saveLayout(incidentId: RecordId, layouts: LayoutInput[]): Promise<void>;
}

export interface TimelineServiceOptions {
    /** Replaces the built in vocabulary, for example to relabel or recolour entries. */
    catalog?: Catalog;
    /** The levels incidents, records and steps are rated on. Overrides the scale of the catalog when both are given. */
    impactScale?: ImpactScale;
    benchmarkSampleSize?: number;
}

function byId<TRecord extends { id: RecordId }>(a: TRecord, b: TRecord): number {
    return a.id - b.id;
}

function chronologically(a: StepRecord, b: StepRecord): number {
    const time = (step: StepRecord): number => parseWallClock(step.timestamp)?.getTime() ?? 0;
    return (time(a) - time(b)) || (a.orderIndex - b.orderIndex) || (a.id - b.id);
}

function invalid(field: string, message: string, code?: string): ValidationError {
    return new ValidationError([{ field, message, ...(code ? { code } : {}) }]);
}

/**
 * The rules of the diagram, independent of where it is stored: validation, the integrity of references
 * between records, cascades on delete, and the response figures served with every diagram.
 */
export class TimelineService implements TimelineApi {
    private readonly store: TimelineStore;
    private readonly catalog: Catalog;
    private readonly rules: ValidationRules;
    private readonly benchmarkSampleSize: number;

    constructor(store: TimelineStore, options: TimelineServiceOptions = {}) {
        this.store = store;
        const catalog = structuredClone(options.catalog ?? buildCatalog());
        if (options.impactScale) {
            catalog.impactScale = structuredClone(options.impactScale);
        }
        checkImpactScale(catalog.impactScale);
        this.catalog = catalog;
        this.rules = new ValidationRules(catalog);
        this.benchmarkSampleSize = options.benchmarkSampleSize ?? DEFAULT_BENCHMARK_SAMPLE_SIZE;
    }

    async listIncidents(): Promise<Incident[]> {
        const incidents = await this.store.listIncidents();
        return incidents.sort(byId);
    }

    async getIncident(incidentId: RecordId): Promise<Incident> {
        return this.requireIncident(incidentId);
    }

    async createIncident(input: IncidentCreateInput): Promise<Incident> {
        const fields = readIncidentCreate(input, this.rules);
        return this.store.insertIncident(fields);
    }

    async updateIncident(incidentId: RecordId, input: IncidentUpdateInput): Promise<void> {
        const patch = readIncidentUpdate(input, this.rules);
        await this.store.transaction(async () => {
            const incident = await this.requireIncident(incidentId);
            await this.store.updateIncident({ ...incident, ...patch });
        });
    }

    async deleteIncident(incidentId: RecordId): Promise<void> {
        await this.store.transaction(async () => {
            await this.requireIncident(incidentId);
            await this.store.deleteIncident(incidentId);
        });
    }

    async getCatalog(): Promise<Catalog> {
        return structuredClone(this.catalog);
    }

    async getSummary(incidentId: RecordId): Promise<DiagramSummary> {
        return summarise(await this.getDiagram(incidentId));
    }

    async getDiagram(incidentId: RecordId): Promise<Diagram> {
        return this.store.transaction(async () => {
            const incident = await this.requireIncident(incidentId);
            const nodes = await this.store.listNodes(incidentId);
            const layouts = await this.store.listLayouts(incidentId);
            const steps = (await this.store.listSteps(incidentId)).sort(chronologically);
            const links = await this.store.listLinks(incidentId);
            const metrics = buildMetrics(steps);

            // Only incidents of the same scope can enter the benchmark, so only their steps are read
            const peers: MeasuredIncident[] = [];
            for (const peer of await this.store.listIncidents()) {
                if (peer.id === incidentId || peer.scope !== incident.scope) continue;
                peers.push({ incident: peer, metrics: buildMetrics(await this.store.listSteps(peer.id)) });
            }

            return {
                incident,
                nodes: nodes.sort(byId).map(node => toDiagramNode(node, layouts)),
                steps: steps.map(toDiagramStep),
                links: links.sort(byId).map(toDiagramLink),
                metrics,
                benchmark: buildBenchmark({ incident, metrics }, peers, this.benchmarkSampleSize),
                catalog: structuredClone(this.catalog)
            };
        });
    }

    async createNode(incidentId: RecordId, input: NodeCreateInput): Promise<DiagramNode> {
        const fields = readNodeCreate(input, this.rules);
        return this.store.transaction(async () => {
            await this.requireIncident(incidentId);
            await this.checkParent(incidentId, null, fields.parentId);
            const record = await this.store.insertNode({
                ...fields,
                incidentId,
                canonicalKey: canonicalKeyOf(fields.kind, fields.identifier, fields.name)
            });
            return toDiagramNode(record, []);
        });
    }

    async updateNode(incidentId: RecordId, nodeId: RecordId, input: NodeUpdateInput): Promise<void> {
        const patch = readNodeUpdate(input, this.rules);
        await this.store.transaction(async () => {
            const node = await this.requireNode(incidentId, nodeId);
            const merged: NodeRecord = { ...node, ...patch };
            if (patch.parentId !== undefined) {
                await this.checkParent(incidentId, nodeId, merged.parentId);
            }
            merged.canonicalKey = canonicalKeyOf(merged.kind, merged.identifier, merged.name);
            await this.store.updateNode(merged);
        });
    }

    async deleteNode(incidentId: RecordId, nodeId: RecordId): Promise<void> {
        await this.store.transaction(async () => {
            await this.requireNode(incidentId, nodeId);
            const nodes = await this.store.listNodes(incidentId);
            const removed = descendantsOf(nodes, nodeId);

            for (const step of await this.store.listSteps(incidentId)) {
                const cleaned = withoutNodes(step, removed);
                if (cleaned) {
                    await this.store.updateStep(cleaned);
                }
            }
            for (const link of await this.store.listLinks(incidentId)) {
                if (removed.has(link.sourceNodeId) || removed.has(link.targetNodeId)) {
                    await this.store.deleteLink(link.id);
                }
            }
            // Deepest first, so no record ever points at a parent that is already gone
            for (const id of [...removed].reverse()) {
                await this.store.deleteNode(id);
            }
        });
    }

    async createStep(incidentId: RecordId, input: StepCreateInput): Promise<DiagramStep> {
        const fields = readStepCreate(input, this.rules);
        return this.store.transaction(async () => {
            await this.requireIncident(incidentId);
            await this.checkStepReferences(incidentId, fields);
            await this.checkMilestoneKey(incidentId, fields.milestoneKey, null);
            const record = await this.store.insertStep({ ...fields, incidentId });
            return toDiagramStep(record);
        });
    }

    async updateStep(incidentId: RecordId, stepId: RecordId, input: StepUpdateInput): Promise<void> {
        const patch = readStepUpdate(input, this.rules);
        await this.store.transaction(async () => {
            const step = await this.requireStep(incidentId, stepId);
            const merged: StepRecord = { ...step, ...patch };
            checkStepTimes(merged);
            await this.checkStepReferences(incidentId, merged);
            await this.checkMilestoneKey(incidentId, merged.milestoneKey, stepId);
            await this.store.updateStep(merged);
        });
    }

    async deleteStep(incidentId: RecordId, stepId: RecordId): Promise<void> {
        await this.store.transaction(async () => {
            await this.requireStep(incidentId, stepId);
            for (const link of await this.store.listLinks(incidentId)) {
                if (link.stepId === stepId) {
                    await this.store.deleteLink(link.id);
                }
            }
            await this.store.deleteStep(stepId);
        });
    }

    async createLink(incidentId: RecordId, input: LinkCreateInput): Promise<DiagramLink> {
        const fields = readLinkCreate(input);
        return this.store.transaction(async () => {
            await this.requireIncident(incidentId);
            await this.checkLinkReferences(incidentId, fields);
            const record = await this.store.insertLink({ ...fields, incidentId });
            return toDiagramLink(record);
        });
    }

    async updateLink(incidentId: RecordId, linkId: RecordId, input: LinkUpdateInput): Promise<void> {
        const patch = readLinkUpdate(input);
        await this.store.transaction(async () => {
            const link = await this.requireLink(incidentId, linkId);
            const merged = { ...link, ...patch };
            await this.checkLinkReferences(incidentId, merged);
            await this.store.updateLink(merged);
        });
    }

    async deleteLink(incidentId: RecordId, linkId: RecordId): Promise<void> {
        await this.store.transaction(async () => {
            await this.requireLink(incidentId, linkId);
            await this.store.deleteLink(linkId);
        });
    }

    async saveLayout(incidentId: RecordId, layouts: LayoutInput[]): Promise<void> {
        const entries = readLayouts(layouts);
        await this.store.transaction(async () => {
            await this.requireIncident(incidentId);
            const owned = new Set((await this.store.listNodes(incidentId)).map(node => node.id));
            const foreign = entries.find(entry => !owned.has(entry.nodeId));
            if (foreign) {
                throw invalid("layouts", `record ${foreign.nodeId} does not belong to incident ${incidentId}`);
            }

            for (const entry of entries) {
                if (entry.x === null || entry.y === null) {
                    await this.store.deleteLayout(entry.nodeId, entry.representation);
                } else {
                    await this.store.saveLayout({ nodeId: entry.nodeId, representation: entry.representation, x: entry.x, y: entry.y });
                }
            }
        });
    }

    private async requireIncident(incidentId: RecordId): Promise<Incident> {
        const incident = await this.store.findIncident(incidentId);
        if (!incident) {
            throw new NotFoundError(`Incident ${incidentId} does not exist.`);
        }
        return incident;
    }

    private async requireNode(incidentId: RecordId, nodeId: RecordId): Promise<NodeRecord> {
        const node = await this.store.findNode(nodeId);
        if (!node || node.incidentId !== incidentId) {
            throw new NotFoundError(`Record ${nodeId} does not exist in incident ${incidentId}.`);
        }
        return node;
    }

    private async requireStep(incidentId: RecordId, stepId: RecordId): Promise<StepRecord> {
        const step = await this.store.findStep(stepId);
        if (!step || step.incidentId !== incidentId) {
            throw new NotFoundError(`Step ${stepId} does not exist in incident ${incidentId}.`);
        }
        return step;
    }

    private async requireLink(incidentId: RecordId, linkId: RecordId): Promise<LinkRecord> {
        const link = await this.store.findLink(linkId);
        if (!link || link.incidentId !== incidentId) {
            throw new NotFoundError(`Relationship ${linkId} does not exist in incident ${incidentId}.`);
        }
        return link;
    }

    /**
     * A group has to belong to the same incident, and a record cannot end up inside itself.
     */
    private async checkParent(incidentId: RecordId, nodeId: RecordId | null, parentId: RecordId | null): Promise<void> {
        if (parentId === null) return;

        const nodes = new Map((await this.store.listNodes(incidentId)).map(node => [node.id, node]));
        if (!nodes.has(parentId)) {
            throw invalid("parentId", "must be a record of the same incident");
        }

        let current: RecordId | null = parentId;
        const seen = new Set<RecordId>();
        while (current !== null && !seen.has(current)) {
            if (current === nodeId) {
                throw invalid("parentId", "would place the record inside itself");
            }
            seen.add(current);
            current = nodes.get(current)?.parentId ?? null;
        }
    }

    /**
     * A named milestone belongs to one step. A second claim is refused naming the step that holds it,
     * rather than one quietly displacing the other.
     */
    private async checkMilestoneKey(incidentId: RecordId, key: string | null, stepId: RecordId | null): Promise<void> {
        if (key === null) return;
        const holder = (await this.store.listSteps(incidentId)).find(step => step.milestoneKey === key && step.id !== stepId);
        if (holder) {
            throw invalid("milestoneKey", `is already held by step ${holder.id}`, "milestone_taken");
        }
    }

    private async checkStepReferences(incidentId: RecordId, step: Pick<StepFields, "sourceNodeId" | "targetNodeId" | "involvements">): Promise<void> {
        const owned = new Set((await this.store.listNodes(incidentId)).map(node => node.id));
        const foreign = (field: string, id: RecordId | null): void => {
            if (id !== null && !owned.has(id)) {
                throw invalid(field, `record ${id} does not belong to incident ${incidentId}`);
            }
        };

        foreign("sourceNodeId", step.sourceNodeId);
        foreign("targetNodeId", step.targetNodeId);
        step.involvements.forEach(entry => foreign("involvements", entry.nodeId));
    }

    private async checkLinkReferences(incidentId: RecordId, link: LinkFields): Promise<void> {
        const owned = new Set((await this.store.listNodes(incidentId)).map(node => node.id));
        if (!owned.has(link.sourceNodeId) || !owned.has(link.targetNodeId)) {
            throw invalid("sourceNodeId", "both ends of a relationship must be records of the same incident");
        }
        if (link.stepId !== null) {
            const step = await this.store.findStep(link.stepId);
            if (!step || step.incidentId !== incidentId) {
                throw invalid("stepId", "must be a step of the same incident");
            }
        }
    }
}

/**
 * The record and everything grouped under it, parents before their members.
 */
function descendantsOf(nodes: readonly NodeRecord[], rootId: RecordId): Set<RecordId> {
    const found = new Set<RecordId>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
        const current = queue.shift();
        nodes.filter(node => node.parentId === current && !found.has(node.id)).forEach(child => {
            found.add(child.id);
            queue.push(child.id);
        });
    }
    return found;
}

/**
 * The step with every mention of the removed records taken out, or null when it never mentioned them.
 */
function withoutNodes(step: StepRecord, removed: ReadonlySet<RecordId>): StepRecord | null {
    const sourceGone = step.sourceNodeId !== null && removed.has(step.sourceNodeId);
    const targetGone = step.targetNodeId !== null && removed.has(step.targetNodeId);
    const involvements = step.involvements.filter(entry => !removed.has(entry.nodeId));

    if (!sourceGone && !targetGone && involvements.length === step.involvements.length) {
        return null;
    }
    return {
        ...step,
        sourceNodeId: sourceGone ? null : step.sourceNodeId,
        targetNodeId: targetGone ? null : step.targetNodeId,
        involvements
    };
}
