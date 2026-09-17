import {
    AttackTactic,
    Audience,
    Confidence,
    Involvement,
    LinkKind,
    NodeKind,
    ResponsePhase,
    Side,
    StepOutcome,
    isEnumValue
} from "./enums.js";
import { buildCatalog, impactLevelsOf, type Catalog } from "./catalog.js";
import { ValidationError, type ValidationIssue } from "./errors.js";
import type {
    IncidentFields,
    IncidentUpdateInput,
    LayoutInput,
    LinkFields,
    LinkUpdateInput,
    NodeFields,
    NodeUpdateInput,
    RecordId,
    StepFields,
    StepInvolvement,
    Metadata,
    StepUpdateInput,
    WallClock
} from "./models.js";
import { normalizeWallClock, parseWallClock } from "./time.js";

export class FieldLimits {
    static readonly IncidentTitle = 200;
    static readonly ReferenceId = 100;
    static readonly Scope = 200;
    static readonly Classification = 100;
    static readonly Classifications = 20;
    static readonly NodeName = 200;
    static readonly NodeDescription = 2000;
    static readonly Identifier = 400;
    static readonly Role = 200;
    static readonly Icon = 100;
    static readonly Color = 40;
    static readonly ExternalId = 200;
    static readonly StepTitle = 200;
    static readonly StepDescription = 4000;
    static readonly TechniqueId = 20;
    static readonly EvidenceSource = 200;
    static readonly Tag = 100;
    static readonly Tags = 30;
    static readonly Involvements = 200;
    static readonly OrderIndex = 1000000;
    static readonly LinkLabel = 200;
    static readonly LayoutEntries = 1000;
    static readonly Coordinate = 100000;
    static readonly DocumentKey = 200;
    static readonly DocumentRecords = 5000;
    static readonly MetadataKeys = 100;
    static readonly MetadataLength = 16000;
}

/**
 * The parts of the catalog a payload is checked against, which is what makes the impact scale configurable
 * without the stored data drifting from it.
 */
export class ValidationRules {
    readonly impactLevels: readonly string[];
    readonly unassessedImpact: string;
    readonly milestoneKeys: readonly string[];
    readonly representations: readonly string[];

    constructor(catalog: Catalog) {
        this.impactLevels = impactLevelsOf(catalog.impactScale).map(entry => entry.level);
        this.unassessedImpact = catalog.impactScale.unassessed.level;
        this.milestoneKeys = catalog.milestones.map(entry => entry.key);
        this.representations = catalog.representations.map(entry => entry.representation);
    }
}

export const DEFAULT_VALIDATION_RULES = new ValidationRules(buildCatalog());

// Colours end up in SVG attributes, so anything beyond a plain CSS colour is refused rather than escaped
const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|[a-z]{3,30}|(rgb|hsl)a?\([0-9\s.,%deg/]+\))$/i;
const ICON_PATTERN = /^[a-z0-9-]+$/;
const TECHNIQUE_PATTERN = /^T\d{4}(\.\d{3})?$/;

type FieldSource = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is FieldSource {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Maybe<T> = { [Key in keyof T]: T[Key] | undefined };

/**
 * Keeps only the fields that were actually sent, which is what gives updates their meaning: a missing
 * field stays as it is, a null clears it.
 */
function definedOnly<T extends object>(values: Maybe<T>): Partial<T> {
    const result: Partial<T> = {};
    for (const key in values) {
        const value = values[key];
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Reads the fields of an untyped payload one by one. Every problem is collected, so a caller learns
 * about all of them at once rather than one per round trip.
 */
export class FieldReader {
    private readonly source: FieldSource;
    private readonly issues: ValidationIssue[];
    private readonly prefix: string;

    constructor(value: unknown, issues: ValidationIssue[] = [], prefix = "") {
        this.issues = issues;
        this.prefix = prefix;
        if (isRecord(value)) {
            this.source = value;
        } else {
            this.source = {};
            this.issues.push({ field: prefix || "body", message: "must be an object" });
        }
    }

    get invalid(): boolean {
        return this.issues.length > 0;
    }

    error(): ValidationError {
        return new ValidationError([...this.issues]);
    }

    throwIfInvalid(): void {
        if (this.invalid) {
            throw this.error();
        }
    }

    child(value: unknown, prefix: string): FieldReader {
        return new FieldReader(value, this.issues, `${this.prefix}${prefix}`);
    }

    fail(field: string, message: string): undefined {
        this.issues.push({ field: `${this.prefix}${field}`, message });
        return undefined;
    }

    private hasIssue(field: string): boolean {
        return this.issues.some(issue => issue.field === `${this.prefix}${field}`);
    }

    requireAll<T extends object, TKey extends keyof T & string>(patch: Partial<T>, keys: readonly TKey[]): patch is Partial<T> & Required<Pick<T, TKey>> {
        keys.forEach(key => {
            if (patch[key] === undefined && !this.hasIssue(key)) {
                this.fail(key, "is required");
            }
        });
        return !this.invalid;
    }

    /** The payload as it arrived, for a reader that hands part of it to another reader. */
    get body(): FieldSource {
        return this.source;
    }

    raw(field: string): unknown {
        return this.source[field];
    }

    private value(field: string): unknown {
        return this.source[field];
    }

    text(field: string, max: number, pattern?: RegExp): string | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (typeof value !== "string" || !value.trim()) return this.fail(field, "must be a non empty text");
        return this.checkText(field, value.trim(), max, pattern);
    }

    nullableText(field: string, max: number, pattern?: RegExp): string | null | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof value !== "string") return this.fail(field, "must be a text or null");
        const trimmed = value.trim();
        return trimmed ? this.checkText(field, trimmed, max, pattern) : null;
    }

    private checkText(field: string, value: string, max: number, pattern?: RegExp): string | undefined {
        if (value.length > max) return this.fail(field, `must be at most ${max} characters`);
        if (pattern && !pattern.test(value)) return this.fail(field, "has an invalid format");
        return value;
    }

    enumValue<TValue extends string>(field: string, enumObject: Readonly<Record<string, TValue>>): TValue | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (!isEnumValue(enumObject, value)) return this.fail(field, `must be one of ${Object.values(enumObject).join(", ")}`);
        return value;
    }

    nullableOneOf(field: string, allowed: readonly string[]): string | null | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (!allowed.length) return this.fail(field, "is not available because no value is configured");
        return this.oneOf(field, allowed);
    }

    oneOf(field: string, allowed: readonly string[]): string | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (typeof value !== "string" || !allowed.includes(value)) return this.fail(field, `must be one of ${allowed.join(", ")}`);
        return value;
    }

    boolean(field: string): boolean | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (typeof value !== "boolean") return this.fail(field, "must be true or false");
        return value;
    }

    integer(field: string, min: number, max: number): number | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
            return this.fail(field, `must be a whole number between ${min} and ${max}`);
        }
        return value;
    }

    id(field: string): RecordId | undefined {
        return this.integer(field, 1, Number.MAX_SAFE_INTEGER);
    }

    nullableId(field: string): RecordId | null | undefined {
        return this.value(field) === null ? null : this.id(field);
    }

    nullableCoordinate(field: string): number | null | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > FieldLimits.Coordinate) {
            return this.fail(field, `must be a number between ${-FieldLimits.Coordinate} and ${FieldLimits.Coordinate} or null`);
        }
        return value;
    }

    wallClock(field: string): WallClock | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        const normalized = typeof value === "string" ? normalizeWallClock(value) : null;
        if (!normalized) return this.fail(field, "must be a date such as 2026-01-12T08:30");
        return normalized;
    }

    nullableWallClock(field: string): WallClock | null | undefined {
        return this.value(field) === null ? null : this.wallClock(field);
    }

    /**
     * A bag of host owned values. It is never interpreted, only checked for being a plain JSON object
     * of a bounded size, because it is stored and handed back as it came.
     */
    metadata(field: string): Metadata | null | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (value === null) return null;
        if (!isRecord(value)) return this.fail(field, "must be an object or null");

        const keys = Object.keys(value);
        if (keys.length > FieldLimits.MetadataKeys) return this.fail(field, `must hold at most ${FieldLimits.MetadataKeys} keys`);
        if (!keys.length) return null;

        let serialized: string;
        try {
            serialized = JSON.stringify(value);
        } catch {
            return this.fail(field, "must hold plain JSON values");
        }
        if (serialized === undefined || serialized.length > FieldLimits.MetadataLength) {
            return this.fail(field, `must serialize to at most ${FieldLimits.MetadataLength} characters of JSON`);
        }
        return value as Metadata;
    }

    textList(field: string, maxLength: number, maxItems: number): string[] | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        if (!Array.isArray(value) || value.length > maxItems) return this.fail(field, `must be a list of at most ${maxItems} texts`);

        const kept = new Set<string>();
        for (const entry of value) {
            if (typeof entry !== "string" || entry.trim().length > maxLength) {
                return this.fail(field, `must only hold texts of at most ${maxLength} characters`);
            }
            if (entry.trim()) {
                kept.add(entry.trim());
            }
        }
        return [...kept];
    }

    list<TItem>(field: string, maxItems: number, readItem: (reader: FieldReader) => TItem | undefined): TItem[] | undefined {
        const value = this.value(field);
        if (value === undefined) return undefined;
        return this.items(value, field, maxItems, readItem);
    }

    items<TItem>(value: unknown, field: string, maxItems: number, readItem: (reader: FieldReader) => TItem | undefined): TItem[] | undefined {
        if (!Array.isArray(value) || value.length > maxItems) return this.fail(field, `must be a list of at most ${maxItems} entries`);

        const items: TItem[] = [];
        value.forEach((entry, index) => {
            const item = readItem(this.child(entry, `${field}[${index}].`));
            if (item !== undefined) {
                items.push(item);
            }
        });
        return this.invalid ? undefined : items;
    }
}

function incidentDefaults(rules: ValidationRules): Omit<IncidentFields, "title"> {
    return {
        referenceId: null,
        impact: rules.unassessedImpact,
        scope: null,
        classifications: [],
        externalId: null,
        metadata: null
    };
}

function nodeDefaults(rules: ValidationRules): Omit<NodeFields, "name" | "kind"> {
    return {
        description: null,
        side: Side.Unknown,
        parentId: null,
        identifier: null,
        role: null,
        criticality: rules.unassessedImpact,
        compromised: false,
        icon: null,
        colorOverride: null,
        externalId: null,
        metadata: null
    };
}

function stepDefaults(rules: ValidationRules): Omit<StepFields, "title" | "timestamp"> {
    return {
        endTimestamp: null,
        timeKnown: true,
        orderIndex: 0,
        description: null,
        side: Side.Unknown,
        attackTactic: AttackTactic.None,
        responsePhase: ResponsePhase.None,
        mitreTechniqueId: null,
        severity: rules.unassessedImpact,
        confidence: Confidence.Confirmed,
        outcome: StepOutcome.Unknown,
        audience: Audience.Both,
        evidenceSource: null,
        isMilestone: false,
        milestoneKey: null,
        icon: null,
        sourceNodeId: null,
        targetNodeId: null,
        involvements: [],
        tags: [],
        externalId: null,
        metadata: null
    };
}

function linkDefaults(): Omit<LinkFields, "sourceNodeId" | "targetNodeId"> {
    return {
        kind: LinkKind.ConnectsTo,
        label: null,
        confidence: Confidence.Confirmed,
        stepId: null,
        metadata: null
    };
}

function readIncidentPatch(reader: FieldReader, rules: ValidationRules): Partial<IncidentFields> {
    return definedOnly<IncidentFields>({
        title: reader.text("title", FieldLimits.IncidentTitle),
        referenceId: reader.nullableText("referenceId", FieldLimits.ReferenceId),
        impact: reader.oneOf("impact", rules.impactLevels),
        scope: reader.nullableText("scope", FieldLimits.Scope),
        classifications: reader.textList("classifications", FieldLimits.Classification, FieldLimits.Classifications),
        externalId: reader.nullableText("externalId", FieldLimits.ExternalId),
        metadata: reader.metadata("metadata")
    });
}

function readNodePatch(reader: FieldReader, rules: ValidationRules): Partial<NodeFields> {
    return definedOnly<NodeFields>({
        name: reader.text("name", FieldLimits.NodeName),
        description: reader.nullableText("description", FieldLimits.NodeDescription),
        kind: reader.enumValue("kind", NodeKind),
        side: reader.enumValue("side", Side),
        parentId: reader.nullableId("parentId"),
        identifier: reader.nullableText("identifier", FieldLimits.Identifier),
        role: reader.nullableText("role", FieldLimits.Role),
        criticality: reader.oneOf("criticality", rules.impactLevels),
        compromised: reader.boolean("compromised"),
        icon: reader.nullableText("icon", FieldLimits.Icon, ICON_PATTERN),
        colorOverride: reader.nullableText("colorOverride", FieldLimits.Color, COLOR_PATTERN),
        externalId: reader.nullableText("externalId", FieldLimits.ExternalId),
        metadata: reader.metadata("metadata")
    });
}

function readInvolvement(reader: FieldReader): StepInvolvement | undefined {
    const involvement = definedOnly<StepInvolvement>({
        nodeId: reader.id("nodeId"),
        involvement: reader.enumValue("involvement", Involvement)
    });
    if (involvement.nodeId === undefined) {
        return reader.fail("nodeId", "is required");
    }
    return { nodeId: involvement.nodeId, involvement: involvement.involvement ?? Involvement.Involved };
}

/**
 * One involvement per record, the last one sent winning, so a double click cannot list a record twice.
 */
function distinctInvolvements(involvements: readonly StepInvolvement[] | undefined): StepInvolvement[] | undefined {
    if (!involvements) return undefined;
    const byNode = new Map<RecordId, StepInvolvement>();
    involvements.forEach(entry => byNode.set(entry.nodeId, entry));
    return [...byNode.values()];
}

function readStepPatch(reader: FieldReader, rules: ValidationRules): Partial<StepFields> {
    return definedOnly<StepFields>({
        timestamp: reader.wallClock("timestamp"),
        endTimestamp: reader.nullableWallClock("endTimestamp"),
        timeKnown: reader.boolean("timeKnown"),
        orderIndex: reader.integer("orderIndex", -FieldLimits.OrderIndex, FieldLimits.OrderIndex),
        title: reader.text("title", FieldLimits.StepTitle),
        description: reader.nullableText("description", FieldLimits.StepDescription),
        side: reader.enumValue("side", Side),
        attackTactic: reader.enumValue("attackTactic", AttackTactic),
        responsePhase: reader.enumValue("responsePhase", ResponsePhase),
        mitreTechniqueId: reader.nullableText("mitreTechniqueId", FieldLimits.TechniqueId, TECHNIQUE_PATTERN),
        severity: reader.oneOf("severity", rules.impactLevels),
        confidence: reader.enumValue("confidence", Confidence),
        outcome: reader.enumValue("outcome", StepOutcome),
        audience: reader.enumValue("audience", Audience),
        evidenceSource: reader.nullableText("evidenceSource", FieldLimits.EvidenceSource),
        isMilestone: reader.boolean("isMilestone"),
        milestoneKey: reader.nullableOneOf("milestoneKey", rules.milestoneKeys),
        icon: reader.nullableText("icon", FieldLimits.Icon, ICON_PATTERN),
        sourceNodeId: reader.nullableId("sourceNodeId"),
        targetNodeId: reader.nullableId("targetNodeId"),
        involvements: distinctInvolvements(reader.list("involvements", FieldLimits.Involvements, readInvolvement)),
        tags: reader.textList("tags", FieldLimits.Tag, FieldLimits.Tags),
        externalId: reader.nullableText("externalId", FieldLimits.ExternalId),
        metadata: reader.metadata("metadata")
    });
}

function readLinkPatch(reader: FieldReader): Partial<LinkFields> {
    return definedOnly<LinkFields>({
        sourceNodeId: reader.id("sourceNodeId"),
        targetNodeId: reader.id("targetNodeId"),
        kind: reader.enumValue("kind", LinkKind),
        label: reader.nullableText("label", FieldLimits.LinkLabel),
        confidence: reader.enumValue("confidence", Confidence),
        stepId: reader.nullableId("stepId"),
        metadata: reader.metadata("metadata")
    });
}

function readLayout(reader: FieldReader, rules: ValidationRules): LayoutInput | undefined {
    const nodeId = reader.id("nodeId");
    const representation = reader.oneOf("representation", rules.representations);
    const x = reader.nullableCoordinate("x");
    const y = reader.nullableCoordinate("y");
    if (nodeId === undefined || representation === undefined || x === undefined || y === undefined) {
        return reader.fail("", "needs a nodeId, a representation and both coordinates");
    }
    return { nodeId, representation, x, y };
}

export function readIncidentCreate(value: unknown, rules: ValidationRules = DEFAULT_VALIDATION_RULES): IncidentFields {
    const reader = new FieldReader(value);
    const patch = readIncidentPatch(reader, rules);
    if (!reader.requireAll(patch, ["title"])) {
        throw reader.error();
    }
    return { ...incidentDefaults(rules), ...patch };
}

export function readIncidentUpdate(value: unknown, rules: ValidationRules = DEFAULT_VALIDATION_RULES): IncidentUpdateInput {
    const reader = new FieldReader(value);
    const patch = readIncidentPatch(reader, rules);
    reader.throwIfInvalid();
    return patch;
}

export function readNodeCreate(value: unknown, rules: ValidationRules = DEFAULT_VALIDATION_RULES): NodeFields {
    const reader = new FieldReader(value);
    const patch = readNodePatch(reader, rules);
    if (!reader.requireAll(patch, ["name", "kind"])) {
        throw reader.error();
    }
    return { ...nodeDefaults(rules), ...patch };
}

export function readNodeUpdate(value: unknown, rules: ValidationRules = DEFAULT_VALIDATION_RULES): NodeUpdateInput {
    const reader = new FieldReader(value);
    const patch = readNodePatch(reader, rules);
    reader.throwIfInvalid();
    return patch;
}

export function readStepCreate(value: unknown, rules: ValidationRules = DEFAULT_VALIDATION_RULES): StepFields {
    const reader = new FieldReader(value);
    const patch = readStepPatch(reader, rules);
    if (!reader.requireAll(patch, ["title", "timestamp"])) {
        throw reader.error();
    }
    const fields = { ...stepDefaults(rules), ...patch };
    checkStepTimes(fields);
    return fields;
}

export function readStepUpdate(value: unknown, rules: ValidationRules = DEFAULT_VALIDATION_RULES): StepUpdateInput {
    const reader = new FieldReader(value);
    const patch = readStepPatch(reader, rules);
    reader.throwIfInvalid();
    return patch;
}

export function readLinkCreate(value: unknown): LinkFields {
    const reader = new FieldReader(value);
    const patch = readLinkPatch(reader);
    if (!reader.requireAll(patch, ["sourceNodeId", "targetNodeId"])) {
        throw reader.error();
    }
    return { ...linkDefaults(), ...patch };
}

export function readLinkUpdate(value: unknown): LinkUpdateInput {
    const reader = new FieldReader(value);
    const patch = readLinkPatch(reader);
    reader.throwIfInvalid();
    return patch;
}

export function readLayouts(value: unknown, rules: ValidationRules = DEFAULT_VALIDATION_RULES): LayoutInput[] {
    const issues: ValidationIssue[] = [];
    const reader = new FieldReader({}, issues);
    const layouts = reader.items(value, "layouts", FieldLimits.LayoutEntries, entry => readLayout(entry, rules));
    if (!layouts) {
        throw reader.error();
    }
    return layouts;
}

/**
 * A step cannot end before it started. Checked on the merged record, because an update may move only
 * one of the two ends.
 */
export function checkStepTimes(fields: Pick<StepFields, "timestamp" | "endTimestamp">): void {
    const start = parseWallClock(fields.timestamp);
    const end = parseWallClock(fields.endTimestamp);
    if (start && end && end.getTime() < start.getTime()) {
        throw new ValidationError([{ field: "endTimestamp", message: "cannot be earlier than timestamp" }]);
    }
}
