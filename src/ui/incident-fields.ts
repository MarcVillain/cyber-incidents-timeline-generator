// Fields of an incident that the package does not know about. A host whose incident record is richer
// than the one here declares what it holds, and the dialog renders and reports it without ever reading
// the values: they live in the metadata bag and mean whatever the host means by them.

import type { Metadata } from "../core/models.js";

export enum IncidentFieldType {
    Text = "text",
    LongText = "long-text",
    Number = "number",
    Choice = "choice",
    Flag = "flag",
    Date = "date"
}

export interface IncidentFieldChoice {
    value: string;
    label: string;
}

export interface IncidentFieldDef {
    /** The key the value is kept under in the metadata of the incident. */
    key: string;
    label: string;
    type: IncidentFieldType;
    /** Shown in an empty text field. */
    hint?: string;
    /** Required for a choice field, ignored otherwise. */
    choices?: readonly IncidentFieldChoice[];
    required?: boolean;
    /** Whether the field is asked for when an incident is opened, rather than only in its details. */
    onCreate?: boolean;
}

export type IncidentFieldValue = string | number | boolean | null;

export function fieldValue(metadata: Metadata | null, definition: IncidentFieldDef): IncidentFieldValue {
    const held = metadata?.[definition.key];
    if (held === null || held === undefined) return null;
    if (definition.type === IncidentFieldType.Flag) return held === true;
    if (definition.type === IncidentFieldType.Number) return typeof held === "number" ? held : null;
    return typeof held === "string" || typeof held === "number" || typeof held === "boolean" ? String(held) : null;
}

/**
 * The metadata to send, the fields the host declared written over what the incident already carried, so
 * a key the host does not declare is left exactly as it was.
 */
export function withFieldValues(metadata: Metadata | null, values: ReadonlyMap<string, IncidentFieldValue>): Metadata | null {
    const merged: Record<string, unknown> = { ...metadata };
    values.forEach((value, key) => {
        if (value === null || value === "") {
            delete merged[key];
        } else {
            merged[key] = value;
        }
    });
    return Object.keys(merged).length > 0 ? merged : null;
}

/** A declaration that cannot be rendered is a mistake in the host's configuration, not a value to skip. */
export function checkIncidentFields(fields: readonly IncidentFieldDef[]): void {
    const seen = new Set<string>();
    fields.forEach(entry => {
        if (!entry.key.trim()) {
            throw new Error("An incident field needs a key.");
        }
        if (seen.has(entry.key)) {
            throw new Error(`Incident field "${entry.key}" is declared twice.`);
        }
        if (!entry.label.trim()) {
            throw new Error(`Incident field "${entry.key}" needs a label.`);
        }
        if (entry.type === IncidentFieldType.Choice && !entry.choices?.length) {
            throw new Error(`Incident field "${entry.key}" is a choice and lists no choices.`);
        }
        seen.add(entry.key);
    });
}
