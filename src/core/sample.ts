// A short made up incident, for demos, first runs and tests. It goes through the public API like any
// caller would, so it also shows how a host feeds the workspace.

import {
    AttackTactic,
    Audience,
    Confidence,
    Impact,
    Involvement,
    LinkKind,
    NodeKind,
    ResponsePhase,
    Side,
    StepOutcome
} from "./enums.js";
import type { Incident, NodeCreateInput, RecordId, StepCreateInput } from "./models.js";
import type { TimelineApi } from "./service.js";
import { formatWallClock, millisecondsFromHours } from "./time.js";

const SAMPLE_SCOPE = "Example Corp";
const SAMPLE_START_MONTH = 0;
const SAMPLE_START_DAY = 12;
const SAMPLE_START_HOUR = 8;

interface HistoryEntry {
    daysBefore: number;
    detectAfterHours: number;
    containAfterHours: number;
    recoverAfterHours: number;
}

// Earlier incidents of the same scope, so the benchmark view has something to compare against
const HISTORY: readonly HistoryEntry[] = [
    { daysBefore: 40, detectAfterHours: 30, containAfterHours: 10, recoverAfterHours: 50 },
    { daysBefore: 95, detectAfterHours: 14, containAfterHours: 6, recoverAfterHours: 26 },
    { daysBefore: 160, detectAfterHours: 60, containAfterHours: 20, recoverAfterHours: 90 },
    { daysBefore: 230, detectAfterHours: 8, containAfterHours: 5, recoverAfterHours: 18 }
];

const HOURS_PER_DAY = 24;

export function defaultSampleStart(): Date {
    return new Date(new Date().getFullYear(), SAMPLE_START_MONTH, SAMPLE_START_DAY, SAMPLE_START_HOUR, 0, 0);
}

function at(start: Date, hours: number): string {
    return formatWallClock(new Date(start.getTime() + millisecondsFromHours(hours)));
}

async function seedHistory(api: TimelineApi, start: Date): Promise<void> {
    for (const [index, entry] of HISTORY.entries()) {
        const occurred = new Date(start.getTime() - millisecondsFromHours(entry.daysBefore * HOURS_PER_DAY));
        const incident = await api.createIncident({ title: `Earlier incident ${index + 1}`, scope: SAMPLE_SCOPE, impact: Impact.Medium });
        await api.createStep(incident.id, { timestamp: at(occurred, 0), title: "Initial compromise", side: Side.Attacker, attackTactic: AttackTactic.InitialAccess });
        await api.createStep(incident.id, { timestamp: at(occurred, entry.detectAfterHours), title: "Detected", side: Side.Defender, responsePhase: ResponsePhase.Detect, outcome: StepOutcome.Detected });
        await api.createStep(incident.id, { timestamp: at(occurred, entry.detectAfterHours + entry.containAfterHours), title: "Contained", side: Side.Defender, responsePhase: ResponsePhase.Contain, outcome: StepOutcome.Blocked });
        await api.createStep(incident.id, { timestamp: at(occurred, entry.detectAfterHours + entry.recoverAfterHours), title: "Recovered", side: Side.Defender, responsePhase: ResponsePhase.Recover, outcome: StepOutcome.Succeeded });
    }
}

/**
 * Creates a phishing incident that ends in data theft, with a few earlier incidents behind it.
 * Returns the incident the workspace should open.
 */
export async function seedSampleData(api: TimelineApi, start: Date = defaultSampleStart()): Promise<Incident> {
    await seedHistory(api, start);

    const incident = await api.createIncident({
        title: "Invoice phishing leading to data theft",
        referenceId: "SAMPLE-001",
        impact: Impact.High,
        scope: SAMPLE_SCOPE,
        classifications: ["Phishing", "Data exfiltration"]
    });

    const node = async (input: NodeCreateInput): Promise<RecordId> => (await api.createNode(incident.id, input)).id;

    const actor = await node({ name: "Unknown threat actor", kind: NodeKind.ThreatActor, side: Side.Attacker });
    const c2 = await node({ name: "Command server", kind: NodeKind.C2Server, side: Side.Attacker, identifier: "203.0.113.24" });
    const company = await node({ name: SAMPLE_SCOPE, kind: NodeKind.Company, side: Side.Victim });
    const clerk = await node({ name: "Finance clerk", kind: NodeKind.Person, side: Side.Victim, parentId: company, role: "Accounts payable" });
    const mailbox = await node({ name: "Finance mailbox", kind: NodeKind.Mailbox, side: Side.Victim, parentId: company, identifier: "finance@example.com", compromised: true });
    const workstation = await node({ name: "FIN-WS-042", kind: NodeKind.Workstation, side: Side.Victim, parentId: company, criticality: Impact.Medium, compromised: true });
    const fileServer = await node({ name: "File server", kind: NodeKind.Server, side: Side.Victim, parentId: company, identifier: "fs01.example.local", criticality: Impact.Critical, compromised: true });
    const credentials = await node({ name: "Clerk credentials", kind: NodeKind.Credential, side: Side.Victim, compromised: true });
    const soc = await node({ name: "Security operations", kind: NodeKind.Team, side: Side.Defender });
    const retainer = await node({ name: "Incident response retainer", kind: NodeKind.Vendor, side: Side.ThirdParty });

    const step = async (input: StepCreateInput): Promise<RecordId> => (await api.createStep(incident.id, input)).id;

    await step({ timestamp: at(start, 0), title: "Phishing message delivered", side: Side.Attacker, attackTactic: AttackTactic.InitialAccess, mitreTechniqueId: "T1566.001", severity: Impact.Medium, outcome: StepOutcome.Succeeded, isMilestone: true, evidenceSource: "Mail gateway", sourceNodeId: actor, targetNodeId: mailbox, description: "An invoice themed message with a macro laden attachment reached the finance mailbox." });
    await step({ timestamp: at(start, 0.5), title: "Malicious attachment opened", side: Side.Attacker, attackTactic: AttackTactic.Execution, mitreTechniqueId: "T1204.002", outcome: StepOutcome.Succeeded, evidenceSource: "EDR", sourceNodeId: clerk, targetNodeId: workstation });
    const beacon = await step({ timestamp: at(start, 1), title: "Implant beacons out", side: Side.Attacker, attackTactic: AttackTactic.CommandAndControl, mitreTechniqueId: "T1071.001", evidenceSource: "Proxy", sourceNodeId: workstation, targetNodeId: c2 });
    await step({ timestamp: at(start, 3), title: "Credentials harvested", side: Side.Attacker, attackTactic: AttackTactic.CredentialAccess, mitreTechniqueId: "T1003", evidenceSource: "EDR", sourceNodeId: workstation, targetNodeId: credentials });
    await step({ timestamp: at(start, 5), title: "Credentials replayed on the file server", side: Side.Attacker, attackTactic: AttackTactic.LateralMovement, mitreTechniqueId: "T1021.002", severity: Impact.High, outcome: StepOutcome.Succeeded, isMilestone: true, evidenceSource: "Domain controller", sourceNodeId: actor, targetNodeId: fileServer, involvements: [{ nodeId: credentials, involvement: Involvement.Tool }] });
    await step({ timestamp: at(start, 9), title: "Alert raised on unusual SMB traffic", side: Side.Defender, responsePhase: ResponsePhase.Detect, outcome: StepOutcome.Detected, isMilestone: true, evidenceSource: "SIEM", sourceNodeId: soc, targetNodeId: fileServer });
    await step({ timestamp: at(start, 11), title: "Scope of access analysed", side: Side.Defender, responsePhase: ResponsePhase.Analyze, evidenceSource: "EDR", sourceNodeId: soc, targetNodeId: fileServer });
    await step({ timestamp: at(start, 12), endTimestamp: at(start, 13), title: "Archive staged and exfiltrated", side: Side.Attacker, attackTactic: AttackTactic.Exfiltration, mitreTechniqueId: "T1041", severity: Impact.Critical, outcome: StepOutcome.Succeeded, evidenceSource: "Proxy", sourceNodeId: fileServer, targetNodeId: c2 });
    await step({ timestamp: at(start, 14), title: "Account disabled and server isolated", side: Side.Defender, responsePhase: ResponsePhase.Contain, outcome: StepOutcome.Blocked, isMilestone: true, sourceNodeId: soc, targetNodeId: fileServer });
    await step({ timestamp: at(start, 20), title: "Forensic imaging of the workstation", side: Side.ThirdParty, responsePhase: ResponsePhase.Analyze, evidenceSource: "Forensics", sourceNodeId: retainer, targetNodeId: workstation });
    await step({ timestamp: at(start, 30), title: "Implant removed and credentials rotated", side: Side.Defender, responsePhase: ResponsePhase.Eradicate, outcome: StepOutcome.Succeeded, sourceNodeId: soc, targetNodeId: workstation });
    await step({ timestamp: at(start, 48), title: "Services restored from clean backups", side: Side.Defender, responsePhase: ResponsePhase.Recover, outcome: StepOutcome.Succeeded, isMilestone: true, sourceNodeId: soc, targetNodeId: fileServer });
    await step({ timestamp: at(start, 72), timeKnown: false, title: "Lessons learned review", side: Side.Defender, responsePhase: ResponsePhase.Review, audience: Audience.Executive, sourceNodeId: soc });

    await api.createLink(incident.id, { sourceNodeId: clerk, targetNodeId: workstation, kind: LinkKind.Owns });
    await api.createLink(incident.id, { sourceNodeId: clerk, targetNodeId: credentials, kind: LinkKind.Owns });
    await api.createLink(incident.id, { sourceNodeId: workstation, targetNodeId: c2, kind: LinkKind.CommandAndControl, stepId: beacon });
    await api.createLink(incident.id, { sourceNodeId: workstation, targetNodeId: fileServer, kind: LinkKind.LateralMovement, confidence: Confidence.Likely });
    await api.createLink(incident.id, { sourceNodeId: fileServer, targetNodeId: c2, kind: LinkKind.Exfiltration });
    await api.createLink(incident.id, { sourceNodeId: retainer, targetNodeId: soc, kind: LinkKind.Communication });

    return incident;
}
