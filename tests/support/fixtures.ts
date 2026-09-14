import type { ImpactScale } from "../../src/core/catalog.js";
import { NodeKind, Side } from "../../src/core/enums.js";
import type { Incident, NodeCreateInput } from "../../src/core/models.js";
import { seedSampleData } from "../../src/core/sample.js";
import { TimelineService } from "../../src/core/service.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";

export const SAMPLE_START = new Date(2026, 0, 12, 8, 0, 0);

/**
 * A scale sharing no key with the default one, so a test can tell which scale a check used.
 */
export const CUSTOM_SCALE: ImpactScale = {
    unassessed: { level: "Unrated", label: "Not rated", color: "#8a8f98" },
    levels: [
        { level: "P3", label: "Minor", color: "#1565c0" },
        { level: "P2", label: "Serious", color: "#e65100" },
        { level: "P1", label: "Major", color: "#c62828" }
    ]
};
export const INCIDENT_TITLE = "Test incident";

export function createService(): { service: TimelineService; store: MemoryTimelineStore } {
    const store = new MemoryTimelineStore();
    return { service: new TimelineService(store), store };
}

export async function createIncident(service: TimelineService, title = INCIDENT_TITLE): Promise<Incident> {
    return service.createIncident({ title, scope: "Scope" });
}

export function person(name: string, extra: Partial<NodeCreateInput> = {}): NodeCreateInput {
    return { name, kind: NodeKind.Person, side: Side.Victim, ...extra };
}

export async function seededService(): Promise<{ service: TimelineService; incident: Incident }> {
    const { service } = createService();
    const incident = await seedSampleData(service, SAMPLE_START);
    return { service, incident };
}
