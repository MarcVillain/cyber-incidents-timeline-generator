/**
 * Which camp a record belongs to. Drives the colour scheme of every representation.
 */
export enum Side {
    Unknown = "Unknown",
    Attacker = "Attacker",
    Victim = "Victim",
    Defender = "Defender",
    ThirdParty = "ThirdParty"
}

/**
 * How sure the analyst is about a step or a link. Rendered as a solid or a dashed stroke.
 */
export enum Confidence {
    Unknown = "Unknown",
    Suspected = "Suspected",
    Likely = "Likely",
    Confirmed = "Confirmed"
}

/**
 * Separates the two families of records without needing a second table.
 */
export enum NodeCategory {
    Actor = "Actor",
    Resource = "Resource"
}

export enum NodeKind {
    Person = "Person",
    Team = "Team",
    Company = "Company",
    ThreatActor = "ThreatActor",
    Vendor = "Vendor",
    Authority = "Authority",
    Workstation = "Workstation",
    Server = "Server",
    Account = "Account",
    Mailbox = "Mailbox",
    File = "File",
    Application = "Application",
    Network = "Network",
    CloudService = "CloudService",
    Credential = "Credential",
    Database = "Database",
    Device = "Device",
    Malware = "Malware",
    Tool = "Tool",
    Exploit = "Exploit",
    C2Server = "C2Server",
    Domain = "Domain",
    IpAddress = "IpAddress",
    Infrastructure = "Infrastructure"
}

/**
 * MITRE ATT&CK Enterprise tactics, ordered as they appear in the matrix.
 */
export enum AttackTactic {
    None = "None",
    Reconnaissance = "Reconnaissance",
    ResourceDevelopment = "ResourceDevelopment",
    InitialAccess = "InitialAccess",
    Execution = "Execution",
    Persistence = "Persistence",
    PrivilegeEscalation = "PrivilegeEscalation",
    DefenseEvasion = "DefenseEvasion",
    CredentialAccess = "CredentialAccess",
    Discovery = "Discovery",
    LateralMovement = "LateralMovement",
    Collection = "Collection",
    CommandAndControl = "CommandAndControl",
    Exfiltration = "Exfiltration",
    Impact = "Impact"
}

/**
 * Lockheed Martin Cyber Kill Chain phases. Derived from the ATT&CK tactic of a step, never stored.
 */
export enum KillChainPhase {
    None = "None",
    Reconnaissance = "Reconnaissance",
    Weaponization = "Weaponization",
    Delivery = "Delivery",
    Exploitation = "Exploitation",
    Installation = "Installation",
    CommandAndControl = "CommandAndControl",
    ActionsOnObjectives = "ActionsOnObjectives"
}

/**
 * NIST SP 800-61 incident response phases, used for defender steps.
 */
export enum ResponsePhase {
    None = "None",
    Detect = "Detect",
    Analyze = "Analyze",
    Contain = "Contain",
    Eradicate = "Eradicate",
    Recover = "Recover",
    Review = "Review"
}

export enum StepOutcome {
    Unknown = "Unknown",
    Succeeded = "Succeeded",
    Failed = "Failed",
    Blocked = "Blocked",
    Detected = "Detected"
}

/**
 * Lets a single dataset render an executive slide and a technical slide without re-entering anything.
 * Executive and Technical are the audiences the catalog starts with. Both is no audience of its own: as a
 * filter it lets every step through, and a step written for everyone lists no audience at all.
 */
export enum Audience {
    Both = "Both",
    Executive = "Executive",
    Technical = "Technical"
}

/**
 * How much of the names an incident holds a view lets through. Stored records are never changed: only what
 * is drawn, listed and exported is.
 */
export enum Disclosure {
    Full = "Full",
    /** Every protected name replaced by an alias such as Org-1, the same alias wherever the name appears. */
    Anonymized = "Anonymized",
    /** Every protected name replaced by a bar of a few fixed lengths, so the bar tells little about the name. */
    Censored = "Censored"
}

/**
 * How far a mention may stray from a protected name and still be caught: case and punctuation only, then
 * accents, glued words and a typo, then a few typos.
 */
export enum FuzzyLevel {
    Exact = "Exact",
    Normal = "Normal",
    Aggressive = "Aggressive"
}

/** How a mention strays from a name, in the examples that explain the sensitivity. */
export enum FuzzyExampleReason {
    Case = "Case",
    Accent = "Accent",
    Glued = "Glued",
    Typo = "Typo",
    Typos = "Typos"
}

/** What a protected name is, which picks its alias prefix and lets a whole kind of name be revealed. */
export enum SensitiveCategory {
    Organization = "Organization",
    Person = "Person",
    Team = "Team",
    ThreatActor = "ThreatActor",
    Asset = "Asset",
    Capability = "Capability",
    Account = "Account",
    Ip = "Ip",
    Email = "Email",
    Hostname = "Hostname",
    Domain = "Domain",
    Url = "Url",
    Hash = "Hash",
    Username = "Username",
    Other = "Other"
}

/**
 * What a side stands for, which is what the views ask rather than the side itself, so a side added to
 * the catalog, such as an insider, is drawn and measured like the camp it belongs to.
 */
export enum SideRole {
    Attacker = "Attacker",
    Defender = "Defender",
    /** Helps the response, such as a retainer, without its steps counting toward the response figures. */
    Ally = "Ally",
    Victim = "Victim",
    Neutral = "Neutral"
}

/** The response figure a phase counts toward, if any. */
export enum ResponseStage {
    None = "None",
    Detection = "Detection",
    Containment = "Containment",
    Eradication = "Eradication",
    Recovery = "Recovery"
}

/** What an outcome says about the step, which decides its colour and whether it stopped the attack. */
export enum OutcomeMeaning {
    Unknown = "Unknown",
    Succeeded = "Succeeded",
    Failed = "Failed",
    Blocked = "Blocked",
    Detected = "Detected"
}

export enum Involvement {
    Involved = "Involved",
    Target = "Target",
    Tool = "Tool",
    Affected = "Affected",
    Observer = "Observer"
}

export enum LinkKind {
    Owns = "Owns",
    MemberOf = "MemberOf",
    Manages = "Manages",
    HostedOn = "HostedOn",
    ConnectsTo = "ConnectsTo",
    AccessGrantedTo = "AccessGrantedTo",
    DataFlow = "DataFlow",
    LateralMovement = "LateralMovement",
    Exfiltration = "Exfiltration",
    CommandAndControl = "CommandAndControl",
    Communication = "Communication",
    Trusts = "Trusts"
}

/*
 * The key of an entry of a vocabulary list: one the catalog starts with, or one a deployment added. The
 * stored value is the key, so the enums above name the built in keys rather than the only ones.
 */
export type SideKey = Side | string;
export type NodeKindKey = NodeKind | string;
export type AttackTacticKey = AttackTactic | string;
export type KillChainPhaseKey = KillChainPhase | string;
export type ResponsePhaseKey = ResponsePhase | string;
export type OutcomeKey = StepOutcome | string;
export type LinkKindKey = LinkKind | string;
export type ConfidenceKey = Confidence | string;
export type InvolvementKey = Involvement | string;
export type AudienceKey = Audience | string;

/**
 * The key of a representation: one of the built in flavours below, or a key a host declared in its
 * catalog for a representation of its own. Also the key under which manual placements are kept.
 */
export type RepresentationKey = Representation | string;

/**
 * The diagram flavours the workspace can draw. Also the key under which manual placements are kept.
 */
export enum Representation {
    SequentialTimeline = "SequentialTimeline",
    ActorSwimlanes = "ActorSwimlanes",
    AttackerDefender = "AttackerDefender",
    RelationshipGraph = "RelationshipGraph",
    KillChainBoard = "KillChainBoard",
    AttackFlow = "AttackFlow",
    DiamondModel = "DiamondModel",
    AttackMatrix = "AttackMatrix",
    BlastRadius = "BlastRadius",
    ResponseMetrics = "ResponseMetrics",
    EvidenceTimeline = "EvidenceTimeline",
    Narrative = "Narrative"
}

/**
 * Vertices of the Diamond Model of Intrusion Analysis. Derived from the kind and the side of a record.
 */
export enum DiamondVertex {
    Adversary = "Adversary",
    Capability = "Capability",
    Infrastructure = "Infrastructure",
    Victim = "Victim"
}

/**
 * The level keys of the default impact scale. A deployment configuring its own scale uses its own keys.
 */
export enum Impact {
    Unknown = "Unknown",
    None = "None",
    Low = "Low",
    Medium = "Medium",
    High = "High",
    Critical = "Critical"
}

export enum RecordType {
    Node = "node",
    Step = "step",
    Link = "link"
}

/**
 * What a caller is attempting, so a host can plug its own authorization in front of every operation.
 */
export enum Permission {
    Read = "Read",
    Create = "Create",
    Update = "Update",
    Delete = "Delete",
    /** Changing the catalog every incident is recorded against, which a host may keep to administrators. */
    Configure = "Configure"
}

export function enumValues<TValue extends string>(enumObject: Readonly<Record<string, TValue>>): readonly TValue[] {
    return Object.values(enumObject);
}

export function isEnumValue<TValue extends string>(enumObject: Readonly<Record<string, TValue>>, value: unknown): value is TValue {
    return typeof value === "string" && enumValues(enumObject).some(candidate => candidate === value);
}
