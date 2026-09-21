// What a deployment changed of the catalog: its vocabulary lists, its impact scale and its milestones.
// Kept apart from the catalog the code builds, so the same settings can be stored anywhere, sent over the
// REST API and laid over whatever catalog a host starts from.

import {
    checkImpactScale,
    checkMilestones,
    checkVocabulary,
    impactLevelsOf,
    type AttackTacticInfo,
    type Catalog,
    type ImpactLevelInfo,
    type ImpactScale,
    type KillChainPhaseInfo,
    type LinkKindInfo,
    type MilestoneInfo,
    type NodeKindInfo,
    type OptionInfo,
    type OutcomeInfo,
    type ResponsePhaseInfo,
    type SideInfo,
    type VocabularyOptions
} from "./catalog.js";
import { DiamondVertex, NodeCategory, OutcomeMeaning, ResponseStage, SideRole, isEnumValue } from "./enums.js";
import { ValidationError, type ValidationIssue } from "./errors.js";
import { Icon } from "./icon.js";
import { ThemeToken } from "./theme-token.js";
import { isSafeColor } from "./validation.js";

/**
 * The parts of the catalog a deployment may change at run time. Null, or a list left out, keeps what the
 * catalog the service was built with holds.
 */
export interface CatalogSettings {
    impactScale: ImpactScale | null;
    milestones: MilestoneInfo[] | null;
    vocabulary: VocabularyOptions;
}

/** The vocabulary lists that may be rewritten, named after the catalog property that holds each. */
export enum VocabularyList {
    Sides = "sides",
    NodeKinds = "nodeKinds",
    AttackTactics = "attackTactics",
    KillChainPhases = "killChainPhases",
    ResponsePhases = "responsePhases",
    Outcomes = "outcomes",
    LinkKinds = "linkKinds",
    Confidences = "confidences",
    Involvements = "involvements",
    Audiences = "audiences"
}

/** Every list of the catalog records point into, which is what a usage count is reported against. */
export enum CatalogList {
    ImpactLevels = "impactLevels",
    Milestones = "milestones",
    Sides = "sides",
    NodeKinds = "nodeKinds",
    AttackTactics = "attackTactics",
    ResponsePhases = "responsePhases",
    Outcomes = "outcomes",
    LinkKinds = "linkKinds",
    Confidences = "confidences",
    Involvements = "involvements",
    Audiences = "audiences"
}

/** An entry that settings would remove while records still hold it, and how many do. */
export interface CatalogUsageEntry {
    list: CatalogList;
    key: string;
    label: string;
    records: number;
}

export function emptyCatalogSettings(): CatalogSettings {
    return { impactScale: null, milestones: null, vocabulary: {} };
}

type Fields = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Fields {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(fields: Fields, name: string): string | null {
    const value = fields[name];
    return typeof value === "string" ? value : null;
}

function icon(fields: Fields): string | null {
    const value = fields["icon"];
    return isEnumValue(Icon, value) ? value : null;
}

function token(fields: Fields, name: string): ThemeToken | null {
    const value = fields[name];
    return isEnumValue(ThemeToken, value) ? value : null;
}

function readSide(fields: Fields): SideInfo | null {
    const side = text(fields, "side");
    const label = text(fields, "label");
    const glyph = icon(fields);
    const role = fields["role"];
    const colorToken = token(fields, "colorToken");
    const surfaceToken = token(fields, "surfaceToken");
    if (side === null || label === null || glyph === null || !isEnumValue(SideRole, role) || colorToken === null || surfaceToken === null) return null;
    return { side, label, icon: glyph, role, colorToken, surfaceToken };
}

function readNodeKind(fields: Fields): NodeKindInfo | null {
    const kind = text(fields, "kind");
    const label = text(fields, "label");
    const glyph = icon(fields);
    const category = fields["category"];
    const diamondVertex = fields["diamondVertex"];
    if (kind === null || label === null || glyph === null || !isEnumValue(NodeCategory, category) || !isEnumValue(DiamondVertex, diamondVertex)) return null;
    return { kind, label, icon: glyph, category, diamondVertex };
}

function readTactic(fields: Fields): AttackTacticInfo | null {
    const tactic = text(fields, "tactic");
    const label = text(fields, "label");
    const glyph = icon(fields);
    const killChainPhase = text(fields, "killChainPhase");
    const attackId = fields["attackId"];
    if (tactic === null || label === null || glyph === null || killChainPhase === null || (attackId !== null && typeof attackId !== "string")) return null;
    return { tactic, label, icon: glyph, killChainPhase, attackId };
}

function readKillChainPhase(fields: Fields): KillChainPhaseInfo | null {
    const phase = text(fields, "phase");
    const label = text(fields, "label");
    const glyph = icon(fields);
    if (phase === null || label === null || glyph === null) return null;
    return { phase, label, icon: glyph };
}

function readResponsePhase(fields: Fields): ResponsePhaseInfo | null {
    const phase = text(fields, "phase");
    const label = text(fields, "label");
    const glyph = icon(fields);
    const stage = fields["stage"];
    if (phase === null || label === null || glyph === null || !isEnumValue(ResponseStage, stage)) return null;
    return { phase, label, icon: glyph, stage };
}

function readOutcome(fields: Fields): OutcomeInfo | null {
    const outcome = text(fields, "outcome");
    const label = text(fields, "label");
    const glyph = icon(fields);
    const colorToken = token(fields, "colorToken");
    const meaning = fields["meaning"];
    if (outcome === null || label === null || glyph === null || colorToken === null || !isEnumValue(OutcomeMeaning, meaning)) return null;
    return { outcome, label, icon: glyph, colorToken, meaning };
}

function readLinkKind(fields: Fields): LinkKindInfo | null {
    const kind = text(fields, "kind");
    const label = text(fields, "label");
    const directed = fields["directed"];
    if (kind === null || label === null || typeof directed !== "boolean") return null;
    return { kind, label, directed };
}

function readOption(fields: Fields): OptionInfo<string> | null {
    const value = text(fields, "value");
    const label = text(fields, "label");
    return value === null || label === null ? null : { value, label };
}

function readList<TEntry>(value: unknown, read: (fields: Fields) => TEntry | null): TEntry[] | null {
    if (!Array.isArray(value)) return null;
    const entries: TEntry[] = [];
    for (const item of value) {
        const entry = isRecord(item) ? read(item) : null;
        if (entry === null) return null;
        entries.push(entry);
    }
    return entries;
}

/**
 * One list read into the shape the catalog takes, or null when any entry of it cannot be read. Whether
 * the list fits the rest of the catalog is checked when it is laid over one.
 */
export function readVocabularyList(list: VocabularyList, value: unknown): VocabularyOptions | null {
    const wrap = <TEntry>(entries: TEntry[] | null, build: (entries: TEntry[]) => VocabularyOptions): VocabularyOptions | null => (entries ? build(entries) : null);
    switch (list) {
        case VocabularyList.Sides:
            return wrap(readList(value, readSide), sides => ({ sides }));
        case VocabularyList.NodeKinds:
            return wrap(readList(value, readNodeKind), nodeKinds => ({ nodeKinds }));
        case VocabularyList.AttackTactics:
            return wrap(readList(value, readTactic), attackTactics => ({ attackTactics }));
        case VocabularyList.KillChainPhases:
            return wrap(readList(value, readKillChainPhase), killChainPhases => ({ killChainPhases }));
        case VocabularyList.ResponsePhases:
            return wrap(readList(value, readResponsePhase), responsePhases => ({ responsePhases }));
        case VocabularyList.Outcomes:
            return wrap(readList(value, readOutcome), outcomes => ({ outcomes }));
        case VocabularyList.LinkKinds:
            return wrap(readList(value, readLinkKind), linkKinds => ({ linkKinds }));
        case VocabularyList.Confidences:
            return wrap(readList(value, readOption), confidences => ({ confidences }));
        case VocabularyList.Involvements:
            return wrap(readList(value, readOption), involvements => ({ involvements }));
        case VocabularyList.Audiences:
            return wrap(readList(value, readOption), audiences => ({ audiences }));
    }
}

function readLevel(value: unknown): ImpactLevelInfo | null {
    if (!isRecord(value)) return null;
    const level = text(value, "level");
    const label = text(value, "label");
    const color = text(value, "color");
    if (level === null || label === null || color === null) return null;
    return isEnumValue(ThemeToken, color) || isSafeColor(color) ? { level, label, color } : null;
}

export function readImpactScale(value: unknown): ImpactScale | null {
    if (!isRecord(value)) return null;
    const unassessed = readLevel(value["unassessed"]);
    const levels = readList(value["levels"], readLevel);
    return unassessed && levels ? { unassessed, levels } : null;
}

export function readMilestones(value: unknown): MilestoneInfo[] | null {
    return readList(value, fields => {
        const key = text(fields, "key");
        const label = text(fields, "label");
        return key === null || label === null ? null : { key, label };
    });
}

/**
 * Settings as a client or a store hands them over, refused whole when any part cannot be read. Whether
 * they fit together is decided when they are laid over a catalog.
 */
export function readCatalogSettings(value: unknown): CatalogSettings {
    const issues: ValidationIssue[] = [];
    if (!isRecord(value)) {
        throw new ValidationError([{ field: "settings", message: "must be an object" }]);
    }
    const settings = emptyCatalogSettings();
    const scale = value["impactScale"];
    if (scale !== undefined && scale !== null) {
        settings.impactScale = readImpactScale(scale);
        if (settings.impactScale === null) issues.push({ field: "impactScale", message: "is not an impact scale" });
    }
    const milestones = value["milestones"];
    if (milestones !== undefined && milestones !== null) {
        settings.milestones = readMilestones(milestones);
        if (settings.milestones === null) issues.push({ field: "milestones", message: "is not a list of milestones" });
    }
    const vocabulary = value["vocabulary"];
    if (vocabulary !== undefined && vocabulary !== null) {
        if (!isRecord(vocabulary)) {
            issues.push({ field: "vocabulary", message: "must be an object" });
        } else {
            Object.values(VocabularyList).forEach(list => {
                if (vocabulary[list] === undefined) return;
                const read = readVocabularyList(list, vocabulary[list]);
                if (read === null) issues.push({ field: `vocabulary.${list}`, message: "has an entry that cannot be read" });
                else Object.assign(settings.vocabulary, read);
            });
        }
    }
    if (issues.length > 0) throw new ValidationError(issues);
    return settings;
}

/**
 * The catalog with the settings laid over it, refused when the result does not hold together, such as
 * a tactic landing in a kill chain phase the lists no longer have.
 */
export function applyCatalogSettings(base: Catalog, settings: CatalogSettings): Catalog {
    const catalog: Catalog = structuredClone({
        ...base,
        ...settings.vocabulary,
        impactScale: settings.impactScale ?? base.impactScale,
        milestones: settings.milestones ?? base.milestones
    });
    try {
        checkImpactScale(catalog.impactScale);
        checkMilestones(catalog.milestones);
        checkVocabulary(catalog);
    } catch (error) {
        if (!(error instanceof Error)) throw error;
        throw new ValidationError([{ field: "settings", message: error.message }]);
    }
    return catalog;
}

interface Removed {
    list: CatalogList;
    entries: ReadonlyMap<string, string>;
}

function removedFrom<TEntry extends { label: string }>(list: CatalogList, current: readonly TEntry[], next: readonly TEntry[], keyOf: (entry: TEntry) => string): Removed {
    const kept = new Set(next.map(keyOf));
    return { list, entries: new Map(current.filter(entry => !kept.has(keyOf(entry))).map(entry => [keyOf(entry), entry.label])) };
}

/** The entries of every list that the next catalog no longer has, with the name they had. */
export function removedEntries(current: Catalog, next: Catalog): Removed[] {
    return [
        removedFrom(CatalogList.ImpactLevels, impactLevelsOf(current.impactScale), impactLevelsOf(next.impactScale), entry => entry.level),
        removedFrom(CatalogList.Milestones, current.milestones, next.milestones, entry => entry.key),
        removedFrom(CatalogList.Sides, current.sides, next.sides, entry => entry.side),
        removedFrom(CatalogList.NodeKinds, current.nodeKinds, next.nodeKinds, entry => entry.kind),
        removedFrom(CatalogList.AttackTactics, current.attackTactics, next.attackTactics, entry => entry.tactic),
        removedFrom(CatalogList.ResponsePhases, current.responsePhases, next.responsePhases, entry => entry.phase),
        removedFrom(CatalogList.Outcomes, current.outcomes, next.outcomes, entry => entry.outcome),
        removedFrom(CatalogList.LinkKinds, current.linkKinds, next.linkKinds, entry => entry.kind),
        removedFrom(CatalogList.Confidences, current.confidences, next.confidences, entry => entry.value),
        removedFrom(CatalogList.Involvements, current.involvements, next.involvements, entry => entry.value),
        removedFrom(CatalogList.Audiences, current.audiences, next.audiences, entry => entry.value)
    ].filter(removed => removed.entries.size > 0);
}
