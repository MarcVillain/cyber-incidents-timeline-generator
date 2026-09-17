import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Representation } from "../../src/core/enums.js";
import { TimeFormats } from "../../src/core/time.js";
import { DiagramStore } from "../../src/ui/diagram-store.js";
import { IconSet } from "../../src/ui/icons/icon-set.js";
import { BUILT_IN_RENDERERS } from "../../src/ui/renderers/index.js";
import type { RenderContext } from "../../src/ui/renderers/registry.js";
import { DEFAULT_STRINGS, buildStrings } from "../../src/ui/strings.js";
import { Palette } from "../../src/ui/theme.js";
import { installDom } from "../support/dom.js";
import { seededService } from "../support/fixtures.js";

installDom();

const FRENCH = {
    scene: { emptyTimelineTitle: "Rien n'est encore enregistre" },
    options: { density: "Densite", densityCompact: "Compact" }
};

describe("strings", () => {
    it("keeps the English defaults for anything a host leaves out", () => {
        const strings = buildStrings(FRENCH);
        assert.equal(strings.scene.emptyTimelineTitle, "Rien n'est encore enregistre");
        assert.equal(strings.scene.emptyTimelineHint, DEFAULT_STRINGS.scene.emptyTimelineHint);
        assert.equal(strings.workspace.add, DEFAULT_STRINGS.workspace.add);
    });

    it("leaves the defaults untouched", () => {
        buildStrings({ workspace: { add: "Ajouter" } });
        assert.equal(DEFAULT_STRINGS.workspace.add, "Add");
    });

    it("writes a host label on a renderer option", () => {
        const timeline = BUILT_IN_RENDERERS.find(renderer => renderer.representation === Representation.SequentialTimeline);
        assert.ok(timeline);
        const [option] = timeline.options(buildStrings(FRENCH));
        assert.equal(option?.label, "Densite");
    });

    it("draws a scene in the words the host gave", async () => {
        const { service } = await seededService();
        const empty = await service.createIncident({ title: "Nothing recorded yet" });
        const store = new DiagramStore();
        store.load(await service.getDiagram(empty.id));

        const renderer = BUILT_IN_RENDERERS.find(entry => entry.representation === Representation.SequentialTimeline);
        assert.ok(renderer);
        const context: RenderContext = {
            store,
            palette: new Palette(store.catalog),
            icons: new IconSet(),
            representation: store.representationInfo(renderer.representation),
            strings: buildStrings(FRENCH),
            time: new TimeFormats(),
            options: new Map(),
            slideHeader: null
        };
        const page = renderer.paginate(context).draw(0);
        const texts = [...page.querySelectorAll("text")].map(node => node.textContent ?? "");
        assert.ok(texts.some(value => value.includes("Rien n'est encore enregistre")), texts.join(" | "));
    });
});

describe("locale", () => {
    it("writes dates in the locale it was given", () => {
        const date = new Date(Date.UTC(2026, 0, 12, 8, 30));
        assert.notEqual(new TimeFormats("fr-FR").formatDate(date), new TimeFormats("en-GB").formatDate(date));
    });

    it("defaults to en-GB whatever the machine is set to", () => {
        assert.equal(new TimeFormats().locale, "en-GB");
    });

    it("writes durations with the suffixes it was given", () => {
        const formats = new TimeFormats("fr-FR", { minutes: "min", hours: "h", days: "j" });
        assert.equal(formats.formatDuration(10), "10h");
        assert.equal(formats.formatDuration(240), "10j");
    });

    it("keeps two sets of formats apart, so two workspaces can differ", () => {
        const date = new Date(Date.UTC(2026, 0, 12, 8, 30));
        const french = new TimeFormats("fr-FR");
        const british = new TimeFormats("en-GB");
        assert.notEqual(french.formatDate(date), british.formatDate(date));
        assert.equal(british.formatDate(date), new TimeFormats("en-GB").formatDate(date));
    });
});
