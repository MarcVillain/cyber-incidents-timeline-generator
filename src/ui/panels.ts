import type { NodeKindInfo } from "../core/catalog.js";
import { RecordType } from "../core/enums.js";
import type { LinkCreateInput, LinkUpdateInput, NodeCreateInput, NodeUpdateInput, RecordId, StepCreateInput, StepUpdateInput } from "../core/models.js";
import type { TimeFormats } from "../core/time.js";
import type { DiagramStore } from "./diagram-store.js";
import type { IconSet } from "./icons/icon-set.js";
import type { Strings } from "./strings.js";

export interface TimelinePermissions {
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    /** Whether the export menu is offered. Defaults to true. */
    canExport?: boolean;
    /** Whether records can be dragged into place in the representations that allow it. Defaults to canEdit. */
    canMove?: boolean;
    /**
     * A finer answer for one kind of record, asked only once the matching flag above allows the action.
     * Nothing to say means yes, which is how "may add steps, may not delete records" is expressed.
     */
    can?(action: RecordAction, type: RecordType): boolean;
}

export enum RecordAction {
    Create = "create",
    Edit = "edit",
    Delete = "delete"
}

/**
 * The permissions with their defaults filled in and the per record answer folded in, so no panel has to
 * remember which flag guards what.
 */
export class Access implements TimelinePermissions {
    readonly canCreate: boolean;
    readonly canEdit: boolean;
    readonly canDelete: boolean;
    readonly canExport: boolean;
    readonly canMove: boolean;
    private readonly ask: ((action: RecordAction, type: RecordType) => boolean) | null;

    constructor(permissions: Partial<TimelinePermissions> = {}) {
        this.canCreate = permissions.canCreate ?? true;
        this.canEdit = permissions.canEdit ?? true;
        this.canDelete = permissions.canDelete ?? true;
        this.canExport = permissions.canExport ?? true;
        this.canMove = permissions.canMove ?? this.canEdit;
        this.ask = permissions.can ?? null;
    }

    mayCreate(type: RecordType): boolean {
        return this.canCreate && this.allows(RecordAction.Create, type);
    }

    mayEdit(type: RecordType): boolean {
        return this.canEdit && this.allows(RecordAction.Edit, type);
    }

    mayDelete(type: RecordType): boolean {
        return this.canDelete && this.allows(RecordAction.Delete, type);
    }

    private allows(action: RecordAction, type: RecordType): boolean {
        return this.ask === null || this.ask(action, type);
    }
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
    permissions: Access;
    icons: IconSet;
    strings: Strings;
    time: TimeFormats;
    signal: AbortSignal;
}

export interface PendingRecord {
    kind: NodeKindInfo;
}
