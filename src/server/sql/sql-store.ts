import {
    AttackTactic,
    Audience,
    Confidence,
    Involvement,
    LinkKind,
    NodeKind,
    Representation,
    ResponsePhase,
    Side,
    StepOutcome
} from "../../core/enums.js";
import type { Incident, IncidentFields, LayoutRecord, LinkRecord, NodeRecord, RecordId, StepInvolvement, StepRecord } from "../../core/models.js";
import type { LinkData, NodeData, StepData, TimelineStore } from "../../core/store.js";
import { RowReader, flag, json, type SqlDriver, type SqlRow, type SqlValue } from "./driver.js";
import { DEFAULT_TABLE_PREFIX, TableNames } from "./schema.js";

export interface SqlTimelineStoreOptions {
    tablePrefix?: string;
}

const INCIDENT_COLUMNS = "id, title, reference_id, impact, scope, external_id, metadata";
const NODE_COLUMNS = "id, incident_id, name, description, kind, side, parent_id, identifier, role, criticality, compromised, icon, color_override, external_id, canonical_key, metadata";
const STEP_COLUMNS = "id, incident_id, timestamp, end_timestamp, time_known, order_index, title, description, side, attack_tactic, response_phase, mitre_technique_id, severity, confidence, outcome, audience, evidence_source, is_milestone, milestone_key, icon, source_node_id, target_node_id, external_id, metadata";
const LINK_COLUMNS = "id, incident_id, source_node_id, target_node_id, kind, label, confidence, step_id, metadata";

function incidentValues(fields: IncidentFields): SqlValue[] {
    return [
        fields.title, fields.referenceId, fields.impact, fields.scope, fields.externalId, json(fields.metadata)
    ];
}

function nodeValues(data: NodeData): SqlValue[] {
    return [
        data.incidentId, data.name, data.description, data.kind, data.side, data.parentId, data.identifier,
        data.role, data.criticality, flag(data.compromised), data.icon, data.colorOverride, data.externalId, data.canonicalKey, json(data.metadata)
    ];
}

function stepValues(data: StepData): SqlValue[] {
    return [
        data.incidentId, data.timestamp, data.endTimestamp, flag(data.timeKnown), data.orderIndex, data.title,
        data.description, data.side, data.attackTactic, data.responsePhase, data.mitreTechniqueId, data.severity,
        data.confidence, data.outcome, data.audience, data.evidenceSource, flag(data.isMilestone), data.milestoneKey, data.icon,
        data.sourceNodeId, data.targetNodeId, data.externalId, json(data.metadata)
    ];
}

function linkValues(data: LinkData): SqlValue[] {
    return [data.incidentId, data.sourceNodeId, data.targetNodeId, data.kind, data.label, data.confidence, data.stepId, json(data.metadata)];
}

function readIncident(row: SqlRow, classifications: string[]): Incident {
    const read = new RowReader(row);
    return {
        id: read.number("id"),
        title: read.text("title"),
        referenceId: read.nullableText("reference_id"),
        impact: read.text("impact"),
        scope: read.nullableText("scope"),
        externalId: read.nullableText("external_id"),
        metadata: read.json("metadata"),
        classifications
    };
}

function readNode(row: SqlRow): NodeRecord {
    const read = new RowReader(row);
    return {
        id: read.number("id"),
        incidentId: read.number("incident_id"),
        name: read.text("name"),
        description: read.nullableText("description"),
        kind: read.enumValue("kind", NodeKind),
        side: read.enumValue("side", Side),
        parentId: read.nullableNumber("parent_id"),
        identifier: read.nullableText("identifier"),
        role: read.nullableText("role"),
        criticality: read.text("criticality"),
        compromised: read.boolean("compromised"),
        icon: read.nullableText("icon"),
        colorOverride: read.nullableText("color_override"),
        externalId: read.nullableText("external_id"),
        canonicalKey: read.nullableText("canonical_key"),
        metadata: read.json("metadata")
    };
}

function readStep(row: SqlRow, involvements: StepInvolvement[], tags: string[]): StepRecord {
    const read = new RowReader(row);
    return {
        id: read.number("id"),
        incidentId: read.number("incident_id"),
        timestamp: read.text("timestamp"),
        endTimestamp: read.nullableText("end_timestamp"),
        timeKnown: read.boolean("time_known"),
        orderIndex: read.number("order_index"),
        title: read.text("title"),
        description: read.nullableText("description"),
        side: read.enumValue("side", Side),
        attackTactic: read.enumValue("attack_tactic", AttackTactic),
        responsePhase: read.enumValue("response_phase", ResponsePhase),
        mitreTechniqueId: read.nullableText("mitre_technique_id"),
        severity: read.text("severity"),
        confidence: read.enumValue("confidence", Confidence),
        outcome: read.enumValue("outcome", StepOutcome),
        audience: read.enumValue("audience", Audience),
        evidenceSource: read.nullableText("evidence_source"),
        isMilestone: read.boolean("is_milestone"),
        milestoneKey: read.nullableText("milestone_key"),
        icon: read.nullableText("icon"),
        sourceNodeId: read.nullableNumber("source_node_id"),
        targetNodeId: read.nullableNumber("target_node_id"),
        externalId: read.nullableText("external_id"),
        metadata: read.json("metadata"),
        involvements,
        tags
    };
}

function readLink(row: SqlRow): LinkRecord {
    const read = new RowReader(row);
    return {
        id: read.number("id"),
        incidentId: read.number("incident_id"),
        sourceNodeId: read.number("source_node_id"),
        targetNodeId: read.number("target_node_id"),
        kind: read.enumValue("kind", LinkKind),
        label: read.nullableText("label"),
        confidence: read.enumValue("confidence", Confidence),
        stepId: read.nullableNumber("step_id"),
        metadata: read.json("metadata")
    };
}

function readLayout(row: SqlRow): LayoutRecord {
    const read = new RowReader(row);
    return {
        nodeId: read.number("node_id"),
        representation: read.enumValue("representation", Representation),
        x: read.number("x"),
        y: read.number("y")
    };
}

function groupBy<TValue>(rows: readonly SqlRow[], keyColumn: string, readValue: (reader: RowReader) => TValue): Map<RecordId, TValue[]> {
    const groups = new Map<RecordId, TValue[]>();
    rows.forEach(row => {
        const reader = new RowReader(row);
        const key = reader.number(keyColumn);
        const group = groups.get(key) ?? [];
        group.push(readValue(reader));
        groups.set(key, group);
    });
    return groups;
}

/**
 * The persistence port over any SQL database reachable through a SqlDriver. Every statement is
 * parameterized; the only text ever spliced into SQL is the validated table prefix.
 */
export class SqlTimelineStore implements TimelineStore {
    private readonly driver: SqlDriver;
    readonly tables: TableNames;

    constructor(driver: SqlDriver, options: SqlTimelineStoreOptions = {}) {
        this.driver = driver;
        this.tables = new TableNames(options.tablePrefix ?? DEFAULT_TABLE_PREFIX);
    }

    private async insertReturningId(sql: string, params: readonly SqlValue[]): Promise<RecordId> {
        const [row] = await this.driver.query(`${sql} RETURNING id`, params);
        if (!row) {
            throw new Error("The database did not return the id of the inserted row.");
        }
        return new RowReader(row).number("id");
    }

    private async classificationsOf(incidentIds: readonly RecordId[]): Promise<Map<RecordId, string[]>> {
        if (incidentIds.length === 0) return new Map();
        const rows = await this.driver.query(
            `SELECT incident_id, value FROM ${this.tables.classifications} WHERE incident_id IN (${incidentIds.map(() => "?").join(", ")}) ORDER BY incident_id, position`,
            incidentIds
        );
        return groupBy(rows, "incident_id", reader => reader.text("value"));
    }

    private async writeClassifications(incidentId: RecordId, classifications: readonly string[]): Promise<void> {
        await this.driver.execute(`DELETE FROM ${this.tables.classifications} WHERE incident_id = ?`, [incidentId]);
        for (const [position, value] of classifications.entries()) {
            await this.driver.execute(`INSERT INTO ${this.tables.classifications} (incident_id, position, value) VALUES (?, ?, ?)`, [incidentId, position, value]);
        }
    }

    async listIncidents(): Promise<Incident[]> {
        const rows = await this.driver.query(`SELECT ${INCIDENT_COLUMNS} FROM ${this.tables.incidents} ORDER BY id`);
        const classifications = await this.classificationsOf(rows.map(row => new RowReader(row).number("id")));
        return rows.map(row => readIncident(row, classifications.get(new RowReader(row).number("id")) ?? []));
    }

    async findIncident(id: RecordId): Promise<Incident | null> {
        const [row] = await this.driver.query(`SELECT ${INCIDENT_COLUMNS} FROM ${this.tables.incidents} WHERE id = ?`, [id]);
        if (!row) return null;
        const classifications = await this.classificationsOf([id]);
        return readIncident(row, classifications.get(id) ?? []);
    }

    async insertIncident(fields: IncidentFields): Promise<Incident> {
        return this.driver.transaction(async () => {
            const id = await this.insertReturningId(
                `INSERT INTO ${this.tables.incidents} (title, reference_id, impact, scope, external_id, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
                incidentValues(fields)
            );
            await this.writeClassifications(id, fields.classifications);
            return { ...fields, classifications: [...fields.classifications], id };
        });
    }

    async updateIncident(incident: Incident): Promise<void> {
        await this.driver.transaction(async () => {
            await this.driver.execute(
                `UPDATE ${this.tables.incidents} SET title = ?, reference_id = ?, impact = ?, scope = ?, external_id = ?, metadata = ? WHERE id = ?`,
                [...incidentValues(incident), incident.id]
            );
            await this.writeClassifications(incident.id, incident.classifications);
        });
    }

    /**
     * Child rows are removed explicitly rather than left to cascading keys, so an engine or a schema
     * without them behaves the same.
     */
    async deleteIncident(id: RecordId): Promise<void> {
        const stepsOf = `SELECT id FROM ${this.tables.steps} WHERE incident_id = ?`;
        const nodesOf = `SELECT id FROM ${this.tables.nodes} WHERE incident_id = ?`;
        await this.driver.transaction(async () => {
            await this.driver.execute(`DELETE FROM ${this.tables.links} WHERE incident_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.tags} WHERE step_id IN (${stepsOf})`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.involvements} WHERE step_id IN (${stepsOf})`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.steps} WHERE incident_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.layouts} WHERE node_id IN (${nodesOf})`, [id]);
            await this.driver.execute(`UPDATE ${this.tables.nodes} SET parent_id = NULL WHERE incident_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.nodes} WHERE incident_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.classifications} WHERE incident_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.incidents} WHERE id = ?`, [id]);
        });
    }

    async listNodes(incidentId: RecordId): Promise<NodeRecord[]> {
        const rows = await this.driver.query(`SELECT ${NODE_COLUMNS} FROM ${this.tables.nodes} WHERE incident_id = ? ORDER BY id`, [incidentId]);
        return rows.map(readNode);
    }

    async findNode(id: RecordId): Promise<NodeRecord | null> {
        const [row] = await this.driver.query(`SELECT ${NODE_COLUMNS} FROM ${this.tables.nodes} WHERE id = ?`, [id]);
        return row ? readNode(row) : null;
    }

    async insertNode(data: NodeData): Promise<NodeRecord> {
        const id = await this.insertReturningId(
            `INSERT INTO ${this.tables.nodes} (incident_id, name, description, kind, side, parent_id, identifier, role, criticality, compromised, icon, color_override, external_id, canonical_key, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            nodeValues(data)
        );
        return { ...data, id };
    }

    async updateNode(node: NodeRecord): Promise<void> {
        await this.driver.execute(
            `UPDATE ${this.tables.nodes} SET incident_id = ?, name = ?, description = ?, kind = ?, side = ?, parent_id = ?, identifier = ?, role = ?, criticality = ?, compromised = ?, icon = ?, color_override = ?, external_id = ?, canonical_key = ?, metadata = ? WHERE id = ?`,
            [...nodeValues(node), node.id]
        );
    }

    async deleteNode(id: RecordId): Promise<void> {
        await this.driver.transaction(async () => {
            await this.driver.execute(`DELETE FROM ${this.tables.layouts} WHERE node_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.involvements} WHERE node_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.nodes} WHERE id = ?`, [id]);
        });
    }

    private async stepsFrom(rows: readonly SqlRow[]): Promise<StepRecord[]> {
        const ids = rows.map(row => new RowReader(row).number("id"));
        if (ids.length === 0) return [];

        const placeholders = ids.map(() => "?").join(", ");
        const involvementRows = await this.driver.query(`SELECT step_id, node_id, involvement FROM ${this.tables.involvements} WHERE step_id IN (${placeholders}) ORDER BY step_id, node_id`, ids);
        const tagRows = await this.driver.query(`SELECT step_id, value FROM ${this.tables.tags} WHERE step_id IN (${placeholders}) ORDER BY step_id, position`, ids);

        const involvements = groupBy(involvementRows, "step_id", reader => ({
            nodeId: reader.number("node_id"),
            involvement: reader.enumValue("involvement", Involvement)
        }));
        const tags = groupBy(tagRows, "step_id", reader => reader.text("value"));

        return rows.map(row => {
            const id = new RowReader(row).number("id");
            return readStep(row, involvements.get(id) ?? [], tags.get(id) ?? []);
        });
    }

    private async writeStepChildren(stepId: RecordId, involvements: readonly StepInvolvement[], tags: readonly string[]): Promise<void> {
        await this.driver.execute(`DELETE FROM ${this.tables.involvements} WHERE step_id = ?`, [stepId]);
        await this.driver.execute(`DELETE FROM ${this.tables.tags} WHERE step_id = ?`, [stepId]);
        for (const entry of involvements) {
            await this.driver.execute(`INSERT INTO ${this.tables.involvements} (step_id, node_id, involvement) VALUES (?, ?, ?)`, [stepId, entry.nodeId, entry.involvement]);
        }
        for (const [position, value] of tags.entries()) {
            await this.driver.execute(`INSERT INTO ${this.tables.tags} (step_id, position, value) VALUES (?, ?, ?)`, [stepId, position, value]);
        }
    }

    async listSteps(incidentId: RecordId): Promise<StepRecord[]> {
        const rows = await this.driver.query(`SELECT ${STEP_COLUMNS} FROM ${this.tables.steps} WHERE incident_id = ? ORDER BY timestamp, order_index, id`, [incidentId]);
        return this.stepsFrom(rows);
    }

    async findStep(id: RecordId): Promise<StepRecord | null> {
        const rows = await this.driver.query(`SELECT ${STEP_COLUMNS} FROM ${this.tables.steps} WHERE id = ?`, [id]);
        const [step] = await this.stepsFrom(rows);
        return step ?? null;
    }

    async insertStep(data: StepData): Promise<StepRecord> {
        return this.driver.transaction(async () => {
            const id = await this.insertReturningId(
                `INSERT INTO ${this.tables.steps} (incident_id, timestamp, end_timestamp, time_known, order_index, title, description, side, attack_tactic, response_phase, mitre_technique_id, severity, confidence, outcome, audience, evidence_source, is_milestone, milestone_key, icon, source_node_id, target_node_id, external_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                stepValues(data)
            );
            await this.writeStepChildren(id, data.involvements, data.tags);
            return { ...data, involvements: data.involvements.map(entry => ({ ...entry })), tags: [...data.tags], id };
        });
    }

    async updateStep(step: StepRecord): Promise<void> {
        await this.driver.transaction(async () => {
            await this.driver.execute(
                `UPDATE ${this.tables.steps} SET incident_id = ?, timestamp = ?, end_timestamp = ?, time_known = ?, order_index = ?, title = ?, description = ?, side = ?, attack_tactic = ?, response_phase = ?, mitre_technique_id = ?, severity = ?, confidence = ?, outcome = ?, audience = ?, evidence_source = ?, is_milestone = ?, milestone_key = ?, icon = ?, source_node_id = ?, target_node_id = ?, external_id = ?, metadata = ? WHERE id = ?`,
                [...stepValues(step), step.id]
            );
            await this.writeStepChildren(step.id, step.involvements, step.tags);
        });
    }

    async deleteStep(id: RecordId): Promise<void> {
        await this.driver.transaction(async () => {
            await this.driver.execute(`DELETE FROM ${this.tables.involvements} WHERE step_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.tags} WHERE step_id = ?`, [id]);
            await this.driver.execute(`DELETE FROM ${this.tables.steps} WHERE id = ?`, [id]);
        });
    }

    async listLinks(incidentId: RecordId): Promise<LinkRecord[]> {
        const rows = await this.driver.query(`SELECT ${LINK_COLUMNS} FROM ${this.tables.links} WHERE incident_id = ? ORDER BY id`, [incidentId]);
        return rows.map(readLink);
    }

    async findLink(id: RecordId): Promise<LinkRecord | null> {
        const [row] = await this.driver.query(`SELECT ${LINK_COLUMNS} FROM ${this.tables.links} WHERE id = ?`, [id]);
        return row ? readLink(row) : null;
    }

    async insertLink(data: LinkData): Promise<LinkRecord> {
        const id = await this.insertReturningId(
            `INSERT INTO ${this.tables.links} (incident_id, source_node_id, target_node_id, kind, label, confidence, step_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            linkValues(data)
        );
        return { ...data, id };
    }

    async updateLink(link: LinkRecord): Promise<void> {
        await this.driver.execute(
            `UPDATE ${this.tables.links} SET incident_id = ?, source_node_id = ?, target_node_id = ?, kind = ?, label = ?, confidence = ?, step_id = ?, metadata = ? WHERE id = ?`,
            [...linkValues(link), link.id]
        );
    }

    async deleteLink(id: RecordId): Promise<void> {
        await this.driver.execute(`DELETE FROM ${this.tables.links} WHERE id = ?`, [id]);
    }

    async listLayouts(incidentId: RecordId): Promise<LayoutRecord[]> {
        const rows = await this.driver.query(
            `SELECT node_id, representation, x, y FROM ${this.tables.layouts} WHERE node_id IN (SELECT id FROM ${this.tables.nodes} WHERE incident_id = ?) ORDER BY node_id`,
            [incidentId]
        );
        return rows.map(readLayout);
    }

    async saveLayout(layout: LayoutRecord): Promise<void> {
        await this.driver.transaction(async () => {
            await this.deleteLayout(layout.nodeId, layout.representation);
            await this.driver.execute(
                `INSERT INTO ${this.tables.layouts} (node_id, representation, x, y) VALUES (?, ?, ?, ?)`,
                [layout.nodeId, layout.representation, layout.x, layout.y]
            );
        });
    }

    async deleteLayout(nodeId: RecordId, representation: Representation): Promise<void> {
        await this.driver.execute(`DELETE FROM ${this.tables.layouts} WHERE node_id = ? AND representation = ?`, [nodeId, representation]);
    }

    transaction<TResult>(work: () => Promise<TResult>): Promise<TResult> {
        return this.driver.transaction(work);
    }
}
