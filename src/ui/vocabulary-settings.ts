// The vocabulary lists a viewer rewrote, read back from storage and edited in the settings dialog. A list
// that was edited is kept whole and replaces the built in one; a list never touched follows the package.

import {
    buildCatalog,
    type AttackTacticInfo,
    type Catalog,
    type KillChainPhaseInfo,
    type LinkKindInfo,
    type NodeKindInfo,
    type OptionInfo,
    type OutcomeInfo,
    type ResponsePhaseInfo,
    type SideInfo,
    type VocabularyOptions
} from "../core/catalog.js";
import { VocabularyList, readVocabularyList } from "../core/catalog-settings.js";
import {
    AttackTactic,
    Confidence,
    DiamondVertex,
    KillChainPhase,
    NodeCategory,
    OutcomeMeaning,
    ResponsePhase,
    ResponseStage,
    Side,
    SideRole,
    StepOutcome,
    isEnumValue
} from "../core/enums.js";
import { Icon } from "../core/icon.js";
import { ThemeToken } from "../core/theme-token.js";
import type { Choice } from "./forms.js";
import type { Strings } from "./strings.js";

export { VocabularyList };

/** Whether a relationship reads one way or both, which is how the link kind boolean is edited. */
export enum LinkDirection {
    OneWay = "oneWay",
    BothWays = "bothWays"
}

// Kill chain phases come before the tactics, which name them
const READING_ORDER: readonly VocabularyList[] = [
    VocabularyList.Sides,
    VocabularyList.NodeKinds,
    VocabularyList.KillChainPhases,
    VocabularyList.AttackTactics,
    VocabularyList.ResponsePhases,
    VocabularyList.Outcomes,
    VocabularyList.LinkKinds,
    VocabularyList.Confidences,
    VocabularyList.Involvements,
    VocabularyList.Audiences
];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether the catalog accepts the lists, which is what decides whether a stored list is kept. */
function accepted(vocabulary: VocabularyOptions): boolean {
    try {
        buildCatalog({ vocabulary });
        return true;
    } catch {
        return false;
    }
}

/**
 * The lists a browser stored, each kept only when it reads and the catalog accepts it, so one damaged
 * list never costs the others.
 */
export function parseVocabulary(value: unknown): VocabularyOptions {
    const vocabulary: VocabularyOptions = {};
    if (!isRecord(value)) return vocabulary;
    READING_ORDER.forEach(list => {
        const read = readVocabularyList(list, value[list]);
        if (read && accepted({ ...vocabulary, ...read })) Object.assign(vocabulary, read);
    });
    return vocabulary;
}

/** A property of an entry the dialog edits with a choice, such as the camp of a side. */
export interface EntryField<TEntry> {
    label: string;
    choices: readonly Choice<string>[];
    value(entry: TEntry): string;
    update(entry: TEntry, value: string): TEntry;
}

/**
 * How the dialog edits one list: where the list lives, what an entry is called and drawn with, what a new
 * entry starts as, and which entry must stay because records fall back to it.
 */
export interface ListEditor<TEntry> {
    list: VocabularyList;
    entries(catalog: Catalog): TEntry[];
    store(vocabulary: VocabularyOptions, entries: TEntry[]): void;
    key(entry: TEntry): string;
    label(entry: TEntry): string;
    relabel(entry: TEntry, label: string): TEntry;
    icon: { read(entry: TEntry): string; write(entry: TEntry, icon: string): TEntry } | null;
    create(key: string, label: string): TEntry;
    keeps: string | null;
    /** Only a list nothing falls back to may be left empty, such as the audiences. */
    mayBeEmpty: boolean;
    fields: readonly EntryField<TEntry>[];
}

function tokenChoices(strings: Strings): Choice<string>[] {
    const words = strings.settings;
    const defaults = buildCatalog();
    return [
        ...defaults.sides.map(entry => ({ value: entry.colorToken, label: entry.label })),
        { value: ThemeToken.Accent, label: words.accent },
        { value: ThemeToken.Good, label: words.positive },
        ...defaults.impactScale.levels.flatMap(level => (isEnumValue(ThemeToken, level.color) ? [{ value: level.color, label: level.label }] : []))
    ];
}

/** The soft fill that goes with a colour: the one of the built in side wearing it, or the neutral one. */
function surfaceFor(colorToken: ThemeToken): ThemeToken {
    return buildCatalog().sides.find(entry => entry.colorToken === colorToken)?.surfaceToken ?? ThemeToken.SurfaceUnknown;
}

function withIcon<TEntry extends { icon: string }>(): { read(entry: TEntry): string; write(entry: TEntry, icon: string): TEntry } {
    return { read: entry => entry.icon, write: (entry, value) => ({ ...entry, icon: value }) };
}

function optionEditor(list: VocabularyList.Confidences | VocabularyList.Involvements | VocabularyList.Audiences, keeps: string | null): ListEditor<OptionInfo<string>> {
    return {
        list,
        entries: catalog => catalog[list].map(entry => ({ ...entry })),
        store: (vocabulary, entries) => { vocabulary[list] = entries; },
        key: entry => entry.value,
        label: entry => entry.label,
        relabel: (entry, label) => ({ ...entry, label }),
        icon: null,
        create: (key, label) => ({ value: key, label }),
        keeps,
        mayBeEmpty: list === VocabularyList.Audiences,
        fields: []
    };
}

export function sideEditor(strings: Strings): ListEditor<SideInfo> {
    const words = strings.settings;
    const roles: Choice<string>[] = [
        { value: SideRole.Attacker, label: words.roleAttacker },
        { value: SideRole.Defender, label: words.roleDefender },
        { value: SideRole.Ally, label: words.roleAlly },
        { value: SideRole.Victim, label: words.roleVictim },
        { value: SideRole.Neutral, label: words.roleNeutral }
    ];
    return {
        list: VocabularyList.Sides,
        entries: catalog => catalog.sides.map(entry => ({ ...entry })),
        store: (vocabulary, entries) => { vocabulary.sides = entries; },
        key: entry => entry.side,
        label: entry => entry.label,
        relabel: (entry, label) => ({ ...entry, label }),
        icon: withIcon<SideInfo>(),
        create: (key, label) => ({ side: key, label, icon: Icon.Users, role: SideRole.Neutral, colorToken: ThemeToken.SideUnknown, surfaceToken: ThemeToken.SurfaceUnknown }),
        keeps: Side.Unknown,
        mayBeEmpty: false,
        fields: [
            {
                label: words.role, choices: roles, value: entry => entry.role,
                update: (entry, value) => (isEnumValue(SideRole, value) ? { ...entry, role: value } : entry)
            },
            {
                label: words.entryColor, choices: tokenChoices(strings), value: entry => entry.colorToken,
                update: (entry, value) => (isEnumValue(ThemeToken, value) ? { ...entry, colorToken: value, surfaceToken: surfaceFor(value) } : entry)
            }
        ]
    };
}

export function nodeKindEditor(strings: Strings): ListEditor<NodeKindInfo> {
    const words = strings.settings;
    const scene = strings.scene;
    const categories: Choice<string>[] = [
        { value: NodeCategory.Actor, label: words.categoryActor },
        { value: NodeCategory.Resource, label: words.categoryResource }
    ];
    const vertices: Choice<string>[] = [
        { value: DiamondVertex.Adversary, label: scene.adversary },
        { value: DiamondVertex.Capability, label: scene.capability },
        { value: DiamondVertex.Infrastructure, label: scene.infrastructure },
        { value: DiamondVertex.Victim, label: scene.victim }
    ];
    return {
        list: VocabularyList.NodeKinds,
        entries: catalog => catalog.nodeKinds.map(entry => ({ ...entry })),
        store: (vocabulary, entries) => { vocabulary.nodeKinds = entries; },
        key: entry => entry.kind,
        label: entry => entry.label,
        relabel: (entry, label) => ({ ...entry, label }),
        icon: withIcon<NodeKindInfo>(),
        create: (key, label) => ({ kind: key, label, icon: Icon.Infrastructure, category: NodeCategory.Resource, diamondVertex: DiamondVertex.Infrastructure }),
        keeps: null,
        mayBeEmpty: false,
        fields: [
            {
                label: words.category, choices: categories, value: entry => entry.category,
                update: (entry, value) => (isEnumValue(NodeCategory, value) ? { ...entry, category: value } : entry)
            },
            {
                label: words.diamondVertex, choices: vertices, value: entry => entry.diamondVertex,
                update: (entry, value) => (isEnumValue(DiamondVertex, value) ? { ...entry, diamondVertex: value } : entry)
            }
        ]
    };
}

export function tacticEditor(strings: Strings, catalog: Catalog): ListEditor<AttackTacticInfo> {
    const phases: Choice<string>[] = catalog.killChainPhases.map(entry => ({ value: entry.phase, label: entry.label }));
    return {
        list: VocabularyList.AttackTactics,
        entries: current => current.attackTactics.map(entry => ({ ...entry })),
        store: (vocabulary, entries) => { vocabulary.attackTactics = entries; },
        key: entry => entry.tactic,
        label: entry => entry.label,
        relabel: (entry, label) => ({ ...entry, label }),
        icon: withIcon<AttackTacticInfo>(),
        create: (key, label) => ({ tactic: key, label, icon: Icon.Target, attackId: null, killChainPhase: KillChainPhase.None }),
        keeps: AttackTactic.None,
        mayBeEmpty: false,
        fields: [{
            label: strings.settings.killChainPhase, choices: phases, value: entry => entry.killChainPhase,
            update: (entry, value) => ({ ...entry, killChainPhase: value })
        }]
    };
}

export function killChainEditor(): ListEditor<KillChainPhaseInfo> {
    return {
        list: VocabularyList.KillChainPhases,
        entries: catalog => catalog.killChainPhases.map(entry => ({ ...entry })),
        store: (vocabulary, entries) => { vocabulary.killChainPhases = entries; },
        key: entry => entry.phase,
        label: entry => entry.label,
        relabel: (entry, label) => ({ ...entry, label }),
        icon: withIcon<KillChainPhaseInfo>(),
        create: (key, label) => ({ phase: key, label, icon: Icon.Target }),
        keeps: KillChainPhase.None,
        mayBeEmpty: false,
        fields: []
    };
}

export function responsePhaseEditor(strings: Strings): ListEditor<ResponsePhaseInfo> {
    const words = strings.settings;
    const stages: Choice<string>[] = [
        { value: ResponseStage.None, label: words.stageNone },
        { value: ResponseStage.Detection, label: words.stageDetection },
        { value: ResponseStage.Containment, label: words.stageContainment },
        { value: ResponseStage.Eradication, label: words.stageEradication },
        { value: ResponseStage.Recovery, label: words.stageRecovery }
    ];
    return {
        list: VocabularyList.ResponsePhases,
        entries: catalog => catalog.responsePhases.map(entry => ({ ...entry })),
        store: (vocabulary, entries) => { vocabulary.responsePhases = entries; },
        key: entry => entry.phase,
        label: entry => entry.label,
        relabel: (entry, label) => ({ ...entry, label }),
        icon: withIcon<ResponsePhaseInfo>(),
        create: (key, label) => ({ phase: key, label, icon: Icon.Shield, stage: ResponseStage.None }),
        keeps: ResponsePhase.None,
        mayBeEmpty: false,
        fields: [{
            label: words.stage, choices: stages, value: entry => entry.stage,
            update: (entry, value) => (isEnumValue(ResponseStage, value) ? { ...entry, stage: value } : entry)
        }]
    };
}

export function outcomeEditor(strings: Strings): ListEditor<OutcomeInfo> {
    const words = strings.settings;
    const meanings: Choice<string>[] = [
        { value: OutcomeMeaning.Unknown, label: words.meaningUnknown },
        { value: OutcomeMeaning.Succeeded, label: words.meaningSucceeded },
        { value: OutcomeMeaning.Failed, label: words.meaningFailed },
        { value: OutcomeMeaning.Blocked, label: words.meaningBlocked },
        { value: OutcomeMeaning.Detected, label: words.meaningDetected }
    ];
    return {
        list: VocabularyList.Outcomes,
        entries: catalog => catalog.outcomes.map(entry => ({ ...entry })),
        store: (vocabulary, entries) => { vocabulary.outcomes = entries; },
        key: entry => entry.outcome,
        label: entry => entry.label,
        relabel: (entry, label) => ({ ...entry, label }),
        icon: withIcon<OutcomeInfo>(),
        create: (key, label) => ({ outcome: key, label, icon: Icon.Unknown, colorToken: ThemeToken.InkMuted, meaning: OutcomeMeaning.Unknown }),
        keeps: StepOutcome.Unknown,
        mayBeEmpty: false,
        fields: [
            {
                label: words.meaning, choices: meanings, value: entry => entry.meaning,
                update: (entry, value) => (isEnumValue(OutcomeMeaning, value) ? { ...entry, meaning: value } : entry)
            },
            {
                label: words.entryColor, choices: [{ value: ThemeToken.InkMuted, label: words.meaningUnknown }, ...tokenChoices(strings)], value: entry => entry.colorToken,
                update: (entry, value) => (isEnumValue(ThemeToken, value) ? { ...entry, colorToken: value } : entry)
            }
        ]
    };
}

export function linkKindEditor(strings: Strings): ListEditor<LinkKindInfo> {
    const words = strings.settings;
    const directions: Choice<string>[] = [
        { value: LinkDirection.OneWay, label: words.oneWay },
        { value: LinkDirection.BothWays, label: words.bothWays }
    ];
    return {
        list: VocabularyList.LinkKinds,
        entries: catalog => catalog.linkKinds.map(entry => ({ ...entry })),
        store: (vocabulary, entries) => { vocabulary.linkKinds = entries; },
        key: entry => entry.kind,
        label: entry => entry.label,
        relabel: (entry, label) => ({ ...entry, label }),
        icon: null,
        create: (key, label) => ({ kind: key, label, directed: true }),
        keeps: null,
        mayBeEmpty: false,
        fields: [{
            label: words.direction, choices: directions, value: entry => (entry.directed ? LinkDirection.OneWay : LinkDirection.BothWays),
            update: (entry, value) => ({ ...entry, directed: value === LinkDirection.OneWay })
        }]
    };
}

export function confidenceEditor(): ListEditor<OptionInfo<string>> {
    return optionEditor(VocabularyList.Confidences, Confidence.Unknown);
}

export function involvementEditor(): ListEditor<OptionInfo<string>> {
    return optionEditor(VocabularyList.Involvements, null);
}

export function audienceEditor(): ListEditor<OptionInfo<string>> {
    return optionEditor(VocabularyList.Audiences, null);
}
