import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalog, type RepresentationInfo } from "../../src/core/catalog.js";
import { Icon } from "../../src/core/icon.js";
import { Representation } from "../../src/core/enums.js";
import { TimelineService } from "../../src/core/service.js";
import { seedSampleData } from "../../src/core/sample.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { CONTENT, frame } from "../../src/ui/chrome.js";
import { BUILT_IN_RENDERERS } from "../../src/ui/renderers/index.js";
import { defineRenderer } from "../../src/ui/renderers/registry.js";
import { text } from "../../src/ui/svg.js";
import { mountTimeline } from "../../src/ui/workspace.js";
import { installDom } from "../support/dom.js";
import { SAMPLE_START } from "../support/fixtures.js";

installDom();

const GANTT = "gantt";
const GANTT_INFO: RepresentationInfo = {
    representation: GANTT,
    label: "Gantt",
    icon: Icon.Columns,
    description: "One bar per step.",
    supportsManualPlacement: false
};

const gantt = defineRenderer<number>({
    representation: GANTT,
    options: strings => [{ id: "rows", label: strings.options.density, fallback: "all", choices: [{ value: "all", label: "All" }] }],
    pages: () => [0],
    draw(context, _page, pageIndex, pageCount) {
        const { root, content } = frame(context, { page: pageIndex, pageCount, subtitle: null, legend: [] });
        content.appendChild(text(`${context.store.steps.length} steps`, CONTENT.x, CONTENT.y + 40, { "font-size": 14 }));
        return root;
    }
});

async function service() {
    const catalog = buildCatalog({ representations: [GANTT_INFO] });
    const built = new TimelineService(new MemoryTimelineStore(), { catalog });
    const incident = await seedSampleData(built, SAMPLE_START);
    return { service: built, incident };
}

describe("a representation of the host's own", () => {
    it("is refused a key that is already taken or malformed", () => {
        assert.throws(() => buildCatalog({ representations: [{ ...GANTT_INFO, representation: Representation.Narrative }] }));
        assert.throws(() => buildCatalog({ representations: [{ ...GANTT_INFO, representation: "not a key" }] }));
    });

    it("draws, and is not mistaken for the sequential timeline", async () => {
        const { service: api, incident } = await service();
        const element = document.createElement("div");
        document.body.append(element);

        const handle = await mountTimeline(element, {
            api,
            incidentId: incident.id,
            preferences: null,
            renderers: [...BUILT_IN_RENDERERS, gantt]
        });

        handle.selectRepresentation(GANTT);
        assert.equal(handle.state.representation, GANTT);
        const texts = [...element.querySelectorAll("text")].map(node => node.textContent ?? "");
        assert.ok(texts.some(value => value.endsWith(" steps")), texts.join(" | "));
        assert.ok(texts.some(value => value.includes("GANTT")), texts.join(" | "));
        handle.destroy();
    });

    it("carries its own settings", async () => {
        const { service: api, incident } = await service();
        const element = document.createElement("div");
        document.body.append(element);
        const handle = await mountTimeline(element, { api, incidentId: incident.id, preferences: null, renderers: [...BUILT_IN_RENDERERS, gantt] });

        handle.selectRepresentation(GANTT);
        handle.setOption(GANTT, "rows", "all");
        assert.equal(handle.state.options.get("rows"), "all");
        handle.destroy();
    });

    it("keeps a pinned position under its own key", async () => {
        const { service: api, incident } = await service();
        const diagram = await api.getDiagram(incident.id);
        const node = diagram.nodes[0];
        assert.ok(node);

        await api.saveLayout(incident.id, [{ nodeId: node.id, representation: GANTT, x: 10, y: 20 }]);
        const placed = (await api.getDiagram(incident.id)).nodes.find(entry => entry.id === node.id);
        assert.deepEqual(placed?.placements.find(entry => entry.representation === GANTT), { representation: GANTT, x: 10, y: 20 });
    });

    it("refuses a placement under a key nobody declared", async () => {
        const { service: api, incident } = await service();
        const diagram = await api.getDiagram(incident.id);
        const node = diagram.nodes[0];
        assert.ok(node);
        await assert.rejects(() => api.saveLayout(incident.id, [{ nodeId: node.id, representation: "invented", x: 1, y: 2 }]));
    });
});
