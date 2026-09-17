/**
 * Table names derived from one prefix, so the timeline can live inside the database of a host
 * application without colliding with its tables.
 */
export class TableNames {
    readonly incidents: string;
    readonly classifications: string;
    readonly nodes: string;
    readonly layouts: string;
    readonly steps: string;
    readonly involvements: string;
    readonly tags: string;
    readonly links: string;

    constructor(prefix: string) {
        // The prefix ends up inside SQL text, so it is held to a plain identifier
        if (!/^[a-z_][a-z0-9_]{0,30}$/.test(prefix)) {
            throw new Error("The table prefix must be a lowercase SQL identifier of at most 31 characters.");
        }
        this.incidents = `${prefix}incidents`;
        this.classifications = `${prefix}incident_classifications`;
        this.nodes = `${prefix}nodes`;
        this.layouts = `${prefix}node_layouts`;
        this.steps = `${prefix}steps`;
        this.involvements = `${prefix}step_involvements`;
        this.tags = `${prefix}step_tags`;
        this.links = `${prefix}links`;
    }
}

export const DEFAULT_TABLE_PREFIX = "tlg_";

/**
 * The SQLite schema. schema/postgres.sql holds the same tables for PostgreSQL. Times are stored as
 * zone-less ISO text, which sorts correctly as text, and flags as 0 or 1, which every engine accepts.
 */
export function sqliteSchema(tables: TableNames): string {
    return `
CREATE TABLE IF NOT EXISTS ${tables.incidents} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    reference_id TEXT NULL,
    impact TEXT NOT NULL,
    scope TEXT NULL,
    external_id TEXT NULL,
    metadata TEXT NULL
);

CREATE INDEX IF NOT EXISTS ${tables.incidents}_external ON ${tables.incidents}(external_id);

CREATE TABLE IF NOT EXISTS ${tables.classifications} (
    incident_id INTEGER NOT NULL REFERENCES ${tables.incidents}(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (incident_id, position)
);

CREATE TABLE IF NOT EXISTS ${tables.nodes} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES ${tables.incidents}(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NULL,
    kind TEXT NOT NULL,
    side TEXT NOT NULL,
    parent_id INTEGER NULL REFERENCES ${tables.nodes}(id) ON DELETE CASCADE,
    identifier TEXT NULL,
    role TEXT NULL,
    criticality TEXT NOT NULL,
    compromised INTEGER NOT NULL,
    icon TEXT NULL,
    color_override TEXT NULL,
    external_id TEXT NULL,
    canonical_key TEXT NULL,
    metadata TEXT NULL
);
CREATE INDEX IF NOT EXISTS ${tables.nodes}_incident ON ${tables.nodes}(incident_id);
CREATE INDEX IF NOT EXISTS ${tables.nodes}_canonical ON ${tables.nodes}(canonical_key);

CREATE TABLE IF NOT EXISTS ${tables.layouts} (
    node_id INTEGER NOT NULL REFERENCES ${tables.nodes}(id) ON DELETE CASCADE,
    representation TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    PRIMARY KEY (node_id, representation)
);

CREATE TABLE IF NOT EXISTS ${tables.steps} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES ${tables.incidents}(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    end_timestamp TEXT NULL,
    time_known INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NULL,
    side TEXT NOT NULL,
    attack_tactic TEXT NOT NULL,
    response_phase TEXT NOT NULL,
    mitre_technique_id TEXT NULL,
    severity TEXT NOT NULL,
    confidence TEXT NOT NULL,
    outcome TEXT NOT NULL,
    audience TEXT NOT NULL,
    evidence_source TEXT NULL,
    is_milestone INTEGER NOT NULL,
    icon TEXT NULL,
    source_node_id INTEGER NULL REFERENCES ${tables.nodes}(id) ON DELETE SET NULL,
    target_node_id INTEGER NULL REFERENCES ${tables.nodes}(id) ON DELETE SET NULL,
    external_id TEXT NULL,
    metadata TEXT NULL
);
CREATE INDEX IF NOT EXISTS ${tables.steps}_incident ON ${tables.steps}(incident_id);
CREATE INDEX IF NOT EXISTS ${tables.steps}_timestamp ON ${tables.steps}(timestamp);
CREATE INDEX IF NOT EXISTS ${tables.steps}_external ON ${tables.steps}(external_id);

CREATE TABLE IF NOT EXISTS ${tables.involvements} (
    step_id INTEGER NOT NULL REFERENCES ${tables.steps}(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL REFERENCES ${tables.nodes}(id) ON DELETE CASCADE,
    involvement TEXT NOT NULL,
    PRIMARY KEY (step_id, node_id)
);

CREATE TABLE IF NOT EXISTS ${tables.tags} (
    step_id INTEGER NOT NULL REFERENCES ${tables.steps}(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (step_id, position)
);

CREATE TABLE IF NOT EXISTS ${tables.links} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES ${tables.incidents}(id) ON DELETE CASCADE,
    source_node_id INTEGER NOT NULL REFERENCES ${tables.nodes}(id) ON DELETE CASCADE,
    target_node_id INTEGER NOT NULL REFERENCES ${tables.nodes}(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    label TEXT NULL,
    confidence TEXT NOT NULL,
    step_id INTEGER NULL REFERENCES ${tables.steps}(id) ON DELETE CASCADE,
    metadata TEXT NULL
);
CREATE INDEX IF NOT EXISTS ${tables.links}_incident ON ${tables.links}(incident_id);
`;
}
