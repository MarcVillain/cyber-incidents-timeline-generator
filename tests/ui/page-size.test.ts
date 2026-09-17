import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { Representation } from "../../src/core/enums.js";
import type { Diagram } from "../../src/core/models.js";
import { countPages, renderPage } from "../../src/render/index.js";
import { CONTENT, contentArea, pageSize, withPageSize } from "../../src/ui/chrome.js";
import { BUILT_IN_RENDERERS } from "../../src/ui/renderers/index.js";
import { DEFAULT_PAGE_SIZE, PAGE_HEIGHT, PAGE_WIDTH, type PageSize } from "../../src/ui/viewport.js";
import { seededService } from "../support/fixtures.js";

const A4_LANDSCAPE: PageSize = { width: 1123, height: 794 };
const TALL: PageSize = { width: 1600, height: 2400 };
const EMPTY_PAGE = "<!doctype html><html><head></head><body></body></html>";

function headless(): { document: Document } {
    return { document: parseHTML(EMPTY_PAGE).document as unknown as Document };
}

async function diagram(): Promise<Diagram> {
    const { service, incident } = await seededService();
    return service.getDiagram(incident.id);
}

describe("the page a scene is drawn on", () => {
    it("is the 1600 by 900 slide unless a host asks otherwise", () => {
        assert.deepEqual(DEFAULT_PAGE_SIZE, { width: PAGE_WIDTH, height: PAGE_HEIGHT });
        assert.deepEqual(pageSize(), DEFAULT_PAGE_SIZE);
        assert.deepEqual({ ...CONTENT }, { ...contentArea(DEFAULT_PAGE_SIZE) });
    });

    it("puts the slide back after the work, whatever happens", () => {
        withPageSize(A4_LANDSCAPE, () => {
            assert.deepEqual(pageSize(), A4_LANDSCAPE);
            assert.equal(CONTENT.width, contentArea(A4_LANDSCAPE).width);
        });
        assert.deepEqual(pageSize(), DEFAULT_PAGE_SIZE);
        assert.equal(CONTENT.width, contentArea(DEFAULT_PAGE_SIZE).width);

        assert.throws(() => withPageSize(A4_LANDSCAPE, () => { throw new Error("boom"); }));
        assert.deepEqual(pageSize(), DEFAULT_PAGE_SIZE);
    });

    it("draws every representation on every page size without leaving the canvas", async () => {
        const built = await diagram();
        [DEFAULT_PAGE_SIZE, A4_LANDSCAPE, TALL].forEach(size => {
            BUILT_IN_RENDERERS.forEach(renderer => {
                const page = renderPage(built, { representation: renderer.representation, pageSize: size, ...headless() });
                assert.ok(page.includes(`viewBox="0 0 ${size.width} ${size.height}"`), `${renderer.representation} at ${size.width}x${size.height}`);
                assert.ok(!page.includes("NaN"), `${renderer.representation} at ${size.width}x${size.height} drew a NaN`);
                assert.ok(page.includes("<text"), `${renderer.representation} at ${size.width}x${size.height} drew no text`);
            });
        });
    });

    it("fits more on a taller page, and the slide still paginates", async () => {
        const built = await diagram();
        const options = { representation: Representation.Narrative, ...headless() };
        const onSlides = countPages(built, { ...options, pageSize: DEFAULT_PAGE_SIZE });
        const onTall = countPages(built, { ...options, pageSize: TALL });
        assert.ok(onTall <= onSlides);
    });

    it("keeps the drawing inside the margins at any size", () => {
        [DEFAULT_PAGE_SIZE, A4_LANDSCAPE, TALL].forEach(size => {
            const area = contentArea(size);
            assert.ok(area.right <= size.width);
            assert.ok(area.bottom <= size.height);
            assert.ok(area.width > 0 && area.height > 0);
        });
    });
});
