import { actorSwimlanes } from "./actor-swimlanes.js";
import { attackFlow } from "./attack-flow.js";
import { attackMatrix } from "./attack-matrix.js";
import { attackerDefender } from "./attacker-defender.js";
import { blastRadius } from "./blast-radius.js";
import { diamondModel } from "./diamond-model.js";
import { evidenceTimeline } from "./evidence-timeline.js";
import { killChainBoard } from "./kill-chain-board.js";
import { narrative } from "./narrative.js";
import type { Renderer } from "./registry.js";
import { relationshipGraph } from "./relationship-graph.js";
import { responseMetrics } from "./response-metrics.js";
import { sequentialTimeline } from "./sequential-timeline.js";

export * from "./registry.js";
export {
    actorSwimlanes,
    attackFlow,
    attackMatrix,
    attackerDefender,
    blastRadius,
    diamondModel,
    evidenceTimeline,
    killChainBoard,
    narrative,
    relationshipGraph,
    responseMetrics,
    sequentialTimeline
};

/**
 * Every representation that ships with the tool, in the order the view switcher shows them. Pass a
 * subset, or add renderers of your own, through the renderers option of mountTimeline.
 */
export const BUILT_IN_RENDERERS: readonly Renderer[] = [
    sequentialTimeline,
    actorSwimlanes,
    attackerDefender,
    relationshipGraph,
    killChainBoard,
    attackFlow,
    diamondModel,
    attackMatrix,
    blastRadius,
    responseMetrics,
    evidenceTimeline,
    narrative
];
