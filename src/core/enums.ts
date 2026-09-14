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
 */
export enum Audience {
    Both = "Both",
    Executive = "Executive",
    Technical = "Technical"
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
    Delete = "Delete"
}

export function enumValues<TValue extends string>(enumObject: Readonly<Record<string, TValue>>): readonly TValue[] {
    return Object.values(enumObject);
}

export function isEnumValue<TValue extends string>(enumObject: Readonly<Record<string, TValue>>, value: unknown): value is TValue {
    return typeof value === "string" && enumValues(enumObject).some(candidate => candidate === value);
}
