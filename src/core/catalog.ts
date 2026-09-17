import {
    AttackTactic,
    Audience,
    Confidence,
    DiamondVertex,
    Impact,
    Involvement,
    KillChainPhase,
    LinkKind,
    NodeCategory,
    NodeKind,
    Representation,
    type RepresentationKey,
    ResponsePhase,
    Side,
    StepOutcome,
    enumValues
} from "./enums.js";
import { Icon } from "./icon.js";
import { ThemeToken } from "./theme-token.js";

export interface NodeKindInfo {
    kind: NodeKind;
    category: NodeCategory;
    label: string;
    icon: string;
    diamondVertex: DiamondVertex;
}

export interface SideInfo {
    side: Side;
    label: string;
    icon: string;
    colorToken: ThemeToken;
    surfaceToken: ThemeToken;
}

export interface AttackTacticInfo {
    tactic: AttackTactic;
    label: string;
    attackId: string | null;
    icon: string;
    killChainPhase: KillChainPhase;
}

export interface KillChainPhaseInfo {
    phase: KillChainPhase;
    label: string;
    icon: string;
}

export interface ResponsePhaseInfo {
    phase: ResponsePhase;
    label: string;
    icon: string;
}

export interface LinkKindInfo {
    kind: LinkKind;
    label: string;
    directed: boolean;
}

export interface OutcomeInfo {
    outcome: StepOutcome;
    label: string;
    icon: string;
    colorToken: ThemeToken;
}

/**
 * One step of the impact scale. The colour is any CSS colour, or the name of a custom property such as
 * --tlg-impact-high so the stylesheet decides it.
 */
export interface ImpactLevelInfo {
    level: string;
    label: string;
    color: string;
}

/**
 * The scale incidents, records and steps are rated on. Levels run from the least to the most severe. The
 * unassessed entry stands for no rating at all, so it is never drawn as a step of the scale.
 */
export interface ImpactScale {
    unassessed: ImpactLevelInfo;
    levels: ImpactLevelInfo[];
}

export interface CatalogOptions {
    impactScale?: ImpactScale;
    /** The named moments steps may claim. Empty by default: what counts as a milestone is the host's to say. */
    milestones?: MilestoneInfo[];
    /** Representations of the host's own, added after the built in ones. A key may not be claimed twice. */
    representations?: RepresentationInfo[];
}

/**
 * A named moment of an incident, such as the first access or the containment, that at most one step
 * holds. The package supplies no list of its own, because every deployment reports on different ones.
 */
export interface MilestoneInfo {
    key: string;
    label: string;
}

export interface OptionInfo<TValue extends string> {
    value: TValue;
    label: string;
}

export interface RepresentationInfo {
    representation: RepresentationKey;
    label: string;
    icon: string;
    description: string;
    /** Whether an analyst can drag records around in this representation and have the position kept. */
    supportsManualPlacement: boolean;
}

/**
 * Everything the workspace needs to label, colour and group the records of a diagram. Served with the
 * diagram, so the renderers carry no domain knowledge of their own and a host can relabel anything.
 */
export interface Catalog {
    nodeKinds: NodeKindInfo[];
    sides: SideInfo[];
    attackTactics: AttackTacticInfo[];
    killChainPhases: KillChainPhaseInfo[];
    responsePhases: ResponsePhaseInfo[];
    linkKinds: LinkKindInfo[];
    outcomes: OutcomeInfo[];
    impactScale: ImpactScale;
    confidences: OptionInfo<Confidence>[];
    involvements: OptionInfo<Involvement>[];
    audiences: OptionInfo<Audience>[];
    representations: RepresentationInfo[];
    milestones: MilestoneInfo[];
}

function nodeKind(kind: NodeKind, category: NodeCategory, label: string, icon: Icon, diamondVertex: DiamondVertex): NodeKindInfo {
    return { kind, category, label, icon, diamondVertex };
}

function tactic(value: AttackTactic, label: string, attackId: string | null, icon: Icon, killChainPhase: KillChainPhase): AttackTacticInfo {
    return { tactic: value, label, attackId, icon, killChainPhase };
}

function representation(value: Representation, label: string, icon: Icon, description: string, supportsManualPlacement: boolean): RepresentationInfo {
    return { representation: value, label, icon, description, supportsManualPlacement };
}

const NODE_KINDS: Readonly<Record<NodeKind, NodeKindInfo>> = {
    [NodeKind.Person]: nodeKind(NodeKind.Person, NodeCategory.Actor, "Person", Icon.User, DiamondVertex.Victim),
    [NodeKind.Team]: nodeKind(NodeKind.Team, NodeCategory.Actor, "Team", Icon.Users, DiamondVertex.Victim),
    [NodeKind.Company]: nodeKind(NodeKind.Company, NodeCategory.Actor, "Company", Icon.Company, DiamondVertex.Victim),
    [NodeKind.ThreatActor]: nodeKind(NodeKind.ThreatActor, NodeCategory.Actor, "Threat actor", Icon.ThreatActor, DiamondVertex.Adversary),
    [NodeKind.Vendor]: nodeKind(NodeKind.Vendor, NodeCategory.Actor, "Vendor", Icon.Vendor, DiamondVertex.Victim),
    [NodeKind.Authority]: nodeKind(NodeKind.Authority, NodeCategory.Actor, "Authority", Icon.Authority, DiamondVertex.Victim),
    [NodeKind.Workstation]: nodeKind(NodeKind.Workstation, NodeCategory.Resource, "Workstation", Icon.Workstation, DiamondVertex.Infrastructure),
    [NodeKind.Server]: nodeKind(NodeKind.Server, NodeCategory.Resource, "Server", Icon.Server, DiamondVertex.Infrastructure),
    [NodeKind.Account]: nodeKind(NodeKind.Account, NodeCategory.Resource, "Account", Icon.Account, DiamondVertex.Capability),
    [NodeKind.Mailbox]: nodeKind(NodeKind.Mailbox, NodeCategory.Resource, "Mailbox", Icon.Mailbox, DiamondVertex.Infrastructure),
    [NodeKind.File]: nodeKind(NodeKind.File, NodeCategory.Resource, "File", Icon.File, DiamondVertex.Capability),
    [NodeKind.Application]: nodeKind(NodeKind.Application, NodeCategory.Resource, "Application", Icon.Application, DiamondVertex.Infrastructure),
    [NodeKind.Network]: nodeKind(NodeKind.Network, NodeCategory.Resource, "Network", Icon.Network, DiamondVertex.Infrastructure),
    [NodeKind.CloudService]: nodeKind(NodeKind.CloudService, NodeCategory.Resource, "Cloud service", Icon.Cloud, DiamondVertex.Infrastructure),
    [NodeKind.Credential]: nodeKind(NodeKind.Credential, NodeCategory.Resource, "Credential", Icon.Credential, DiamondVertex.Capability),
    [NodeKind.Database]: nodeKind(NodeKind.Database, NodeCategory.Resource, "Database", Icon.Database, DiamondVertex.Infrastructure),
    [NodeKind.Device]: nodeKind(NodeKind.Device, NodeCategory.Resource, "Device", Icon.Device, DiamondVertex.Infrastructure),
    [NodeKind.Malware]: nodeKind(NodeKind.Malware, NodeCategory.Resource, "Malware", Icon.Malware, DiamondVertex.Capability),
    [NodeKind.Tool]: nodeKind(NodeKind.Tool, NodeCategory.Resource, "Tool", Icon.Tool, DiamondVertex.Capability),
    [NodeKind.Exploit]: nodeKind(NodeKind.Exploit, NodeCategory.Resource, "Exploit", Icon.Exploit, DiamondVertex.Capability),
    [NodeKind.C2Server]: nodeKind(NodeKind.C2Server, NodeCategory.Resource, "C2 server", Icon.Beacon, DiamondVertex.Infrastructure),
    [NodeKind.Domain]: nodeKind(NodeKind.Domain, NodeCategory.Resource, "Domain", Icon.Domain, DiamondVertex.Infrastructure),
    [NodeKind.IpAddress]: nodeKind(NodeKind.IpAddress, NodeCategory.Resource, "IP address", Icon.Address, DiamondVertex.Infrastructure),
    [NodeKind.Infrastructure]: nodeKind(NodeKind.Infrastructure, NodeCategory.Resource, "Infrastructure", Icon.Infrastructure, DiamondVertex.Infrastructure)
};

const SIDES: Readonly<Record<Side, SideInfo>> = {
    [Side.Unknown]: { side: Side.Unknown, label: "Unknown", icon: Icon.Unknown, colorToken: ThemeToken.SideUnknown, surfaceToken: ThemeToken.SurfaceUnknown },
    [Side.Attacker]: { side: Side.Attacker, label: "Attacker", icon: Icon.ThreatActor, colorToken: ThemeToken.SideAttacker, surfaceToken: ThemeToken.SurfaceAttacker },
    [Side.Victim]: { side: Side.Victim, label: "Victim", icon: Icon.Target, colorToken: ThemeToken.SideVictim, surfaceToken: ThemeToken.SurfaceVictim },
    [Side.Defender]: { side: Side.Defender, label: "Defender", icon: Icon.Shield, colorToken: ThemeToken.SideDefender, surfaceToken: ThemeToken.SurfaceDefender },
    [Side.ThirdParty]: { side: Side.ThirdParty, label: "Third party", icon: Icon.Helper, colorToken: ThemeToken.SideThirdParty, surfaceToken: ThemeToken.SurfaceUnknown }
};

const ATTACK_TACTICS: Readonly<Record<AttackTactic, AttackTacticInfo>> = {
    [AttackTactic.None]: tactic(AttackTactic.None, "Unclassified", null, Icon.Unknown, KillChainPhase.None),
    [AttackTactic.Reconnaissance]: tactic(AttackTactic.Reconnaissance, "Reconnaissance", "TA0043", Icon.Binoculars, KillChainPhase.Reconnaissance),
    [AttackTactic.ResourceDevelopment]: tactic(AttackTactic.ResourceDevelopment, "Resource Development", "TA0042", Icon.Flask, KillChainPhase.Weaponization),
    [AttackTactic.InitialAccess]: tactic(AttackTactic.InitialAccess, "Initial Access", "TA0001", Icon.Door, KillChainPhase.Delivery),
    [AttackTactic.Execution]: tactic(AttackTactic.Execution, "Execution", "TA0002", Icon.Bolt, KillChainPhase.Exploitation),
    [AttackTactic.Persistence]: tactic(AttackTactic.Persistence, "Persistence", "TA0003", Icon.Anchor, KillChainPhase.Installation),
    [AttackTactic.PrivilegeEscalation]: tactic(AttackTactic.PrivilegeEscalation, "Privilege Escalation", "TA0004", Icon.Escalation, KillChainPhase.Exploitation),
    [AttackTactic.DefenseEvasion]: tactic(AttackTactic.DefenseEvasion, "Defense Evasion", "TA0005", Icon.Evasion, KillChainPhase.Installation),
    [AttackTactic.CredentialAccess]: tactic(AttackTactic.CredentialAccess, "Credential Access", "TA0006", Icon.Credential, KillChainPhase.ActionsOnObjectives),
    [AttackTactic.Discovery]: tactic(AttackTactic.Discovery, "Discovery", "TA0007", Icon.Search, KillChainPhase.ActionsOnObjectives),
    [AttackTactic.LateralMovement]: tactic(AttackTactic.LateralMovement, "Lateral Movement", "TA0008", Icon.Lateral, KillChainPhase.ActionsOnObjectives),
    [AttackTactic.Collection]: tactic(AttackTactic.Collection, "Collection", "TA0009", Icon.Archive, KillChainPhase.ActionsOnObjectives),
    [AttackTactic.CommandAndControl]: tactic(AttackTactic.CommandAndControl, "Command and Control", "TA0011", Icon.Beacon, KillChainPhase.CommandAndControl),
    [AttackTactic.Exfiltration]: tactic(AttackTactic.Exfiltration, "Exfiltration", "TA0010", Icon.Upload, KillChainPhase.ActionsOnObjectives),
    [AttackTactic.Impact]: tactic(AttackTactic.Impact, "Impact", "TA0040", Icon.Blast, KillChainPhase.ActionsOnObjectives)
};

const KILL_CHAIN_PHASES: Readonly<Record<KillChainPhase, KillChainPhaseInfo>> = {
    [KillChainPhase.None]: { phase: KillChainPhase.None, label: "Unclassified", icon: Icon.Unknown },
    [KillChainPhase.Reconnaissance]: { phase: KillChainPhase.Reconnaissance, label: "Reconnaissance", icon: Icon.Binoculars },
    [KillChainPhase.Weaponization]: { phase: KillChainPhase.Weaponization, label: "Weaponization", icon: Icon.Flask },
    [KillChainPhase.Delivery]: { phase: KillChainPhase.Delivery, label: "Delivery", icon: Icon.Send },
    [KillChainPhase.Exploitation]: { phase: KillChainPhase.Exploitation, label: "Exploitation", icon: Icon.Exploit },
    [KillChainPhase.Installation]: { phase: KillChainPhase.Installation, label: "Installation", icon: Icon.Download },
    [KillChainPhase.CommandAndControl]: { phase: KillChainPhase.CommandAndControl, label: "Command and Control", icon: Icon.Beacon },
    [KillChainPhase.ActionsOnObjectives]: { phase: KillChainPhase.ActionsOnObjectives, label: "Actions on Objectives", icon: Icon.Target }
};

const RESPONSE_PHASES: Readonly<Record<ResponsePhase, ResponsePhaseInfo>> = {
    [ResponsePhase.None]: { phase: ResponsePhase.None, label: "Unclassified", icon: Icon.Unknown },
    [ResponsePhase.Detect]: { phase: ResponsePhase.Detect, label: "Detect", icon: Icon.Search },
    [ResponsePhase.Analyze]: { phase: ResponsePhase.Analyze, label: "Analyze", icon: Icon.Microscope },
    [ResponsePhase.Contain]: { phase: ResponsePhase.Contain, label: "Contain", icon: Icon.Shield },
    [ResponsePhase.Eradicate]: { phase: ResponsePhase.Eradicate, label: "Eradicate", icon: Icon.Trash },
    [ResponsePhase.Recover]: { phase: ResponsePhase.Recover, label: "Recover", icon: Icon.Recover },
    [ResponsePhase.Review]: { phase: ResponsePhase.Review, label: "Review", icon: Icon.Review }
};

const LINK_KINDS: Readonly<Record<LinkKind, LinkKindInfo>> = {
    [LinkKind.Owns]: { kind: LinkKind.Owns, label: "owns", directed: true },
    [LinkKind.MemberOf]: { kind: LinkKind.MemberOf, label: "member of", directed: true },
    [LinkKind.Manages]: { kind: LinkKind.Manages, label: "manages", directed: true },
    [LinkKind.HostedOn]: { kind: LinkKind.HostedOn, label: "hosted on", directed: true },
    [LinkKind.ConnectsTo]: { kind: LinkKind.ConnectsTo, label: "connects to", directed: true },
    [LinkKind.AccessGrantedTo]: { kind: LinkKind.AccessGrantedTo, label: "has access to", directed: true },
    [LinkKind.DataFlow]: { kind: LinkKind.DataFlow, label: "sends data to", directed: true },
    [LinkKind.LateralMovement]: { kind: LinkKind.LateralMovement, label: "moved laterally to", directed: true },
    [LinkKind.Exfiltration]: { kind: LinkKind.Exfiltration, label: "exfiltrated to", directed: true },
    [LinkKind.CommandAndControl]: { kind: LinkKind.CommandAndControl, label: "beacons to", directed: true },
    [LinkKind.Communication]: { kind: LinkKind.Communication, label: "communicates with", directed: false },
    [LinkKind.Trusts]: { kind: LinkKind.Trusts, label: "trusts", directed: false }
};

const OUTCOMES: Readonly<Record<StepOutcome, OutcomeInfo>> = {
    [StepOutcome.Unknown]: { outcome: StepOutcome.Unknown, label: "Unknown", icon: Icon.Unknown, colorToken: ThemeToken.InkMuted },
    [StepOutcome.Succeeded]: { outcome: StepOutcome.Succeeded, label: "Succeeded", icon: Icon.Success, colorToken: ThemeToken.SideAttacker },
    [StepOutcome.Failed]: { outcome: StepOutcome.Failed, label: "Failed", icon: Icon.Failure, colorToken: ThemeToken.Good },
    [StepOutcome.Blocked]: { outcome: StepOutcome.Blocked, label: "Blocked", icon: Icon.Blocked, colorToken: ThemeToken.Good },
    [StepOutcome.Detected]: { outcome: StepOutcome.Detected, label: "Detected", icon: Icon.Eye, colorToken: ThemeToken.SideDefender }
};

const DEFAULT_IMPACT_SCALE: ImpactScale = {
    unassessed: { level: Impact.Unknown, label: "Unknown", color: ThemeToken.ImpactUnknown },
    levels: [
        { level: Impact.None, label: "None", color: ThemeToken.ImpactNone },
        { level: Impact.Low, label: "Low", color: ThemeToken.ImpactLow },
        { level: Impact.Medium, label: "Medium", color: ThemeToken.ImpactMedium },
        { level: Impact.High, label: "High", color: ThemeToken.ImpactHigh },
        { level: Impact.Critical, label: "Critical", color: ThemeToken.ImpactCritical }
    ]
};

const IMPACT_LEVEL_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_LABEL_LENGTH = 60;

/**
 * Refuses a scale that could not be stored or told apart: level keys end up in the database and in every
 * payload, so they are held to plain identifiers and must be unique.
 */
export function checkImpactScale(scale: ImpactScale): void {
    if (scale.levels.length === 0) {
        throw new Error("An impact scale needs at least one level besides the unassessed one.");
    }
    const seen = new Set<string>();
    [scale.unassessed, ...scale.levels].forEach(entry => {
        if (!IMPACT_LEVEL_PATTERN.test(entry.level)) {
            throw new Error(`Impact level "${entry.level}" must be 1 to 40 letters, digits, dashes or underscores.`);
        }
        if (seen.has(entry.level)) {
            throw new Error(`Impact level "${entry.level}" appears twice in the scale.`);
        }
        if (!entry.label.trim() || entry.label.length > MAX_LABEL_LENGTH) {
            throw new Error(`Impact level "${entry.level}" needs a label of at most ${MAX_LABEL_LENGTH} characters.`);
        }
        seen.add(entry.level);
    });
}

/**
 * Milestone keys end up in host reports and in URLs, so they are held to the same plain identifier as an
 * impact level, and no key may be claimed twice.
 */
export function checkMilestones(milestones: readonly MilestoneInfo[]): void {
    const seen = new Set<string>();
    milestones.forEach(entry => {
        if (!IMPACT_LEVEL_PATTERN.test(entry.key)) {
            throw new Error(`Milestone "${entry.key}" must be 1 to 40 letters, digits, dashes or underscores.`);
        }
        if (seen.has(entry.key)) {
            throw new Error(`Milestone "${entry.key}" appears twice.`);
        }
        if (!entry.label.trim() || entry.label.length > MAX_LABEL_LENGTH) {
            throw new Error(`Milestone "${entry.key}" needs a label of at most ${MAX_LABEL_LENGTH} characters.`);
        }
        seen.add(entry.key);
    });
}

/**
 * A representation is addressed by key in the address bar, in stored placements and in stored settings,
 * so a host key is held to the same plain identifier as a milestone, and no key may be claimed twice.
 */
export function checkRepresentations(representations: readonly RepresentationInfo[]): void {
    const seen = new Set<string>();
    representations.forEach(entry => {
        if (!IMPACT_LEVEL_PATTERN.test(entry.representation)) {
            throw new Error(`Representation "${entry.representation}" must be 1 to 40 letters, digits, dashes or underscores.`);
        }
        if (seen.has(entry.representation)) {
            throw new Error(`Representation "${entry.representation}" appears twice.`);
        }
        if (!entry.label.trim() || entry.label.length > MAX_LABEL_LENGTH) {
            throw new Error(`Representation "${entry.representation}" needs a label of at most ${MAX_LABEL_LENGTH} characters.`);
        }
        seen.add(entry.representation);
    });
}

/**
 * Every level a rating may hold, the unassessed one first.
 */
export function impactLevelsOf(scale: ImpactScale): ImpactLevelInfo[] {
    return [scale.unassessed, ...scale.levels];
}

const REPRESENTATIONS: Readonly<Record<Representation, RepresentationInfo>> = {
    [Representation.SequentialTimeline]: representation(Representation.SequentialTimeline, "Sequential timeline", Icon.Timeline, "What happened, in order, along a single arrow.", false),
    [Representation.ActorSwimlanes]: representation(Representation.ActorSwimlanes, "Actor swimlanes", Icon.Lanes, "One lane per party, so everyone's actions line up in time.", false),
    [Representation.AttackerDefender]: representation(Representation.AttackerDefender, "Attacker vs defender", Icon.Scale, "Mirrored lanes around the clock, with the dwell time called out.", false),
    [Representation.RelationshipGraph]: representation(Representation.RelationshipGraph, "Relationship graph", Icon.Graph, "Every party and artifact, and how they connect.", true),
    [Representation.KillChainBoard]: representation(Representation.KillChainBoard, "Kill chain board", Icon.Columns, "Steps sorted into kill chain columns.", false),
    [Representation.AttackFlow]: representation(Representation.AttackFlow, "Attack flow", Icon.Branch, "Actions chained by cause, with the assets they touched.", false),
    [Representation.DiamondModel]: representation(Representation.DiamondModel, "Diamond model", Icon.Gem, "Adversary, capability, infrastructure and victim.", false),
    [Representation.AttackMatrix]: representation(Representation.AttackMatrix, "ATT&CK matrix", Icon.Grid, "Tactics and techniques lit up by what was observed.", false),
    [Representation.BlastRadius]: representation(Representation.BlastRadius, "Blast radius", Icon.Radius, "How far the compromise spread from patient zero.", false),
    [Representation.ResponseMetrics]: representation(Representation.ResponseMetrics, "Response metrics", Icon.Timer, "Time to detect, contain and recover.", false),
    [Representation.EvidenceTimeline]: representation(Representation.EvidenceTimeline, "Evidence timeline", Icon.Evidence, "Which source saw what, and where the blind spots were.", false),
    [Representation.Narrative]: representation(Representation.Narrative, "Narrative", Icon.Text, "The written account and the full record table.", false)
};

function splitPascalCase(value: string): string {
    return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function options<TValue extends string>(enumObject: Readonly<Record<string, TValue>>): OptionInfo<TValue>[] {
    return enumValues(enumObject).map(value => ({ value, label: splitPascalCase(value) }));
}

function copies<TInfo extends object>(entries: Readonly<Record<string, TInfo>>): TInfo[] {
    return Object.values(entries).map(entry => ({ ...entry }));
}

/**
 * A fresh copy of the built in vocabulary. Callers may relabel or recolour entries freely without
 * touching the defaults.
 */
export function buildCatalog(settings: CatalogOptions = {}): Catalog {
    const impactScale = structuredClone(settings.impactScale ?? DEFAULT_IMPACT_SCALE);
    checkImpactScale(impactScale);
    const milestones = structuredClone(settings.milestones ?? []);
    checkMilestones(milestones);
    const representations = [...copies(REPRESENTATIONS), ...structuredClone(settings.representations ?? [])];
    checkRepresentations(representations);
    return {
        nodeKinds: copies(NODE_KINDS),
        sides: copies(SIDES),
        attackTactics: copies(ATTACK_TACTICS),
        killChainPhases: copies(KILL_CHAIN_PHASES),
        responsePhases: copies(RESPONSE_PHASES),
        linkKinds: copies(LINK_KINDS),
        outcomes: copies(OUTCOMES),
        impactScale,
        confidences: options(Confidence),
        involvements: options(Involvement),
        audiences: options(Audience),
        representations,
        milestones
    };
}

export function categoryOf(kind: NodeKind): NodeCategory {
    return NODE_KINDS[kind].category;
}

export function killChainPhaseOf(value: AttackTactic): KillChainPhase {
    return ATTACK_TACTICS[value].killChainPhase;
}

/**
 * Where a record sits on the Diamond Model. The side wins over the kind, because a workstation run by
 * the attacker is their infrastructure while the same kind owned by the victim is not.
 */
export function diamondVertexOf(kind: NodeKind, side: Side): DiamondVertex {
    const info = NODE_KINDS[kind];
    if (side === Side.Attacker && info.category === NodeCategory.Actor) {
        return DiamondVertex.Adversary;
    }
    if (side === Side.Attacker) {
        return info.diamondVertex === DiamondVertex.Victim ? DiamondVertex.Infrastructure : info.diamondVertex;
    }
    if (info.category === NodeCategory.Actor) {
        return DiamondVertex.Victim;
    }
    return info.diamondVertex === DiamondVertex.Adversary ? DiamondVertex.Victim : info.diamondVertex;
}

/**
 * Normalized identity of a record, so the same host or person can be recognised across incidents.
 */
export function canonicalKeyOf(kind: NodeKind, identifier: string | null, name: string): string | null {
    const value = identifier && identifier.trim() ? identifier : name;
    if (!value || !value.trim()) {
        return null;
    }
    return `${kind}:${value.trim().toLowerCase()}`;
}
