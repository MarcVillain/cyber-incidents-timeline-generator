// A TimelineApi that hands out the catalog with a viewer's own words and icons, for a catalog the viewer does
// not own. Everything else passes straight through, so the owner still validates every write.

import type { Catalog } from "../core/catalog.js";
import type { ImportOptions, ImportReport, TimelineDocument } from "../core/document.js";
import type {
    Diagram, DiagramLink, DiagramNode, DiagramStep, Incident, IncidentCreateInput, IncidentUpdateInput, LayoutInput,
    LinkCreateInput, LinkUpdateInput, NodeCreateInput, NodeUpdateInput, RecordId, StepCreateInput, StepUpdateInput
} from "../core/models.js";
import type { TimelineApi } from "../core/service.js";
import type { DiagramSummary } from "../core/summary.js";
import { relabelCatalog, type AppSettings } from "./settings.js";

export class RelabeledTimelineApi implements TimelineApi {
    private readonly api: TimelineApi;
    /** Read on every call, so saved settings apply to the next load without a new wrapper. */
    private readonly settings: () => AppSettings;

    constructor(api: TimelineApi, settings: () => AppSettings) {
        this.api = api;
        this.settings = settings;
    }

    async getCatalog(): Promise<Catalog> {
        return relabelCatalog(await this.api.getCatalog(), this.settings());
    }

    async getDiagram(incidentId: RecordId): Promise<Diagram> {
        const diagram = await this.api.getDiagram(incidentId);
        return { ...diagram, catalog: relabelCatalog(diagram.catalog, this.settings()) };
    }

    listIncidents(): Promise<Incident[]> {
        return this.api.listIncidents();
    }

    getIncident(incidentId: RecordId): Promise<Incident> {
        return this.api.getIncident(incidentId);
    }

    createIncident(input: IncidentCreateInput): Promise<Incident> {
        return this.api.createIncident(input);
    }

    updateIncident(incidentId: RecordId, input: IncidentUpdateInput): Promise<void> {
        return this.api.updateIncident(incidentId, input);
    }

    deleteIncident(incidentId: RecordId): Promise<void> {
        return this.api.deleteIncident(incidentId);
    }

    getSummary(incidentId: RecordId): Promise<DiagramSummary> {
        return this.api.getSummary(incidentId);
    }

    exportDocument(incidentId: RecordId): Promise<TimelineDocument> {
        return this.api.exportDocument(incidentId);
    }

    importDocument(document: unknown, options?: ImportOptions & { into?: RecordId }): Promise<ImportReport> {
        return this.api.importDocument(document, options);
    }

    createNode(incidentId: RecordId, input: NodeCreateInput): Promise<DiagramNode> {
        return this.api.createNode(incidentId, input);
    }

    updateNode(incidentId: RecordId, nodeId: RecordId, input: NodeUpdateInput): Promise<void> {
        return this.api.updateNode(incidentId, nodeId, input);
    }

    deleteNode(incidentId: RecordId, nodeId: RecordId): Promise<void> {
        return this.api.deleteNode(incidentId, nodeId);
    }

    createStep(incidentId: RecordId, input: StepCreateInput): Promise<DiagramStep> {
        return this.api.createStep(incidentId, input);
    }

    updateStep(incidentId: RecordId, stepId: RecordId, input: StepUpdateInput): Promise<void> {
        return this.api.updateStep(incidentId, stepId, input);
    }

    deleteStep(incidentId: RecordId, stepId: RecordId): Promise<void> {
        return this.api.deleteStep(incidentId, stepId);
    }

    createLink(incidentId: RecordId, input: LinkCreateInput): Promise<DiagramLink> {
        return this.api.createLink(incidentId, input);
    }

    updateLink(incidentId: RecordId, linkId: RecordId, input: LinkUpdateInput): Promise<void> {
        return this.api.updateLink(incidentId, linkId, input);
    }

    deleteLink(incidentId: RecordId, linkId: RecordId): Promise<void> {
        return this.api.deleteLink(incidentId, linkId);
    }

    saveLayout(incidentId: RecordId, layouts: LayoutInput[]): Promise<void> {
        return this.api.saveLayout(incidentId, layouts);
    }
}
