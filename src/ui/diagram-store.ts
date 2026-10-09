// Holds the diagram in memory, indexes the catalog served with it and tells listeners when something
// changed. Every renderer and every panel reads from here and never from the network.

import { impactLevelsOf } from "../core/catalog.js";
import type {
    AttackTacticInfo,
    Catalog,
    ImpactLevelInfo,
    KillChainPhaseInfo,
    LinkKindInfo,
    NodeKindInfo,
    OptionInfo,
    OutcomeInfo,
    RepresentationInfo,
    ResponsePhaseInfo,
    SideInfo
} from "../core/catalog.js";
import {
    AttackTactic,
    Audience,
    Disclosure,
    OutcomeMeaning,
    RecordType,
    Representation,
    ResponseStage,
    SideRole,
    type AttackTacticKey,
    type AudienceKey,
    type ConfidenceKey,
    type InvolvementKey,
    type KillChainPhaseKey,
    type LinkKindKey,
    type NodeKindKey,
    type OutcomeKey,
    type ResponsePhaseKey,
    type SideKey
} from "../core/enums.js";
import type {
    Diagram,
    DiagramLink,
    DiagramNode,
    DiagramStep,
    Incident,
    LinkUpdateInput,
    NodeUpdateInput,
    RecordId,
    ResponseBenchmark,
    ResponseMetrics,
    StepUpdateInput
} from "../core/models.js";
import { Vocabulary } from "../core/vocabulary.js";
import { parseWallClock } from "../core/time.js";
import type { Point } from "./viewport.js";
import { summarise, type DiagramSummary } from "../core/summary.js";
import type { RepresentationKey } from "../core/enums.js";

/**
 * A step with its moments parsed once, so renderers compare dates rather than strings.
 */
export interface TimelineStep extends DiagramStep {
    at: Date | null;
    until: Date | null;
}

export interface Selection {
    type: RecordType;
    id: RecordId;
}

export interface StepFilters {
    /** One audience of the catalog, or Both for every step. */
    audience: AudienceKey;
    milestonesOnly: boolean;
    sides: ReadonlySet<SideKey> | null;
    /** How much of the names the views and exports show. Kept with the audience, being a choice of view too. */
    disclosure: Disclosure;
}

export enum StoreChange {
    Load = "load",
    Selection = "selection",
    Filters = "filters",
    Records = "records"
}

interface LoadedDiagram {
    incident: Incident;
    nodes: DiagramNode[];
    steps: TimelineStep[];
    links: DiagramLink[];
    metrics: ResponseMetrics;
    benchmark: ResponseBenchmark;
    catalog: Catalog;
}

function indexBy<TKey, TValue>(entries: readonly TValue[], key: (entry: TValue) => TKey): Map<TKey, TValue> {
    return new Map(entries.map(entry => [key(entry), entry]));
}

function timed(step: DiagramStep): TimelineStep {
    return { ...step, at: parseWallClock(step.timestamp), until: parseWallClock(step.endTimestamp) };
}

export function withoutMoments(step: TimelineStep): DiagramStep {
    const { at, until, ...rest } = step;
    return rest;
}

function chronological(a: TimelineStep, b: TimelineStep): number {
    return ((a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)) || (a.orderIndex - b.orderIndex) || (a.id - b.id);
}

/**
 * Applies a patch to a record held here and returns what the patched fields held before.
 */
function swap<TRecord extends object>(record: TRecord, patch: Partial<TRecord>): Partial<TRecord> {
    const previous: Partial<TRecord> = {};
    for (const key in patch) {
        if (patch[key] !== undefined) {
            previous[key] = record[key];
        }
    }
    Object.assign(record, patch);
    return previous;
}

export class DiagramStore {
    selection: Selection | null = null;
    filters: StepFilters = { audience: Audience.Both, milestonesOnly: false, sides: null, disclosure: Disclosure.Full };

    private loaded: LoadedDiagram | null = null;
    private readonly listeners = new Set<(change: StoreChange) => void>();
    private words: Vocabulary | null = null;
    private representations = new Map<RepresentationKey, RepresentationInfo>();
    private nodesById = new Map<RecordId, DiagramNode>();

    subscribe(listener: (change: StoreChange) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(change: StoreChange): void {
        this.listeners.forEach(listener => listener(change));
    }

    load(diagram: Diagram): void {
        const catalog = diagram.catalog;
        this.words = new Vocabulary(catalog);
        this.representations = indexBy(catalog.representations, entry => entry.representation);
        this.nodesById = indexBy(diagram.nodes, entry => entry.id);

        this.loaded = { ...diagram, steps: diagram.steps.map(timed).sort(chronological) };
        this.emit(StoreChange.Load);
    }

    get isLoaded(): boolean {
        return this.loaded !== null;
    }

    private get diagram(): LoadedDiagram {
        if (!this.loaded) {
            throw new Error("The diagram has not been loaded yet.");
        }
        return this.loaded;
    }

    get incident(): Incident {
        return this.diagram.incident;
    }

    get catalog(): Catalog {
        return this.diagram.catalog;
    }

    /** The catalog read by key, answering a key it no longer has as unknown. */
    get vocabulary(): Vocabulary {
        if (!this.words) {
            throw new Error("The diagram has not been loaded yet.");
        }
        return this.words;
    }

    get nodes(): readonly DiagramNode[] {
        return this.loaded ? this.loaded.nodes : [];
    }

    get steps(): readonly TimelineStep[] {
        return this.loaded ? this.loaded.steps : [];
    }

    get links(): readonly DiagramLink[] {
        return this.loaded ? this.loaded.links : [];
    }

    /**
     * Every tag written on a step of this incident, once each, so a field can offer what is already in use
     * rather than let the same word be spelled two ways.
     */
    get tags(): readonly string[] {
        const seen = new Set<string>();
        this.steps.forEach(step => step.tags.forEach(tag => seen.add(tag)));
        return [...seen].sort((left, right) => left.localeCompare(right));
    }

    get metrics(): ResponseMetrics {
        return this.diagram.metrics;
    }

    get benchmark(): ResponseBenchmark {
        return this.diagram.benchmark;
    }

    get isEmpty(): boolean {
        return this.nodes.length === 0 && this.steps.length === 0;
    }

    node(id: RecordId | null): DiagramNode | null {
        return id === null ? null : this.nodesById.get(id) ?? null;
    }

    step(id: RecordId): TimelineStep | null {
        return this.steps.find(step => step.id === id) ?? null;
    }

    link(id: RecordId): DiagramLink | null {
        return this.links.find(link => link.id === id) ?? null;
    }

    kindInfo(kind: NodeKindKey): NodeKindInfo {
        return this.vocabulary.nodeKind(kind);
    }

    sideInfo(side: SideKey): SideInfo {
        return this.vocabulary.side(side);
    }

    sideRole(side: SideKey): SideRole {
        return this.vocabulary.sideRole(side);
    }

    tacticInfo(tactic: AttackTacticKey): AttackTacticInfo {
        return this.vocabulary.tactic(tactic);
    }

    killChainInfo(phase: KillChainPhaseKey): KillChainPhaseInfo {
        return this.vocabulary.killChainPhase(phase);
    }

    responseInfo(phase: ResponsePhaseKey): ResponsePhaseInfo {
        return this.vocabulary.responsePhase(phase);
    }

    responseStage(phase: ResponsePhaseKey): ResponseStage {
        return this.vocabulary.responseStage(phase);
    }

    linkKindInfo(kind: LinkKindKey): LinkKindInfo {
        return this.vocabulary.linkKind(kind);
    }

    outcomeInfo(outcome: OutcomeKey): OutcomeInfo {
        return this.vocabulary.outcome(outcome);
    }

    outcomeMeaning(outcome: OutcomeKey): OutcomeMeaning {
        return this.vocabulary.outcomeMeaning(outcome);
    }

    confidenceInfo(confidence: ConfidenceKey): OptionInfo<ConfidenceKey> {
        return this.vocabulary.confidence(confidence);
    }

    involvementInfo(involvement: InvolvementKey): OptionInfo<InvolvementKey> {
        return this.vocabulary.involvement(involvement);
    }

    audienceInfo(audience: AudienceKey): OptionInfo<AudienceKey> {
        return this.vocabulary.audience(audience);
    }

    impactLevel(level: string): ImpactLevelInfo | null {
        return impactLevelsOf(this.catalog.impactScale).find(entry => entry.level === level) ?? null;
    }

    isAssessed(level: string): boolean {
        return level !== this.catalog.impactScale.unassessed.level;
    }

    /**
     * Where a level sits on the scale, the least severe being 0. Unassessed and unknown levels rank below all.
     */
    impactRank(level: string): number {
        return this.catalog.impactScale.levels.findIndex(entry => entry.level === level);
    }

    representationInfo(representation: RepresentationKey): RepresentationInfo {
        const found = this.representations.get(representation);
        if (!found) {
            throw new Error(`The catalog has no representation named ${representation}. A representation of your own must be declared in CatalogOptions.representations.`);
        }
        return found;
    }

    nodeIcon(node: DiagramNode): string {
        return node.icon ?? this.kindInfo(node.kind).icon;
    }

    stepIcon(step: DiagramStep): string {
        if (step.icon) return step.icon;
        if (this.sideRole(step.side) === SideRole.Defender) return this.responseInfo(step.responsePhase).icon;
        if (step.attackTactic !== AttackTactic.None) return this.tacticInfo(step.attackTactic).icon;
        return this.sideInfo(step.side).icon;
    }

    /**
     * Steps the current filters let through, always in chronological order.
     */
    visibleSteps(): TimelineStep[] {
        return this.steps.filter(step => {
            if (this.filters.milestonesOnly && !step.isMilestone) return false;
            // A step listing no audience is written for everyone, so every audience sees it
            if (this.filters.audience !== Audience.Both && step.audiences.length > 0 && !step.audiences.includes(this.filters.audience)) return false;
            if (this.filters.sides && !this.filters.sides.has(step.side)) return false;
            return true;
        });
    }

    /**
     * Records worth drawing on a diagram of actions: everything an unfiltered step touches, plus the
     * groups holding them so a company never loses its box.
     */
    visibleNodes(): DiagramNode[] {
        if (this.filters.audience === Audience.Both && !this.filters.milestonesOnly && !this.filters.sides) {
            return [...this.nodes];
        }

        const keep = new Set<RecordId>();
        this.visibleSteps().forEach(step => {
            if (step.sourceNodeId !== null) keep.add(step.sourceNodeId);
            if (step.targetNodeId !== null) keep.add(step.targetNodeId);
            step.involvements.forEach(involvement => keep.add(involvement.nodeId));
        });

        const withParents = new Set(keep);
        keep.forEach(id => {
            let current = this.node(id);
            while (current && current.parentId !== null && !withParents.has(current.parentId)) {
                withParents.add(current.parentId);
                current = this.node(current.parentId);
            }
        });
        return this.nodes.filter(node => withParents.has(node.id));
    }

    placement(node: DiagramNode, representation: Representation): Point | null {
        const found = node.placements.find(placement => placement.representation === representation);
        return found ? { x: found.x, y: found.y } : null;
    }

    setSelection(selection: Selection | null): void {
        this.selection = selection;
        this.emit(StoreChange.Selection);
    }

    /** What the loaded diagram holds, counted. Reads the whole diagram, not the filtered view. */
    get summary(): DiagramSummary {
        return summarise(this.diagram);
    }

    /** The loaded diagram as the service served it, edits included, with steps in chronological order. */
    get snapshot(): Diagram {
        return { ...this.diagram, steps: this.diagram.steps.map(withoutMoments) };
    }

    /**
     * Another store holding a rewritten copy of this diagram, with the same filters and selection. The copy
     * answers nothing back: whoever made it decides what flows between the two.
     */
    disclosed(rewrite: (diagram: Diagram) => Diagram): DiagramStore {
        const copy = new DiagramStore();
        copy.load(rewrite(this.snapshot));
        copy.filters = this.filters;
        copy.selection = this.selection;
        return copy;
    }

    setFilters(filters: Partial<StepFilters>): void {
        this.filters = { ...this.filters, ...filters };
        this.emit(StoreChange.Filters);
    }

    /**
     * Applies an edit to the record already held here. Edits are shown straight away and saved behind
     * the scenes, which is what keeps an open form and its scroll position untouched.
     */
    patchNode(id: RecordId, patch: NodeUpdateInput): NodeUpdateInput | null {
        const node = this.node(id);
        if (!node) return null;
        const previous = swap(node, patch);
        node.category = this.vocabulary.categoryOf(node.kind);
        node.diamondVertex = this.vocabulary.diamondVertexOf(node.kind, node.side);
        this.emit(StoreChange.Records);
        return previous;
    }

    patchStep(id: RecordId, patch: StepUpdateInput): StepUpdateInput | null {
        const step = this.step(id);
        if (!step) return null;
        const previous = swap(step, patch);
        step.at = parseWallClock(step.timestamp);
        step.until = parseWallClock(step.endTimestamp);
        step.killChainPhase = this.vocabulary.killChainPhaseOf(step.attackTactic);
        this.diagram.steps.sort(chronological);
        this.emit(StoreChange.Records);
        return previous;
    }

    patchLink(id: RecordId, patch: LinkUpdateInput): LinkUpdateInput | null {
        const link = this.link(id);
        if (!link) return null;
        const previous = swap(link, patch);
        this.emit(StoreChange.Records);
        return previous;
    }

    setPlacement(nodeId: RecordId, representation: RepresentationKey, position: Point | null): void {
        const node = this.node(nodeId);
        if (!node) return;
        node.placements = node.placements.filter(placement => placement.representation !== representation);
        if (position) {
            node.placements.push({ representation, x: position.x, y: position.y });
        }
    }
}
