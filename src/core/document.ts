// A whole timeline as one portable file. Ids are database ids, so they mean nothing anywhere else: a
// document addresses its records by a key of its own and carries no incident id, no database and no
// deployment, which is what lets one instance hand a timeline to another.

import { canonicalKeyOf } from "./catalog.js";
import { Confidence, Involvement, LinkKind } from "./enums.js";
import { ValidationError, type ValidationIssue } from "./errors.js";
import {
    DEFAULT_VALIDATION_RULES,
    FieldLimits,
    FieldReader,
    ValidationRules,
    readIncidentCreate,
    readNodeCreate,
    readStepCreate
} from "./validation.js";
import type {
    Diagram,
    DiagramLink,
    DiagramNode,
    DiagramStep,
    Incident,
    LinkFields,
    Metadata,
    NodeFields,
    RecordId,
    StepFields,
    StepInvolvement
} from "./models.js";

export const DOCUMENT_FORMAT = "cyber-incidents-timeline";
export const DOCUMENT_VERSION = 1;

/** A record's name inside the document. Stable across instances, meaningless outside the file. */
export type DocumentKey = string;

export interface DocumentIncident {
    title: string;
    referenceId: string | null;
    impact: string;
    scope: string | null;
    classifications: string[];
    externalId: string | null;
    metadata: Metadata | null;
}

export interface DocumentNode extends Omit<NodeFields, "parentId"> {
    key: DocumentKey;
    parent: DocumentKey | null;
}

export interface DocumentInvolvement extends Omit<StepInvolvement, "nodeId"> {
    node: DocumentKey;
}

export interface DocumentStep extends Omit<StepFields, "sourceNodeId" | "targetNodeId" | "involvements"> {
    key: DocumentKey;
    source: DocumentKey | null;
    target: DocumentKey | null;
    involvements: DocumentInvolvement[];
}

export interface DocumentLink extends Omit<LinkFields, "sourceNodeId" | "targetNodeId" | "stepId"> {
    key: DocumentKey;
    source: DocumentKey;
    target: DocumentKey;
    step: DocumentKey | null;
}

export interface DocumentLayout {
    node: DocumentKey;
    representation: string;
    x: number;
    y: number;
}

export interface TimelineDocument {
    format: typeof DOCUMENT_FORMAT;
    version: number;
    /** When the file was written, for a reader deciding which of two copies is newer. */
    exportedAt: string;
    incident: DocumentIncident;
    nodes: DocumentNode[];
    steps: DocumentStep[];
    links: DocumentLink[];
    layouts: DocumentLayout[];
}

/**
 * A record is named after what identifies it, which is what lets an import recognise the same host or
 * the same person arriving a second time. Anything with nothing to be named after falls back to its place
 * in the file.
 */
function nodeKeys(nodes: readonly DiagramNode[]): Map<RecordId, DocumentKey> {
    return new Map(nodes.map((node, index) => [node.id, canonicalKeyOf(node.kind, node.identifier, node.name) ?? `node-${index + 1}`]));
}

function unique(keys: Map<RecordId, DocumentKey>): Map<RecordId, DocumentKey> {
    const taken = new Set<DocumentKey>();
    const resolved = new Map<RecordId, DocumentKey>();
    keys.forEach((key, id) => {
        let candidate = key;
        let attempt = 2;
        while (taken.has(candidate)) {
            candidate = `${key}-${attempt}`;
            attempt += 1;
        }
        taken.add(candidate);
        resolved.set(id, candidate);
    });
    return resolved;
}

function documentNode(node: DiagramNode, keys: ReadonlyMap<RecordId, DocumentKey>): DocumentNode {
    const { id, category, diamondVertex, placements, parentId, ...fields } = node;
    return { ...fields, key: keys.get(id) ?? String(id), parent: parentId === null ? null : keys.get(parentId) ?? null };
}

function documentStep(step: DiagramStep, keys: ReadonlyMap<RecordId, DocumentKey>, stepKeys: ReadonlyMap<RecordId, DocumentKey>): DocumentStep {
    const { id, killChainPhase, sourceNodeId, targetNodeId, involvements, ...fields } = step;
    return {
        ...fields,
        key: stepKeys.get(id) ?? String(id),
        source: sourceNodeId === null ? null : keys.get(sourceNodeId) ?? null,
        target: targetNodeId === null ? null : keys.get(targetNodeId) ?? null,
        involvements: involvements
            .map(entry => ({ involvement: entry.involvement, node: keys.get(entry.nodeId) ?? "" }))
            .filter(entry => entry.node !== "")
    };
}

function documentLink(link: DiagramLink, index: number, keys: ReadonlyMap<RecordId, DocumentKey>, stepKeys: ReadonlyMap<RecordId, DocumentKey>): DocumentLink | null {
    const source = keys.get(link.sourceNodeId);
    const target = keys.get(link.targetNodeId);
    if (!source || !target) return null;
    const { id, sourceNodeId, targetNodeId, stepId, ...fields } = link;
    return { ...fields, key: `link-${index + 1}`, source, target, step: stepId === null ? null : stepKeys.get(stepId) ?? null };
}

/**
 * The whole timeline as a document. Pure, so a server can write one with nothing but the records.
 */
export function exportDocument(diagram: Diagram, now: Date = new Date()): TimelineDocument {
    const keys = unique(nodeKeys(diagram.nodes));
    const stepKeys = unique(new Map(diagram.steps.map((step, index) => [step.id, `step-${index + 1}`])));

    return {
        format: DOCUMENT_FORMAT,
        version: DOCUMENT_VERSION,
        exportedAt: now.toISOString(),
        incident: incidentOf(diagram.incident),
        nodes: diagram.nodes.map(node => documentNode(node, keys)),
        steps: diagram.steps.map(step => documentStep(step, keys, stepKeys)),
        links: diagram.links.map((link, index) => documentLink(link, index, keys, stepKeys)).filter((link): link is DocumentLink => link !== null),
        layouts: layoutsOf(diagram.nodes, keys)
    };
}

function incidentOf(incident: Incident): DocumentIncident {
    const { id, ...fields } = incident;
    return { ...fields, classifications: [...incident.classifications] };
}

function layoutsOf(nodes: readonly DiagramNode[], keys: ReadonlyMap<RecordId, DocumentKey>): DocumentLayout[] {
    return nodes.flatMap(node => node.placements.map(placement => ({
        node: keys.get(node.id) ?? String(node.id),
        representation: placement.representation,
        x: placement.x,
        y: placement.y
    })));
}

/**
 * A document arriving from elsewhere is untrusted input, so it is read field by field exactly as a
 * request body is, rather than cast into shape.
 */
export function readDocument(value: unknown, rules: ValidationRules = DEFAULT_VALIDATION_RULES): TimelineDocument {
    const issues: ValidationIssue[] = [];
    const reader = new FieldReader(value, issues);
    const format = reader.text("format", FieldLimits.IncidentTitle);
    if (format !== undefined && format !== DOCUMENT_FORMAT) {
        reader.fail("format", `must be ${DOCUMENT_FORMAT}`);
    }
    const version = reader.integer("version", 1, DOCUMENT_VERSION);
    if (version === undefined && !issues.some(issue => issue.field === "version")) {
        reader.fail("version", "is required");
    }

    const incident = readIncidentCreate(reader.raw("incident"), rules);
    const nodes = reader.list("nodes", FieldLimits.DocumentRecords, entry => readDocumentNode(entry, rules)) ?? [];
    const steps = reader.list("steps", FieldLimits.DocumentRecords, entry => readDocumentStep(entry, rules)) ?? [];
    const links = reader.list("links", FieldLimits.DocumentRecords, entry => readDocumentLink(entry)) ?? [];
    const layouts = reader.list("layouts", FieldLimits.LayoutEntries, entry => readDocumentLayout(entry, rules)) ?? [];
    reader.throwIfInvalid();

    checkKeys(nodes, steps, links);
    return {
        format: DOCUMENT_FORMAT,
        version: version ?? DOCUMENT_VERSION,
        exportedAt: reader.nullableText("exportedAt", FieldLimits.ReferenceId) ?? new Date(0).toISOString(),
        incident: { ...incident },
        nodes,
        steps,
        links,
        layouts
    };
}

function readDocumentNode(reader: FieldReader, rules: ValidationRules): DocumentNode | undefined {
    const key = reader.text("key", FieldLimits.DocumentKey);
    const fields = readNodeCreate(reader.body, rules);
    if (key === undefined) return reader.fail("key", "is required");
    return { ...fields, key, parent: reader.nullableText("parent", FieldLimits.DocumentKey) ?? null };
}

function readDocumentStep(reader: FieldReader, rules: ValidationRules): DocumentStep | undefined {
    const key = reader.text("key", FieldLimits.DocumentKey);
    // A document names the records an involvement points at, so the step fields are read without them
    const { involvements: _sent, ...body } = reader.body;
    const fields = readStepCreate(body, rules);
    if (key === undefined) return reader.fail("key", "is required");
    const { sourceNodeId, targetNodeId, involvements, ...rest } = fields;
    return {
        ...rest,
        key,
        source: reader.nullableText("source", FieldLimits.DocumentKey) ?? null,
        target: reader.nullableText("target", FieldLimits.DocumentKey) ?? null,
        involvements: reader.list("involvements", FieldLimits.Involvements, entry => readDocumentInvolvement(entry)) ?? []
    };
}

function readDocumentInvolvement(reader: FieldReader): DocumentInvolvement | undefined {
    const node = reader.text("node", FieldLimits.DocumentKey);
    if (node === undefined) return reader.fail("node", "is required");
    return { node, involvement: reader.enumValue("involvement", Involvement) ?? Involvement.Involved };
}

function readDocumentLink(reader: FieldReader): DocumentLink | undefined {
    const key = reader.text("key", FieldLimits.DocumentKey);
    const source = reader.text("source", FieldLimits.DocumentKey);
    const target = reader.text("target", FieldLimits.DocumentKey);
    if (key === undefined || source === undefined || target === undefined) {
        return reader.fail("", "needs a key, a source and a target");
    }
    return {
        key,
        source,
        target,
        kind: reader.enumValue("kind", LinkKind) ?? LinkKind.ConnectsTo,
        label: reader.nullableText("label", FieldLimits.LinkLabel) ?? null,
        confidence: reader.enumValue("confidence", Confidence) ?? Confidence.Confirmed,
        step: reader.nullableText("step", FieldLimits.DocumentKey) ?? null,
        metadata: reader.metadata("metadata") ?? null
    };
}

function readDocumentLayout(reader: FieldReader, rules: ValidationRules): DocumentLayout | undefined {
    const node = reader.text("node", FieldLimits.DocumentKey);
    const representation = reader.oneOf("representation", rules.representations);
    const x = reader.nullableCoordinate("x");
    const y = reader.nullableCoordinate("y");
    if (node === undefined || representation === undefined || x === undefined || y === undefined || x === null || y === null) {
        return reader.fail("", "needs a node, a representation and both coordinates");
    }
    return { node, representation, x, y };
}

/**
 * A document that names a record twice, or points at one it does not carry, would import as something
 * other than what it says. Refused whole rather than partly written.
 */
function checkKeys(nodes: readonly DocumentNode[], steps: readonly DocumentStep[], links: readonly DocumentLink[]): void {
    const issues: ValidationIssue[] = [];
    const nodeKeySet = new Set<DocumentKey>();
    nodes.forEach(node => {
        if (nodeKeySet.has(node.key)) issues.push({ field: "nodes", message: `names ${node.key} twice`, code: "duplicate_key" });
        nodeKeySet.add(node.key);
    });

    const stepKeySet = new Set<DocumentKey>();
    steps.forEach(step => {
        if (stepKeySet.has(step.key)) issues.push({ field: "steps", message: `names ${step.key} twice`, code: "duplicate_key" });
        stepKeySet.add(step.key);
    });

    const knownNode = (key: DocumentKey | null, field: string): void => {
        if (key !== null && !nodeKeySet.has(key)) {
            issues.push({ field, message: `points at ${key}, which the document does not carry`, code: "unknown_key" });
        }
    };

    nodes.forEach(node => knownNode(node.parent, "nodes.parent"));
    steps.forEach(step => {
        knownNode(step.source, "steps.source");
        knownNode(step.target, "steps.target");
        step.involvements.forEach(entry => knownNode(entry.node, "steps.involvements"));
    });
    links.forEach(link => {
        knownNode(link.source, "links.source");
        knownNode(link.target, "links.target");
        if (link.step !== null && !stepKeySet.has(link.step)) {
            issues.push({ field: "links.step", message: `points at ${link.step}, which the document does not carry`, code: "unknown_key" });
        }
    });

    if (issues.length > 0) {
        throw new ValidationError(issues);
    }
}

export enum ImportMode {
    /** Everything in the document is added. Records already there are left alone. */
    Add = "add",
    /** A record the document names again is updated rather than added a second time. */
    Merge = "merge"
}

export interface ImportOptions {
    mode?: ImportMode;
    /** Overrides the title of the incident the document carries. */
    title?: string;
    /** Moves every moment by this many hours, for replaying an exercise on another date. */
    shiftHours?: number;
}

export interface ImportReport {
    incidentId: RecordId;
    created: { nodes: number; steps: number; links: number };
    matched: { nodes: number; steps: number };
    /** Milestone keys the document carried that a step in the incident already held. */
    milestonesTaken: string[];
}
