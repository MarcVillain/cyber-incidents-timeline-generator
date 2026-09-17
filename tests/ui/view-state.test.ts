import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Audience, Representation } from "../../src/core/enums.js";
import { mountTimeline, type TimelineState } from "../../src/ui/workspace.js";
import { installDom } from "../support/dom.js";
import { seededService } from "../support/fixtures.js";

installDom();

async function mounted(onStateChange?: (state: TimelineState) => void) {
    const { service, incident } = await seededService();
    const element = document.createElement("div");
    document.body.append(element);
    const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, onStateChange });
    return { handle, element };
}

describe("view state", () => {
    it("reports what is on screen", async () => {
        const { handle } = await mounted();
        handle.selectRepresentation(Representation.SequentialTimeline);
        assert.equal(handle.state.representation, Representation.SequentialTimeline);
        assert.equal(handle.state.pageIndex, 0);
        assert.ok(handle.state.pageCount >= 1);
        assert.equal(handle.state.filters.audience, Audience.Both);
        handle.destroy();
    });

    it("turns to a slide and clamps what cannot be turned to", async () => {
        const { handle } = await mounted();
        handle.selectRepresentation(Representation.Narrative);
        const { pageCount } = handle.state;

        handle.setPage(pageCount - 1);
        assert.equal(handle.state.pageIndex, pageCount - 1);
        handle.setPage(9999);
        assert.equal(handle.state.pageIndex, pageCount - 1);
        handle.setPage(-4);
        assert.equal(handle.state.pageIndex, 0);
        handle.destroy();
    });

    it("filters from outside and goes back to the first slide", async () => {
        const { handle } = await mounted();
        handle.selectRepresentation(Representation.Narrative);
        handle.setPage(handle.state.pageCount - 1);

        handle.setFilters({ milestonesOnly: true });
        assert.equal(handle.state.filters.milestonesOnly, true);
        assert.equal(handle.state.pageIndex, 0);
        handle.destroy();
    });

    it("sets a representation setting from outside", async () => {
        const { handle } = await mounted();
        handle.selectRepresentation(Representation.SequentialTimeline);
        handle.setOption(Representation.SequentialTimeline, "density", "compact");
        assert.equal(handle.state.options.get("density"), "compact");
        handle.destroy();
    });

    it("tells the host after every change, so an address bar can follow", async () => {
        const seen: TimelineState[] = [];
        const { handle } = await mounted(state => seen.push(state));
        const before = seen.length;

        handle.selectRepresentation(Representation.KillChainBoard);
        assert.ok(seen.length > before);
        assert.equal(seen.at(-1)?.representation, Representation.KillChainBoard);

        handle.setFilters({ audience: Audience.Executive });
        assert.equal(seen.at(-1)?.filters.audience, Audience.Executive);
        handle.destroy();
    });
});
