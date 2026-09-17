import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Representation } from "../../src/core/enums.js";
import type { Diagram } from "../../src/core/models.js";
import { TimeFormats } from "../../src/core/time.js";
import { DiagramStore } from "../../src/ui/diagram-store.js";
import { DEFAULT_STRINGS } from "../../src/ui/strings.js";
import { IconSet } from "../../src/ui/icons/icon-set.js";
import { BUILT_IN_RENDERERS } from "../../src/ui/renderers/index.js";
import type { RenderContext, Renderer } from "../../src/ui/renderers/registry.js";
import type { SlideHeaderCustomizer } from "../../src/ui/slide-header.js";
import { Palette } from "../../src/ui/theme.js";
import { CUSTOM_SCALE, createIncident, createService, seededService } from "../support/fixtures.js";

const CUSTOM_TITLE = "Custom slide title";
import { installDom } from "../support/dom.js";

const STEP_SELECTOR = "[data-step-id]";
const RECORD_SELECTOR = "[data-step-id], [data-node-id], [data-link-id]";
const MIN_TEXTS_ON_A_SLIDE = 5;
const FULL_SHARE = 100;
const AGGREGATE_VIEWS: ReadonlySet<string> = new Set([Representation.AttackMatrix, Representation.ResponseMetrics]);

function contextFor(store: DiagramStore, renderer: Renderer, options: ReadonlyMap<string, string>, slideHeader: SlideHeaderCustomizer | null = null): RenderContext {
    return {
        store,
        palette: new Palette(store.catalog),
        icons: new IconSet(),
        representation: store.representationInfo(renderer.representation),
        strings: DEFAULT_STRINGS,
        time: new TimeFormats(),
        options,
        slideHeader
    };
}

/**
 * Every combination of the settings a renderer offers, so a layout nobody picks by default still gets drawn.
 */
function optionSets(renderer: Renderer): ReadonlyMap<string, string>[] {
    let sets: Map<string, string>[] = [new Map()];
    renderer.options(DEFAULT_STRINGS).forEach(option => {
        sets = sets.flatMap(set => option.choices.map(choice => new Map([...set, [option.id, choice.value]])));
    });
    return sets;
}

function textsOf(page: SVGGElement): string[] {
    return [...page.querySelectorAll("text")].map(node => node.textContent ?? "");
}

function drawAll(store: DiagramStore, renderer: Renderer, options: ReadonlyMap<string, string>): SVGGElement[] {
    const pagination = renderer.paginate(contextFor(store, renderer, options));
    assert.ok(pagination.count >= 1);
    return Array.from({ length: pagination.count }, (_, index) => pagination.draw(index));
}

describe("built in renderers", () => {
    let sample: Diagram;
    let empty: Diagram;

    before(async () => {
        installDom();
        const seeded = await seededService();
        sample = await seeded.service.getDiagram(seeded.incident.id);
        const blank = createService();
        empty = await blank.service.getDiagram((await createIncident(blank.service)).id);
    });

    it("offers one renderer per representation", () => {
        const representations = new Set(BUILT_IN_RENDERERS.map(renderer => renderer.representation));
        assert.equal(representations.size, BUILT_IN_RENDERERS.length);
    });

    it("gives every relationship a hit area wider than its line, in both graph layouts", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const graph = BUILT_IN_RENDERERS.find(renderer => renderer.representation === Representation.RelationshipGraph);
        assert.ok(graph);

        optionSets(graph).forEach(options => {
            drawAll(store, graph, options).forEach(page => {
                const lines = page.querySelectorAll(".tlg-link-line");
                assert.ok(lines.length > 0);
                assert.equal(page.querySelectorAll("[data-link-id] .tlg-hit").length, lines.length);
            });
        });
    });

    it("splits the elapsed time into shares that add up to a hundred percent", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const metrics = BUILT_IN_RENDERERS.find(renderer => renderer.representation === Representation.ResponseMetrics);
        assert.ok(metrics);

        const [page] = drawAll(store, metrics, new Map());
        const shares = [...(page?.querySelectorAll("text") ?? [])]
            .map(node => /(\d+)%$/.exec(node.textContent ?? ""))
            .filter((match): match is RegExpExecArray => match !== null)
            .map(match => Number(match[1]));
        assert.ok(shares.length > 1);
        assert.equal(shares.reduce((sum, share) => sum + share, 0), FULL_SHARE);
    });

    it("draws a header with no host specific facts unless a customizer adds them", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const timeline = BUILT_IN_RENDERERS.find(renderer => renderer.representation === Representation.SequentialTimeline);
        assert.ok(timeline);

        const defaultTexts = textsOf(timeline.paginate(contextFor(store, timeline, new Map())).draw(0));
        assert.ok(defaultTexts.includes(sample.incident.title));
        assert.ok(defaultTexts.includes("HIGH IMPACT"));
        assert.equal(defaultTexts.some(value => value.startsWith("Handled from")), false);

        const customized = textsOf(timeline.paginate(contextFor(store, timeline, new Map(), (header, context) => ({
            ...header,
            title: CUSTOM_TITLE,
            subtitle: `Handled by ${context.incident.scope}`,
            reference: null,
            details: [{ label: "BUSINESS", value: "MEDIUM", color: context.palette.impactColor("Medium") }]
        }))).draw(0));

        assert.ok(customized.includes(CUSTOM_TITLE));
        assert.ok(customized.includes(`Handled by ${sample.incident.scope}`));
        assert.ok(customized.includes("BUSINESS") && customized.includes("MEDIUM"));
        assert.equal(customized.includes(sample.incident.referenceId ?? ""), false);
    });

    it("labels the rating with the configured impact scale", () => {
        const catalog = { ...structuredClone(sample.catalog), impactScale: CUSTOM_SCALE };
        const store = new DiagramStore();
        store.load({ ...structuredClone(sample), catalog, incident: { ...sample.incident, impact: "P1" } });
        const timeline = BUILT_IN_RENDERERS.find(renderer => renderer.representation === Representation.SequentialTimeline);
        assert.ok(timeline);

        const texts = textsOf(timeline.paginate(contextFor(store, timeline, new Map())).draw(0));
        assert.ok(texts.includes("MAJOR IMPACT"));
        assert.equal(new Palette(catalog).impactColor("P1"), "#c62828");
    });

    it("makes every narrative row clickable across its whole width", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const narrative = BUILT_IN_RENDERERS.find(renderer => renderer.representation === Representation.Narrative);
        assert.ok(narrative);

        drawAll(store, narrative, new Map()).forEach(page => {
            const rows = page.querySelectorAll("[data-step-id]");
            assert.ok(rows.length > 0);
            rows.forEach(row => assert.equal(row.querySelectorAll(".tlg-hit").length, 1));
        });
    });

    for (const renderer of BUILT_IN_RENDERERS) {
        it(`${renderer.representation} draws the sample incident with every setting`, () => {
            const store = new DiagramStore();
            store.load(structuredClone(sample));

            optionSets(renderer).forEach(options => {
                const pages = drawAll(store, renderer, options);
                pages.forEach(page => {
                    assert.equal(page.tagName.toLowerCase(), "g");
                    assert.ok(page.querySelectorAll("text").length > MIN_TEXTS_ON_A_SLIDE, `${renderer.representation} drew an almost empty slide`);
                });
                // Aggregate views summarise records rather than drawing each one, so they carry no record ids
                if (!AGGREGATE_VIEWS.has(renderer.representation)) {
                    const records = pages.reduce((count, page) => count + page.querySelectorAll(RECORD_SELECTOR).length, 0);
                    assert.ok(records > 0, `${renderer.representation} drew no record`);
                }
            });
        });

        it(`${renderer.representation} draws an empty incident without failing`, () => {
            const store = new DiagramStore();
            store.load(structuredClone(empty));
            const pages = drawAll(store, renderer, new Map());
            assert.equal(pages.reduce((count, page) => count + page.querySelectorAll(STEP_SELECTOR).length, 0), 0);
        });
    }
});
