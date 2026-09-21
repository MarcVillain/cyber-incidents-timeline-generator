// The one place stored records become the shapes a diagram carries. Adding a field to a record means
// touching the model and nothing here.

import type {
    DiagramLink,
    DiagramNode,
    DiagramStep,
    LayoutRecord,
    LinkFields,
    LinkRecord,
    NodeFields,
    NodePlacement,
    NodeRecord,
    StepFields,
    StepRecord
} from "./models.js";
import type { Vocabulary } from "./vocabulary.js";

function toPlacement(layout: LayoutRecord): NodePlacement {
    return { representation: layout.representation, x: layout.x, y: layout.y };
}

export function toDiagramNode(record: NodeRecord, layouts: readonly LayoutRecord[], vocabulary: Vocabulary): DiagramNode {
    const { incidentId, canonicalKey, ...fields } = record;
    return {
        ...fields,
        category: vocabulary.categoryOf(record.kind),
        diamondVertex: vocabulary.diamondVertexOf(record.kind, record.side),
        placements: layouts.filter(layout => layout.nodeId === record.id).map(toPlacement)
    };
}

export function toDiagramStep(record: StepRecord, vocabulary: Vocabulary): DiagramStep {
    const { incidentId, ...fields } = record;
    return {
        ...fields,
        involvements: record.involvements.map(entry => ({ ...entry })),
        audiences: [...record.audiences],
        tags: [...record.tags],
        killChainPhase: vocabulary.killChainPhaseOf(record.attackTactic)
    };
}

export function toDiagramLink(record: LinkRecord): DiagramLink {
    const { incidentId, ...fields } = record;
    return fields;
}

/**
 * The editable part of a record as the diagram carries it, which is what recreating it needs.
 */
export function nodeFieldsOf(node: DiagramNode): NodeFields {
    const { id, category, diamondVertex, placements, ...fields } = node;
    return fields;
}

export function stepFieldsOf(step: DiagramStep): StepFields {
    const { id, killChainPhase, ...fields } = step;
    return { ...fields, involvements: fields.involvements.map(entry => ({ ...entry })), audiences: [...fields.audiences], tags: [...fields.tags] };
}

export function linkFieldsOf(link: DiagramLink): LinkFields {
    const { id, ...fields } = link;
    return fields;
}
