import type {
    AttackTactic,
    Audience,
    Confidence,
    DiamondVertex,
    Involvement,
    KillChainPhase,
    LinkKind,
    NodeCategory,
    NodeKind,
    Representation,
    ResponsePhase,
    Side,
    StepOutcome
} from "./enums.js";
import type { Catalog } from "./catalog.js";

export type RecordId = number;

/**
 * A key of the impact scale configured in the catalog. A string rather than an enum because each deployment
 * chooses its own levels; the service refuses any key its scale does not hold.
 */
export type ImpactLevel = string;

/**
 * A wall clock reading such as 2026-01-12T08:00:00, deliberately without a zone. Incident times are
 * copied from logs and reports, and moving them with the zone of whoever opens the diagram would put
 * a step logged at 09:00 somewhere else.
 */
export type WallClock = string;

export interface Incident {
    id: RecordId;
    title: string;
    referenceId: string | null;
    impact: ImpactLevel;
    /**
     * The organisation or business unit the incident belongs to. Benchmarks only compare incidents
     * sharing it.
     */
    scope: string | null;
    classifications: string[];
    /**
     * The identifier of the incident in the system that owns it, such as a ticket number, when incidents are
     * managed outside this tool.
     */
    externalId: string | null;
}

export type IncidentFields = Omit<Incident, "id">;
export type IncidentCreateInput = Pick<IncidentFields, "title"> & Partial<IncidentFields>;
export type IncidentUpdateInput = Partial<IncidentFields>;

/**
 * Anything that can appear as a box on a diagram: a person, a company, a host, a file, a piece of
 * malware. Actors and resources share one shape because every representation treats them alike.
 */
export interface NodeRecord {
    id: RecordId;
    incidentId: RecordId;
    name: string;
    description: string | null;
    kind: NodeKind;
    side: Side;
    /** Groups records inside a container, typically a company holding its people and its assets. */
    parentId: RecordId | null;
    /** Hostname, address, hash. Free text because what identifies a record depends on its kind. */
    identifier: string | null;
    role: string | null;
    criticality: ImpactLevel;
    compromised: boolean;
    /** Icon key overriding the default icon of the kind. */
    icon: string | null;
    /** CSS colour overriding the palette entry of the side. */
    colorOverride: string | null;
    /** A reference into the host application, such as the id of a known asset or observable. */
    externalId: string | null;
    /**
     * Normalized kind and identifier, so the same host or person can be matched across incidents.
     * Maintained by the service, never supplied by a caller.
     */
    canonicalKey: string | null;
}

export type NodeFields = Omit<NodeRecord, "id" | "incidentId" | "canonicalKey">;
export type NodeCreateInput = Pick<NodeFields, "name" | "kind"> & Partial<NodeFields>;
export type NodeUpdateInput = Partial<NodeFields>;

export interface StepInvolvement {
    nodeId: RecordId;
    involvement: Involvement;
}

/**
 * One thing that happened during the incident, by one party, usually to something.
 */
export interface StepRecord {
    id: RecordId;
    incidentId: RecordId;
    timestamp: WallClock;
    /** Set when the step spans a period rather than an instant, such as an exfiltration lasting hours. */
    endTimestamp: WallClock | null;
    /**
     * Incidents are often reconstructed from records that only carry the day. The timestamp still
     * holds one, and this says not to show the clock time.
     */
    timeKnown: boolean;
    /** Breaks ties between steps sharing a timestamp, which is common when only the day is known. */
    orderIndex: number;
    title: string;
    description: string | null;
    side: Side;
    attackTactic: AttackTactic;
    responsePhase: ResponsePhase;
    mitreTechniqueId: string | null;
    severity: ImpactLevel;
    confidence: Confidence;
    outcome: StepOutcome;
    audience: Audience;
    /** Where the evidence came from, such as EDR, SIEM or a user report. */
    evidenceSource: string | null;
    /** Marks the handful of steps that carry the story, so crowded views can drop the rest. */
    isMilestone: boolean;
    icon: string | null;
    sourceNodeId: RecordId | null;
    targetNodeId: RecordId | null;
    involvements: StepInvolvement[];
    tags: string[];
}

export type StepFields = Omit<StepRecord, "id" | "incidentId">;
export type StepCreateInput = Pick<StepFields, "title" | "timestamp"> & Partial<StepFields>;
export type StepUpdateInput = Partial<StepFields>;

/**
 * A standing relationship between two records, independent of the chronology carried by the steps.
 */
export interface LinkRecord {
    id: RecordId;
    incidentId: RecordId;
    sourceNodeId: RecordId;
    targetNodeId: RecordId;
    kind: LinkKind;
    /** Overrides the default wording of the kind on the edge. */
    label: string | null;
    confidence: Confidence;
    /** The step that established the relationship, if any. */
    stepId: RecordId | null;
}

export type LinkFields = Omit<LinkRecord, "id" | "incidentId">;
export type LinkCreateInput = Pick<LinkFields, "sourceNodeId" | "targetNodeId"> & Partial<LinkFields>;
export type LinkUpdateInput = Partial<LinkFields>;

/**
 * A position an analyst dragged a record to in one representation.
 */
export interface LayoutRecord {
    nodeId: RecordId;
    representation: Representation;
    x: number;
    y: number;
}

/**
 * A null X and Y clears the pin and hands the record back to the automatic layout.
 */
export interface LayoutInput {
    nodeId: RecordId;
    representation: Representation;
    x: number | null;
    y: number | null;
}

export interface NodePlacement {
    representation: Representation;
    x: number;
    y: number;
}

export type DiagramNode = Omit<NodeRecord, "incidentId" | "canonicalKey"> & {
    category: NodeCategory;
    diamondVertex: DiamondVertex;
    placements: NodePlacement[];
};

export type DiagramStep = Omit<StepRecord, "incidentId"> & {
    killChainPhase: KillChainPhase;
};

export type DiagramLink = Omit<LinkRecord, "incidentId">;

/**
 * Durations computed from the steps: the first attacker action, and the first detection, containment,
 * eradication and recovery recorded by the defenders.
 */
export interface ResponseMetrics {
    firstAttackerAction: WallClock | null;
    firstDefenderAction: WallClock | null;
    detection: WallClock | null;
    containment: WallClock | null;
    eradication: WallClock | null;
    recovery: WallClock | null;
    dwellHours: number | null;
    timeToDetectHours: number | null;
    timeToContainHours: number | null;
    timeToRecoverHours: number | null;
}

/**
 * The same durations across the incidents handled before this one, so a figure on a slide has
 * something to be measured against.
 */
export interface ResponseBenchmark {
    sampleSize: number;
    scope: string | null;
    medianDwellHours: number | null;
    medianTimeToDetectHours: number | null;
    medianTimeToContainHours: number | null;
    medianTimeToRecoverHours: number | null;
}

/**
 * The whole diagram in one payload. Every representation is drawn from this and nothing else, so
 * adding a representation never means adding an endpoint.
 */
export interface Diagram {
    incident: Incident;
    nodes: DiagramNode[];
    steps: DiagramStep[];
    links: DiagramLink[];
    metrics: ResponseMetrics;
    benchmark: ResponseBenchmark;
    catalog: Catalog;
}
