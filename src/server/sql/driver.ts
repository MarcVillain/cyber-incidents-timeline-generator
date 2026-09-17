import { isEnumValue } from "../../core/enums.js";

/** A JSON document a driver may hand back for a column the engine parses itself, such as PostgreSQL JSONB. */
export type SqlJson = Readonly<Record<string, unknown>>;

export type SqlValue = string | number | null;

/** What a row may hold. Wider than a parameter, because an engine may parse a JSON column for us. */
export type SqlColumn = SqlValue | SqlJson;
export type SqlRow = Readonly<Record<string, SqlColumn>>;

/**
 * The only thing SqlTimelineStore needs from a database. Statements use ? placeholders and standard
 * SQL, including INSERT ... RETURNING, so a driver for another engine only has to translate the
 * placeholders when its client expects $1 style parameters.
 */
export interface SqlDriver {
    query(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
    execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
    /** Runs the work atomically. Calls may nest, and nested ones must behave as savepoints. */
    transaction<TResult>(work: () => Promise<TResult>): Promise<TResult>;
}

/**
 * Reads typed values out of a row, failing loudly on a column holding something it should not. A row
 * that does not match the schema is a broken database, not a value to guess at.
 */
export class RowReader {
    private readonly row: SqlRow;

    constructor(row: SqlRow) {
        this.row = row;
    }

    private raw(column: string): SqlColumn {
        const value = this.row[column];
        if (value === undefined) {
            throw new Error(`Column ${column} is missing from the result.`);
        }
        return value;
    }

    text(column: string): string {
        const value = this.raw(column);
        if (typeof value === "object" && value !== null) {
            throw new Error(`Column ${column} should hold text.`);
        }
        if (typeof value !== "string") {
            throw new Error(`Column ${column} should hold text.`);
        }
        return value;
    }

    nullableText(column: string): string | null {
        return this.raw(column) === null ? null : this.text(column);
    }

    /**
     * A number, whether the driver hands it over as one or as text. PostgreSQL returns BIGINT as a string
     * because most of its range does not survive a double, so a reader that insisted on a number could
     * not read an identity column at all. A value that would lose precision is refused rather than
     * rounded into a different row.
     */
    number(column: string): number {
        const value = this.raw(column);
        if (typeof value === "number") return value;
        if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value)) {
            throw new Error(`Column ${column} should hold a number.`);
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || (value.indexOf(".") === -1 && !Number.isSafeInteger(parsed))) {
            throw new Error(`Column ${column} holds ${value}, which no number can hold exactly.`);
        }
        return parsed;
    }

    nullableNumber(column: string): number | null {
        return this.raw(column) === null ? null : this.number(column);
    }

    boolean(column: string): boolean {
        return this.number(column) !== 0;
    }

    /**
     * A JSON document. Engines differ on whether they hand back the text or the parsed value, so both are
     * accepted, and anything that is neither is a broken column rather than a value to guess at.
     */
    json(column: string): SqlJson | null {
        const value = this.raw(column);
        if (value === null) return null;
        if (typeof value === "object") return value;
        if (typeof value !== "string") {
            throw new Error(`Column ${column} should hold a JSON document.`);
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(value);
        } catch {
            throw new Error(`Column ${column} does not hold valid JSON.`);
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error(`Column ${column} should hold a JSON object.`);
        }
        return parsed as SqlJson;
    }

    enumValue<TValue extends string>(column: string, enumObject: Readonly<Record<string, TValue>>): TValue {
        const value = this.text(column);
        if (!isEnumValue(enumObject, value)) {
            throw new Error(`Column ${column} holds ${value}, which is not a known value.`);
        }
        return value;
    }
}

export function flag(value: boolean): number {
    return value ? 1 : 0;
}

/** Metadata is bound as JSON text, which every engine accepts for a text or a JSON column. */
export function json(value: SqlJson | null): SqlValue {
    return value === null ? null : JSON.stringify(value);
}
