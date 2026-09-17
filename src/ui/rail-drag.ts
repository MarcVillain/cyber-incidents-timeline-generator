// Where a record may be dropped in the rail. The sections are derived rather than stored: a record with
// children is a group, and a record with no parent sits under its category. So the only thing a drop can
// change is which record a record belongs to, and everything else follows.

import type { RecordId } from "../core/models.js";

/** What the check needs from a record, so it can run on the store or on a plain list in a test. */
export interface Parented {
    id: RecordId;
    parentId: RecordId | null;
}

/** The record a drop would move something into, or the top level. */
export type DropTarget = RecordId | null;

function descendants(nodes: readonly Parented[], root: RecordId): Set<RecordId> {
    const found = new Set<RecordId>([root]);
    let growing = true;
    while (growing) {
        growing = false;
        nodes.forEach(node => {
            if (node.parentId !== null && found.has(node.parentId) && !found.has(node.id)) {
                found.add(node.id);
                growing = true;
            }
        });
    }
    return found;
}

/**
 * Whether dragging a record onto a target would change anything the service would accept. A record
 * cannot be placed inside itself or inside anything it already holds, and a drop that lands where the
 * record already is changes nothing and is refused rather than written.
 */
export function canDrop(nodes: readonly Parented[], draggedId: RecordId, target: DropTarget): boolean {
    const dragged = nodes.find(node => node.id === draggedId);
    if (!dragged) return false;
    if (dragged.parentId === target) return false;
    if (target === null) return true;
    return !descendants(nodes, draggedId).has(target);
}
