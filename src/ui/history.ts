// Undo and redo for the diagram.
//
// Each entry knows how to put the world back and how to do the thing again. Records that come back
// after a delete carry a new identifier, so the history keeps a trail of renames and resolves every
// identifier through it before touching a record.

import type { RecordType } from "../core/enums.js";
import type { RecordId } from "../core/models.js";

const LIMIT = 50;

export interface HistoryEntry {
    label: string;
    undo(history: History): Promise<void> | void;
    redo(history: History): Promise<void> | void;
}

export class History {
    private readonly past: HistoryEntry[] = [];
    private readonly future: HistoryEntry[] = [];
    private readonly renames = new Map<string, RecordId>();
    private readonly onChange: () => void;
    private busy = false;

    constructor(onChange: () => void = () => undefined) {
        this.onChange = onChange;
    }

    get canUndo(): boolean {
        return !this.busy && this.past.length > 0;
    }

    get canRedo(): boolean {
        return !this.busy && this.future.length > 0;
    }

    get undoLabel(): string | null {
        return this.past.at(-1)?.label ?? null;
    }

    get redoLabel(): string | null {
        return this.future.at(-1)?.label ?? null;
    }

    /**
     * Follows the trail of renames so an entry recorded before a record was recreated still finds it.
     * Identifiers are only unique within one type of record, so the trail is kept per type.
     */
    resolve(type: RecordType, id: RecordId): RecordId {
        let current = id;
        const seen = new Set<RecordId>();
        while (!seen.has(current)) {
            seen.add(current);
            const next = this.renames.get(`${type}:${current}`);
            if (next === undefined) break;
            current = next;
        }
        return current;
    }

    rename(type: RecordType, oldId: RecordId, newId: RecordId): void {
        if (oldId !== newId) {
            this.renames.set(`${type}:${oldId}`, newId);
        }
    }

    push(entry: HistoryEntry): void {
        this.past.push(entry);
        if (this.past.length > LIMIT) {
            this.past.shift();
        }
        this.future.length = 0;
        this.onChange();
    }

    clear(): void {
        this.past.length = 0;
        this.future.length = 0;
        this.renames.clear();
        this.onChange();
    }

    async undo(): Promise<string | null> {
        const entry = this.canUndo ? this.past.pop() : undefined;
        return entry ? this.run(entry, () => entry.undo(this), this.future) : null;
    }

    async redo(): Promise<string | null> {
        const entry = this.canRedo ? this.future.pop() : undefined;
        return entry ? this.run(entry, () => entry.redo(this), this.past) : null;
    }

    /**
     * An entry whose record no longer exists cannot be replayed, and keeping it would only fail again,
     * so a failed replay drops it and reports the failure to the caller.
     */
    private async run(entry: HistoryEntry, action: () => Promise<void> | void, destination: HistoryEntry[]): Promise<string> {
        this.busy = true;
        this.onChange();
        try {
            await action();
            destination.push(entry);
            return entry.label;
        } finally {
            this.busy = false;
            this.onChange();
        }
    }
}
