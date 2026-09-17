import type { NodeKindInfo } from "../core/catalog.js";
import type { RecordType } from "../core/enums.js";
import type { LinkCreateInput, LinkUpdateInput, NodeCreateInput, NodeUpdateInput, RecordId, StepCreateInput, StepUpdateInput } from "../core/models.js";
import type { TimeFormats } from "../core/time.js";
import type { DiagramStore } from "./diagram-store.js";
import type { IconSet } from "./icons/icon-set.js";
import type { Strings } from "./strings.js";

export interface TimelinePermissions {
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
}

export type RecordDraft =
    | { type: RecordType.Node; input: NodeCreateInput }
    | { type: RecordType.Step; input: StepCreateInput }
    | { type: RecordType.Link; input: LinkCreateInput };

export type RecordEdit =
    | { type: RecordType.Node; patch: NodeUpdateInput }
    | { type: RecordType.Step; patch: StepUpdateInput }
    | { type: RecordType.Link; patch: LinkUpdateInput };

/**
 * What the side panels may ask of the workspace. They never talk to the API themselves, so every change
 * goes through the one place that records it for undo.
 */
export interface WorkspaceActions {
    create(draft: RecordDraft): Promise<RecordId | null>;
    edit(id: RecordId, edit: RecordEdit): void;
    remove(type: RecordType, id: RecordId): Promise<void>;
    notify(message: string): void;
}

export interface PanelContext {
    store: DiagramStore;
    actions: WorkspaceActions;
    permissions: TimelinePermissions;
    icons: IconSet;
    strings: Strings;
    time: TimeFormats;
    signal: AbortSignal;
}

export interface PendingRecord {
    kind: NodeKindInfo;
}
