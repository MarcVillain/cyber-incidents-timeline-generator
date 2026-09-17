import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { Representation } from "../../src/core/enums.js";
import type { Diagram } from "../../src/core/models.js";
import { countPages, renderPage, renderPages } from "../../src/render/index.js";
import { defaultTokenResolver } from "../../src/ui/theme.js";
import { seededService } from "../support/fixtures.js";

const EMPTY_PAGE = "<!doctype html><html><head></head><body></body></html>";

function headless(): { document: Document } {
    return { document: parseHTML(EMPTY_PAGE).document as unknown as Document };
}

async function diagram(): Promise<Diagram> {
    const { service, incident } = await seededService();
    return service.getDiagram(incident.id);
}

describe("rendering with no page", () => {
    it("draws every slide of a representation", async () => {
        const pages = renderPages(await diagram(), { representation: Representation.SequentialTimeline, ...headless() });
        assert.ok(pages.length >= 1);
        pages.forEach(page => {
            assert.ok(page.startsWith("<svg"), page.slice(0, 40));
            assert.ok(page.includes('viewBox="0 0 1600 900"'));
            assert.ok(!page.includes("NaN"));
        });
    });

    it("draws the same thing twice, because nothing is measured in a browser", async () => {
        const built = await diagram();
        const once = renderPage(built, { representation: Representation.Narrative, ...headless() });
        const twice = renderPage(built, { representation: Representation.Narrative, ...headless() });
        assert.equal(once, twice);
    });

    it("draws every built in representation", async () => {
        const built = await diagram();
        Object.values(Representation).forEach(representation => {
            const page = renderPage(built, { representation, ...headless() });
            assert.ok(page.includes("<svg"), representation);
            assert.ok(!page.includes("NaN"), representation);
        });
    });

    it("takes a page by number and clamps what is out of range", async () => {
        const built = await diagram();
        const options = { representation: Representation.Narrative, ...headless() };
        const count = countPages(built, options);
        assert.equal(renderPage(built, options, 9999), renderPage(built, options, count - 1));
        assert.equal(renderPage(built, options, -3), renderPage(built, options, 0));
    });

    it("paints a background and a size when the host asks for one", async () => {
        const page = renderPage(await diagram(), {
            representation: Representation.DiamondModel,
            ...headless(),
            file: { background: "#101317", width: 800, height: 450 }
        });
        assert.ok(page.includes('fill="#101317"'));
        assert.ok(page.includes('viewBox="0 0 800 450"'));
    });

    it("takes the colours the host resolves, so a dark render is possible", async () => {
        const dark = renderPage(await diagram(), {
            representation: Representation.KillChainBoard,
            ...headless(),
            tokens: property => (property === "--tlg-surface" ? "#101317" : defaultTokenResolver(property))
        });
        assert.ok(dark.includes("#101317"));
    });

    it("says which representation it cannot draw", async () => {
        const built = await diagram();
        assert.throws(() => renderPage(built, { representation: "invented", ...headless() }), /invented/);
    });

    it("leaves no document behind for the next render", async () => {
        renderPage(await diagram(), { representation: Representation.Narrative, ...headless() });
        assert.equal(typeof globalThis.document, "undefined");
    });
});
