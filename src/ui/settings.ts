// What a viewer of the incident desk chose to customise: colours, the words and icons of the vocabulary,
// the impact scale, the milestones and the layout. Everything maps onto options the package already takes,
// so a setting never adds a rule of its own.

import { buildCatalog, checkImpactScale, checkMilestones, type Catalog, type ImpactLevelInfo, type ImpactScale, type MilestoneInfo } from "../core/catalog.js";
import { isEnumValue } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import { ThemeToken } from "../core/theme-token.js";
import type { DurationUnits } from "../core/time.js";
import { ColorScheme } from "./theme-detection.js";
import { blend, type TokenResolver } from "./theme.js";
import { CanvasMode } from "./canvas-mode.js";
import { ViewPicker } from "./view-picker.js";
import type { PageSize } from "./viewport.js";

/** What the settings may change. */
export enum SettingsScope {
    /** Everything, for a host that builds its service from loadAppCatalog. */
    Everything = "everything",
    /**
     * Colours, layout, names and icons only, for a catalog someone else owns, such as a server. The impact
     * scale and the milestones are validated by that owner, so they are left alone.
     */
    Presentation = "presentation"
}

/** The lists of the catalog a viewer may relabel, named after the catalog property that holds them. */
export enum SettingsGroup {
    Sides = "sides",
    NodeKinds = "nodeKinds",
    AttackTactics = "attackTactics",
    KillChainPhases = "killChainPhases",
    ResponsePhases = "responsePhases",
    Outcomes = "outcomes",
    LinkKinds = "linkKinds",
    Confidences = "confidences",
    Involvements = "involvements",
    Audiences = "audiences",
    Representations = "representations"
}

/** A blank field keeps the built in value. */
export interface EntryOverride {
    label: string | null;
    icon: string | null;
}

/** An entry of a catalog list as the settings show it. */
export interface CatalogEntryView {
    key: string;
    label: string;
    icon: string | null;
}

export type ColorOverrides = Partial<Record<ThemeToken, string>>;

export interface AppSettings {
    colors: Record<ColorScheme, ColorOverrides>;
    entries: Map<SettingsGroup, Map<string, EntryOverride>>;
    impactScale: ImpactScale | null;
    milestones: MilestoneInfo[] | null;
    pageSize: PageSize | null;
    canvasMode: CanvasMode | null;
    viewPicker: ViewPicker | null;
    locale: string | null;
    durationUnits: DurationUnits | null;
}

export enum ColorSection {
    Brand = "brand",
    Sides = "sides"
}

export interface EditableColor {
    token: ThemeToken;
    section: ColorSection;
    /** A soft fill that follows the colour, so a card background never clashes with its new border. */
    soft: ThemeToken | null;
}

export const EDITABLE_COLORS: readonly EditableColor[] = [
    { token: ThemeToken.Accent, section: ColorSection.Brand, soft: ThemeToken.AccentSoft },
    { token: ThemeToken.Good, section: ColorSection.Brand, soft: null },
    { token: ThemeToken.SideAttacker, section: ColorSection.Sides, soft: ThemeToken.SurfaceAttacker },
    { token: ThemeToken.SideVictim, section: ColorSection.Sides, soft: ThemeToken.SurfaceVictim },
    { token: ThemeToken.SideDefender, section: ColorSection.Sides, soft: ThemeToken.SurfaceDefender },
    { token: ThemeToken.SideThirdParty, section: ColorSection.Sides, soft: null },
    { token: ThemeToken.SideUnknown, section: ColorSection.Sides, soft: ThemeToken.SurfaceUnknown }
];

export interface PagePreset {
    key: string;
    size: PageSize;
}

export const PAGE_PRESETS: readonly PagePreset[] = [
    { key: "16:9", size: { width: 1600, height: 900 } },
    { key: "16:10", size: { width: 1600, height: 1000 } },
    { key: "4:3", size: { width: 1600, height: 1200 } },
    { key: "A4", size: { width: 1600, height: 1131 } }
];

export const LOCALES: readonly string[] = ["en-GB", "en-US", "fr-FR", "de-DE", "es-ES", "it-IT", "nl-NL", "pt-BR", "ja-JP"];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_LABEL_LENGTH = 60;
const MAX_UNIT_LENGTH = 8;
const MAX_PAGE_SIDE = 4000;
const MIN_PAGE_SIDE = 400;
/** How far a soft fill sits from the page towards its colour, matching the built in surfaces. */
const SOFT_RATIO = 0.88;

const ICON_GROUPS: ReadonlySet<SettingsGroup> = new Set([
    SettingsGroup.Sides,
    SettingsGroup.NodeKinds,
    SettingsGroup.AttackTactics,
    SettingsGroup.KillChainPhases,
    SettingsGroup.ResponsePhases,
    SettingsGroup.Outcomes,
    SettingsGroup.Representations
]);

export function groupHasIcons(group: SettingsGroup): boolean {
    return ICON_GROUPS.has(group);
}

export function defaultSettings(): AppSettings {
    return {
        colors: { [ColorScheme.Light]: {}, [ColorScheme.Dark]: {} },
        entries: new Map(),
        impactScale: null,
        milestones: null,
        pageSize: null,
        canvasMode: null,
        viewPicker: null,
        locale: null,
        durationUnits: null
    };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function label(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" && value.length <= MAX_LABEL_LENGTH ? value : null;
}

export function isHexColor(value: unknown): value is string {
    return typeof value === "string" && HEX_COLOR.test(value);
}

export function isKnownLocale(value: unknown): value is string {
    if (typeof value !== "string" || value === "") return false;
    try {
        return Intl.DateTimeFormat.supportedLocalesOf([value]).length > 0;
    } catch {
        return false;
    }
}

function parseColors(value: unknown): ColorOverrides {
    const colors: ColorOverrides = {};
    if (!isRecord(value)) return colors;
    for (const [token, color] of Object.entries(value)) {
        if (isEnumValue(ThemeToken, token) && isHexColor(color)) colors[token] = color;
    }
    return colors;
}

function parseEntries(value: unknown): Map<SettingsGroup, Map<string, EntryOverride>> {
    const entries = new Map<SettingsGroup, Map<string, EntryOverride>>();
    if (!isRecord(value)) return entries;
    for (const [group, overrides] of Object.entries(value)) {
        if (!isEnumValue(SettingsGroup, group) || !isRecord(overrides)) continue;
        const map = new Map<string, EntryOverride>();
        for (const [key, override] of Object.entries(overrides)) {
            if (!isRecord(override)) continue;
            const icon = groupHasIcons(group) && isEnumValue(Icon, override["icon"]) ? override["icon"] : null;
            const parsed = { label: label(override["label"]), icon };
            if (parsed.label !== null || parsed.icon !== null) map.set(key, parsed);
        }
        entries.set(group, map);
    }
    return entries;
}

function parseLevel(value: unknown): ImpactLevelInfo | null {
    if (!isRecord(value)) return null;
    const { level, label: text, color } = value;
    if (typeof level !== "string" || typeof text !== "string" || typeof color !== "string") return null;
    const known = isEnumValue(ThemeToken, color) || isHexColor(color);
    return known ? { level, label: text, color } : null;
}

function parseImpactScale(value: unknown): ImpactScale | null {
    if (!isRecord(value) || !Array.isArray(value["levels"])) return null;
    const unassessed = parseLevel(value["unassessed"]);
    const levels = value["levels"].map(parseLevel);
    if (unassessed === null || levels.some(level => level === null)) return null;
    const scale = { unassessed, levels: levels.filter(level => level !== null) };
    try {
        checkImpactScale(scale);
        return scale;
    } catch {
        return null;
    }
}

function parseMilestones(value: unknown): MilestoneInfo[] | null {
    if (!Array.isArray(value)) return null;
    const milestones: MilestoneInfo[] = [];
    for (const entry of value) {
        if (!isRecord(entry) || typeof entry["key"] !== "string" || typeof entry["label"] !== "string") return null;
        milestones.push({ key: entry["key"], label: entry["label"] });
    }
    try {
        checkMilestones(milestones);
        return milestones;
    } catch {
        return null;
    }
}

function pageSide(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= MIN_PAGE_SIDE && value <= MAX_PAGE_SIDE;
}

function parsePageSize(value: unknown): PageSize | null {
    if (!isRecord(value)) return null;
    const { width, height } = value;
    return pageSide(width) && pageSide(height) ? { width, height } : null;
}

function unit(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "" && value.length <= MAX_UNIT_LENGTH;
}

function parseDurationUnits(value: unknown): DurationUnits | null {
    if (!isRecord(value)) return null;
    const { minutes, hours, days } = value;
    return unit(minutes) && unit(hours) && unit(days) ? { minutes, hours, days } : null;
}

/**
 * Reads settings from stored or imported JSON. Each part that does not hold up is dropped on its own, so
 * one bad value never costs the viewer the rest of their choices.
 */
export function parseSettings(value: unknown): AppSettings {
    const settings = defaultSettings();
    if (!isRecord(value)) return settings;
    const colors = isRecord(value["colors"]) ? value["colors"] : {};
    settings.colors = { [ColorScheme.Light]: parseColors(colors[ColorScheme.Light]), [ColorScheme.Dark]: parseColors(colors[ColorScheme.Dark]) };
    settings.entries = parseEntries(value["entries"]);
    settings.impactScale = parseImpactScale(value["impactScale"]);
    settings.milestones = parseMilestones(value["milestones"]);
    settings.pageSize = parsePageSize(value["pageSize"]);
    settings.canvasMode = isEnumValue(CanvasMode, value["canvasMode"]) ? value["canvasMode"] : null;
    settings.viewPicker = isEnumValue(ViewPicker, value["viewPicker"]) ? value["viewPicker"] : null;
    settings.locale = isKnownLocale(value["locale"]) ? value["locale"] : null;
    settings.durationUnits = parseDurationUnits(value["durationUnits"]);
    return settings;
}

export function serializeSettings(settings: AppSettings): string {
    const entries: Record<string, Record<string, EntryOverride>> = {};
    settings.entries.forEach((overrides, group) => {
        entries[group] = Object.fromEntries(overrides);
    });
    return JSON.stringify({ ...settings, entries });
}

function relabeled<TEntry extends { label: string }>(
    entries: readonly TEntry[],
    keyOf: (entry: TEntry) => string,
    overrides: ReadonlyMap<string, EntryOverride> | undefined
): TEntry[] {
    return entries.map(entry => {
        const override = overrides?.get(keyOf(entry));
        if (!override) return entry;
        return {
            ...entry,
            ...(override.label !== null ? { label: override.label } : {}),
            ...(override.icon !== null && "icon" in entry ? { icon: override.icon } : {})
        };
    });
}

/**
 * The catalog a service is built with, carrying the chosen scale, milestones, words and icons.
 */
export function settingsCatalog(settings: AppSettings): Catalog {
    return relabelCatalog(buildCatalog({
        ...(settings.impactScale ? { impactScale: settings.impactScale } : {}),
        ...(settings.milestones ? { milestones: settings.milestones } : {})
    }), settings);
}

/**
 * A catalog with the chosen words and icons written over its entries, whoever built it. Only what is drawn
 * changes, so this is safe over a catalog a server validates against.
 */
export function relabelCatalog(catalog: Catalog, settings: AppSettings): Catalog {
    const of = (group: SettingsGroup): ReadonlyMap<string, EntryOverride> | undefined => settings.entries.get(group);
    return {
        ...catalog,
        sides: relabeled(catalog.sides, entry => entry.side, of(SettingsGroup.Sides)),
        nodeKinds: relabeled(catalog.nodeKinds, entry => entry.kind, of(SettingsGroup.NodeKinds)),
        attackTactics: relabeled(catalog.attackTactics, entry => entry.tactic, of(SettingsGroup.AttackTactics)),
        killChainPhases: relabeled(catalog.killChainPhases, entry => entry.phase, of(SettingsGroup.KillChainPhases)),
        responsePhases: relabeled(catalog.responsePhases, entry => entry.phase, of(SettingsGroup.ResponsePhases)),
        outcomes: relabeled(catalog.outcomes, entry => entry.outcome, of(SettingsGroup.Outcomes)),
        linkKinds: relabeled(catalog.linkKinds, entry => entry.kind, of(SettingsGroup.LinkKinds)),
        confidences: relabeled(catalog.confidences, entry => entry.value, of(SettingsGroup.Confidences)),
        involvements: relabeled(catalog.involvements, entry => entry.value, of(SettingsGroup.Involvements)),
        audiences: relabeled(catalog.audiences, entry => entry.value, of(SettingsGroup.Audiences)),
        representations: relabeled(catalog.representations, entry => entry.representation, of(SettingsGroup.Representations))
    };
}

/**
 * The entries of one list of a catalog, in the order the catalog holds them.
 */
export function catalogEntries(catalog: Catalog, group: SettingsGroup): CatalogEntryView[] {
    switch (group) {
        case SettingsGroup.Sides:
            return catalog.sides.map(entry => ({ key: entry.side, label: entry.label, icon: entry.icon }));
        case SettingsGroup.NodeKinds:
            return catalog.nodeKinds.map(entry => ({ key: entry.kind, label: entry.label, icon: entry.icon }));
        case SettingsGroup.AttackTactics:
            return catalog.attackTactics.map(entry => ({ key: entry.tactic, label: entry.label, icon: entry.icon }));
        case SettingsGroup.KillChainPhases:
            return catalog.killChainPhases.map(entry => ({ key: entry.phase, label: entry.label, icon: entry.icon }));
        case SettingsGroup.ResponsePhases:
            return catalog.responsePhases.map(entry => ({ key: entry.phase, label: entry.label, icon: entry.icon }));
        case SettingsGroup.Outcomes:
            return catalog.outcomes.map(entry => ({ key: entry.outcome, label: entry.label, icon: entry.icon }));
        case SettingsGroup.LinkKinds:
            return catalog.linkKinds.map(entry => ({ key: entry.kind, label: entry.label, icon: null }));
        case SettingsGroup.Confidences:
            return catalog.confidences.map(entry => ({ key: entry.value, label: entry.label, icon: null }));
        case SettingsGroup.Involvements:
            return catalog.involvements.map(entry => ({ key: entry.value, label: entry.label, icon: null }));
        case SettingsGroup.Audiences:
            return catalog.audiences.map(entry => ({ key: entry.value, label: entry.label, icon: null }));
        case SettingsGroup.Representations:
            return catalog.representations.map(entry => ({ key: entry.representation, label: entry.label, icon: entry.icon }));
    }
}

/**
 * Entries of one list drawn with the same icon, keyed by entry, each with the other entries it clashes with.
 * Two parties sharing an icon cannot be told apart on a slide printed in grey.
 */
export function iconCollisions(entries: readonly CatalogEntryView[]): Map<string, string[]> {
    const clashes = new Map<string, string[]>();
    entries.forEach(entry => {
        const others = entries.filter(other => other.key !== entry.key && other.icon !== null && other.icon === entry.icon);
        if (others.length > 0) clashes.set(entry.key, others.map(other => other.label));
    });
    return clashes;
}

/**
 * The custom properties to set for one scheme, the soft fills worked out from the page surface the
 * scheme already wears.
 */
export function settingsTokens(settings: AppSettings, scheme: ColorScheme, resolve: TokenResolver): Map<ThemeToken, string> {
    const chosen = settings.colors[scheme];
    const surface = resolve(ThemeToken.Surface);
    const tokens = new Map<ThemeToken, string>();
    EDITABLE_COLORS.forEach(({ token, soft }) => {
        const color = chosen[token];
        if (color === undefined) return;
        tokens.set(token, color);
        if (soft !== null) tokens.set(soft, blend(color, SOFT_RATIO, surface));
    });
    return tokens;
}

/**
 * A plain identifier made from a label, unique among the keys given, for a new level or milestone.
 */
export function keyFor(text: string, taken: ReadonlySet<string>): string {
    const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "entry";
    let key = base;
    for (let suffix = 2; taken.has(key); suffix += 1) {
        key = `${base}-${suffix}`;
    }
    return key;
}
