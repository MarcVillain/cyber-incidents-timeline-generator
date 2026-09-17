import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Representation } from "../../src/core/enums.js";
import { CanvasMode, mountTimeline } from "../../src/ui/workspace.js";
import { installDom } from "../support/dom.js";
import { seededService } from "../support/fixtures.js";

installDom();

const CROWDED = 60;

async function mounted(canvasMode?: CanvasMode, steps = 0) {
    const { service, incident } = await seededService();
    for (let index = 0; index < steps; index += 1) {
        await service.createStep(incident.id, { title: `Extra step ${index}`, timestamp: `2026-02-${String((index % 27) + 1).padStart(2, "0")}T09:00` });
    }
    const element = document.createElement("div");
    document.body.append(element);
    const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, canvasMode });
    return { handle, element };
}

function viewBox(element: HTMLElement): string {
    return element.querySelector(".tlg-canvas > svg")?.getAttribute("viewBox") ?? "";
}

describe("canvas mode", () => {
    it("cuts the scene into slides by default, and the slide is still 1600 by 900", async () => {
        const { handle, element } = await mounted();
        handle.selectRepresentation(Representation.Narrative);
        assert.equal(viewBox(element), "0 0 1600 900");
        handle.destroy();
    });

    it("lays the scene out in one run when asked", async () => {
        const slides = await mounted(CanvasMode.Slides, CROWDED);
        slides.handle.selectRepresentation(Representation.Narrative);
        const cutUp = slides.handle.state.pageCount;
        assert.ok(cutUp > 1, `the slide fixture was not crowded enough: ${cutUp} page`);
        slides.handle.destroy();

        const whole = await mounted(CanvasMode.Continuous, CROWDED);
        whole.handle.selectRepresentation(Representation.Narrative);
        assert.equal(whole.handle.state.pageCount, 1);
        assert.notEqual(viewBox(whole.element), "0 0 1600 900");
        whole.handle.destroy();
    });

    it("keeps the width and grows only the height", async () => {
        const { handle, element } = await mounted(CanvasMode.Continuous, CROWDED);
        handle.selectRepresentation(Representation.Narrative);

        const [, , width, height] = viewBox(element).split(" ").map(Number);
        assert.equal(width, 1600);
        assert.ok(height !== undefined && height >= 900);
        handle.destroy();
    });

    it("leaves a representation that already fits alone", async () => {
        const { handle, element } = await mounted(CanvasMode.Continuous);
        handle.selectRepresentation(Representation.DiamondModel);
        assert.equal(handle.state.pageCount, 1);
        assert.equal(viewBox(element), "0 0 1600 900");
        handle.destroy();
    });
});
