// The catalog read by key. A record may hold a key its catalog no longer has, because an entry was removed
// while records still used it; such a key is answered with an entry of its own name that means nothing,
// so the record is drawn as unknown rather than failing, until someone edits it.

import type {
    AttackTacticInfo,
    Catalog,
    KillChainPhaseInfo,
    LinkKindInfo,
    NodeKindInfo,
    OptionInfo,
    OutcomeInfo,
    ResponsePhaseInfo,
    SideInfo
} from "./catalog.js";
import {
    Confidence,
    DiamondVertex,
    Involvement,
    KillChainPhase,
    LinkKind,
    NodeCategory,
    OutcomeMeaning,
    ResponseStage,
    SideRole,
    type AttackTacticKey,
    type AudienceKey,
    type ConfidenceKey,
    type InvolvementKey,
    type KillChainPhaseKey,
    type LinkKindKey,
    type NodeKindKey,
    type OutcomeKey,
    type ResponsePhaseKey,
    type SideKey
} from "./enums.js";
import { Icon } from "./icon.js";
import { ThemeToken } from "./theme-token.js";

function preferred(keys: readonly string[], wanted: string): string {
    return keys.includes(wanted) ? wanted : keys[0] ?? wanted;
}

function indexBy<TEntry>(entries: readonly TEntry[], key: (entry: TEntry) => string): ReadonlyMap<string, TEntry> {
    return new Map(entries.map(entry => [key(entry), entry]));
}

export class Vocabulary {
    private readonly sides: ReadonlyMap<string, SideInfo>;
    private readonly nodeKinds: ReadonlyMap<string, NodeKindInfo>;
    private readonly tactics: ReadonlyMap<string, AttackTacticInfo>;
    private readonly killChainPhases: ReadonlyMap<string, KillChainPhaseInfo>;
    private readonly responsePhases: ReadonlyMap<string, ResponsePhaseInfo>;
    private readonly outcomes: ReadonlyMap<string, OutcomeInfo>;
    private readonly linkKinds: ReadonlyMap<string, LinkKindInfo>;
    private readonly confidences: ReadonlyMap<string, OptionInfo<ConfidenceKey>>;
    private readonly involvements: ReadonlyMap<string, OptionInfo<InvolvementKey>>;
    private readonly audiences: ReadonlyMap<string, OptionInfo<AudienceKey>>;
    /*
     * What a new record holds when nothing was said. The built in defaults hold for as long as the catalog
     * keeps them, and the first entry of the list stands in after.
     */
    readonly defaultConfidence: ConfidenceKey;
    readonly defaultLinkKind: LinkKindKey;
    readonly defaultInvolvement: InvolvementKey;

    constructor(catalog: Catalog) {
        this.sides = indexBy(catalog.sides, entry => entry.side);
        this.nodeKinds = indexBy(catalog.nodeKinds, entry => entry.kind);
        this.tactics = indexBy(catalog.attackTactics, entry => entry.tactic);
        this.killChainPhases = indexBy(catalog.killChainPhases, entry => entry.phase);
        this.responsePhases = indexBy(catalog.responsePhases, entry => entry.phase);
        this.outcomes = indexBy(catalog.outcomes, entry => entry.outcome);
        this.linkKinds = indexBy(catalog.linkKinds, entry => entry.kind);
        this.confidences = indexBy(catalog.confidences, entry => entry.value);
        this.involvements = indexBy(catalog.involvements, entry => entry.value);
        this.audiences = indexBy(catalog.audiences, entry => entry.value);
        this.defaultConfidence = preferred(catalog.confidences.map(entry => entry.value), Confidence.Confirmed);
        this.defaultLinkKind = preferred(catalog.linkKinds.map(entry => entry.kind), LinkKind.ConnectsTo);
        this.defaultInvolvement = preferred(catalog.involvements.map(entry => entry.value), Involvement.Involved);
    }

    hasSide(key: SideKey): boolean {
        return this.sides.has(key);
    }

    side(key: SideKey): SideInfo {
        return this.sides.get(key) ?? {
            side: key, label: key, icon: Icon.Unknown, role: SideRole.Neutral, colorToken: ThemeToken.SideUnknown, surfaceToken: ThemeToken.SurfaceUnknown
        };
    }

    sideRole(key: SideKey): SideRole {
        return this.side(key).role;
    }

    nodeKind(key: NodeKindKey): NodeKindInfo {
        return this.nodeKinds.get(key) ?? { kind: key, category: NodeCategory.Resource, label: key, icon: Icon.Unknown, diamondVertex: DiamondVertex.Infrastructure };
    }

    tactic(key: AttackTacticKey): AttackTacticInfo {
        return this.tactics.get(key) ?? { tactic: key, label: key, attackId: null, icon: Icon.Unknown, killChainPhase: KillChainPhase.None };
    }

    killChainPhase(key: KillChainPhaseKey): KillChainPhaseInfo {
        return this.killChainPhases.get(key) ?? { phase: key, label: key, icon: Icon.Unknown };
    }

    killChainPhaseOf(tactic: AttackTacticKey): KillChainPhaseKey {
        return this.tactic(tactic).killChainPhase;
    }

    responsePhase(key: ResponsePhaseKey): ResponsePhaseInfo {
        return this.responsePhases.get(key) ?? { phase: key, label: key, icon: Icon.Unknown, stage: ResponseStage.None };
    }

    responseStage(key: ResponsePhaseKey): ResponseStage {
        return this.responsePhase(key).stage;
    }

    outcome(key: OutcomeKey): OutcomeInfo {
        return this.outcomes.get(key) ?? { outcome: key, label: key, icon: Icon.Unknown, colorToken: ThemeToken.InkMuted, meaning: OutcomeMeaning.Unknown };
    }

    outcomeMeaning(key: OutcomeKey): OutcomeMeaning {
        return this.outcome(key).meaning;
    }

    linkKind(key: LinkKindKey): LinkKindInfo {
        return this.linkKinds.get(key) ?? { kind: key, label: key, directed: true };
    }

    confidence(key: ConfidenceKey): OptionInfo<ConfidenceKey> {
        return this.confidences.get(key) ?? { value: key, label: key };
    }

    involvement(key: InvolvementKey): OptionInfo<InvolvementKey> {
        return this.involvements.get(key) ?? { value: key, label: key };
    }

    audience(key: AudienceKey): OptionInfo<AudienceKey> {
        return this.audiences.get(key) ?? { value: key, label: key };
    }

    categoryOf(kind: NodeKindKey): NodeCategory {
        return this.nodeKind(kind).category;
    }

    /**
     * Where a record sits on the Diamond Model. The side wins over the kind, because a workstation run by
     * the attacker is their infrastructure while the same kind owned by the victim is not.
     */
    diamondVertexOf(kind: NodeKindKey, side: SideKey): DiamondVertex {
        const info = this.nodeKind(kind);
        if (this.sideRole(side) === SideRole.Attacker) {
            if (info.category === NodeCategory.Actor) return DiamondVertex.Adversary;
            return info.diamondVertex === DiamondVertex.Victim ? DiamondVertex.Infrastructure : info.diamondVertex;
        }
        if (info.category === NodeCategory.Actor) {
            return DiamondVertex.Victim;
        }
        return info.diamondVertex === DiamondVertex.Adversary ? DiamondVertex.Victim : info.diamondVertex;
    }
}
