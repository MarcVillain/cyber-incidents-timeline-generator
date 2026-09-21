import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog } from "../../src/core/catalog.js";
import { Audience, Representation } from "../../src/core/enums.js";
import { TimelineService } from "../../src/core/service.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { mountTimeline } from "../../src/ui/workspace.js";
import { installDom } from "../support/dom.js";

const LEGAL = "legal";
const LEGAL_LABEL = "Legal";
const TIMESTAMP = "2026-01-12T08:00";
const SHOWN_TO_LEGAL = 2;

async function mounted() {
    installDom();
    const defaults = buildCatalog();
    const catalog = buildCatalog({ vocabulary: { audiences: [...defaults.audiences, { value: LEGAL, label: LEGAL_LABEL }] } });
    const service = new TimelineService(new MemoryTimelineStore(), { catalog });
    const incident = await service.createIncident({ title: "Audiences" });
    await service.createStep(incident.id, { title: "For everyone", timestamp: TIMESTAMP });
    await service.createStep(incident.id, { title: "For legal", timestamp: TIMESTAMP, audiences: [LEGAL] });
    await service.createStep(incident.id, { title: "For engineers", timestamp: TIMESTAMP, audiences: [Audience.Technical] });
    const element = document.createElement("div");
    document.body.append(element);
    const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null });
    return { handle, element };
}

describe("audiences of the catalog", () => {
    it("offers every audience of the catalog in the view settings", async () => {
        const { handle, element } = await mounted();
        const choices = [...element.querySelectorAll("[data-control^=\"filter-audience:\"]")].map(node => node.textContent);
        assert.ok(choices.includes(LEGAL_LABEL));
        handle.destroy();
    });

    it("keeps the steps written for everyone and for the audience chosen", async () => {
        const { handle, element } = await mounted();
        handle.selectRepresentation(Representation.Narrative);
        element.querySelector<HTMLButtonElement>(`[data-control="filter-audience:${LEGAL}"]`)?.click();
        assert.equal(handle.state.filters.audience, LEGAL);
        assert.equal(element.querySelectorAll(".tlg-row").length, SHOWN_TO_LEGAL);
        handle.destroy();
    });
});
