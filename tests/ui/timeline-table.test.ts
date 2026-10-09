import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Audience, Representation } from "../../src/core/enums.js";
import type { Diagram } from "../../src/core/models.js";
import { TimeFormats } from "../../src/core/time.js";
import { DiagramStore } from "../../src/ui/diagram-store.js";
import { IconSet } from "../../src/ui/icons/icon-set.js";
import { BUILT_IN_RENDERERS } from "../../src/ui/renderers/index.js";
import { parseOptionList, serializeOptionList, type ListEntry, type RenderContext, type Renderer } from "../../src/ui/renderers/registry.js";
import { DEFAULT_STRINGS } from "../../src/ui/strings.js";
import { Palette } from "../../src/ui/theme.js";
import { TABLE_COLUMNS_OPTION_ID, TableColumn, tableColumnsOption, timelineTable } from "../../src/ui/timeline-table.js";
import { ViewPicker, mountTimeline } from "../../src/ui/workspace.js";
import { installDom, syntheticEvent } from "../support/dom.js";
import { seededService } from "../support/fixtures.js";

const ROWS_OPTION = "rows";
const SUMMARY_OPTION = "summary";
const COMPACT = "compact";
const COMFORTABLE = "comfortable";
const HIDDEN = "hidden";
const SUMMARY_HEADING = "WHAT HAPPENED";
const UNKNOWN_COLUMN = "shoe-size";
const COLUMNS = tableColumnsOption(DEFAULT_STRINGS);
const SHARED_FILTERS = 3;
const RENAMED = "Action, taken = 100%";
const LONG_NAME = "x".repeat(200);
const LABEL_LIMIT = 60;
const FIRST_ROW = "1";

function entries(...values: TableColumn[]): ListEntry<TableColumn>[] {
    return values.map(value => ({ value, label: null }));
}

function values(list: readonly ListEntry[]): string[] {
    return list.map(entry => entry.value);
}

function narrativeRenderer(): Renderer {
    const renderer = BUILT_IN_RENDERERS.find(entry => entry.representation === Representation.Narrative);
    assert.ok(renderer);
    return renderer;
}

function contextFor(store: DiagramStore, options: ReadonlyMap<string, string>): RenderContext {
    return {
        store,
        palette: new Palette(store.catalog),
        icons: new IconSet(),
        representation: store.representationInfo(Representation.Narrative),
        strings: DEFAULT_STRINGS,
        time: new TimeFormats(),
        options,
        slideHeader: null
    };
}

function rowHeight(page: SVGGElement): number {
    return Number(page.querySelector(".tlg-hit")?.getAttribute("height"));
}

function texts(page: SVGGElement): string[] {
    return [...page.querySelectorAll("text")].map(node => node.textContent ?? "");
}

describe("list options", () => {
    it("keeps the known values in their stored order", () => {
        const stored = serializeOptionList(entries(TableColumn.Stage, TableColumn.When));
        assert.deepEqual(values(parseOptionList(stored, COLUMNS)), [TableColumn.Stage, TableColumn.When]);
    });

    it("drops unknown and repeated values", () => {
        const stored = [TableColumn.What, UNKNOWN_COLUMN, TableColumn.What].join(",");
        assert.deepEqual(values(parseOptionList(stored, COLUMNS)), [TableColumn.What]);
    });

    it("falls back when nothing is stored or nothing known is left", () => {
        assert.deepEqual(values(parseOptionList(undefined, COLUMNS)), [...COLUMNS.fallback]);
        assert.deepEqual(values(parseOptionList(UNKNOWN_COLUMN, COLUMNS)), [...COLUMNS.fallback]);
    });

    it("keeps a name holding the characters of the format itself", () => {
        const stored = serializeOptionList([{ value: TableColumn.What, label: RENAMED }, { value: TableColumn.When, label: null }]);
        assert.deepEqual(parseOptionList(stored, COLUMNS), [{ value: TableColumn.What, label: RENAMED }, { value: TableColumn.When, label: null }]);
    });

    it("bounds a stored name and drops a blank one", () => {
        const [long, blank] = parseOptionList(`${TableColumn.What}=${LONG_NAME},${TableColumn.When}= `, COLUMNS);
        assert.equal(long?.label?.length, LABEL_LIMIT);
        assert.equal(blank?.label, null);
    });

    it("ignores names on a list that takes none", () => {
        const fixed = { ...COLUMNS, renamable: false };
        assert.deepEqual(parseOptionList(`${TableColumn.What}=Action`, fixed), [{ value: TableColumn.What, label: null }]);
    });
});

describe("timeline table", () => {
    let sample: Diagram;

    before(async () => {
        installDom();
        const seeded = await seededService();
        sample = await seeded.service.getDiagram(seeded.incident.id);
    });

    it("writes one row per visible step with the chosen columns", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const table = timelineTable(store, new TimeFormats(), DEFAULT_STRINGS, [{ value: TableColumn.What, label: RENAMED }, { value: TableColumn.Side, label: null }]);
        assert.deepEqual(table.headings.map(heading => heading.label), [RENAMED, DEFAULT_STRINGS.table.side]);
        assert.equal(table.rows.length, store.visibleSteps().length);
        table.rows.forEach(row => assert.equal(row.length, 2));
    });

    it("fills every column for the sample", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const all = Object.values(TableColumn);
        const table = timelineTable(store, new TimeFormats(), DEFAULT_STRINGS, entries(...all));
        const column = (key: TableColumn): string[] => table.rows.map(row => row[all.indexOf(key)] ?? "");
        assert.equal(column(TableColumn.Number)[0], FIRST_ROW);
        assert.equal(column(TableColumn.Elapsed)[0], DEFAULT_STRINGS.table.sinceStart(new TimeFormats().formatDuration(0) ?? ""));
        assert.ok(column(TableColumn.Milestone).some(cell => cell !== ""));
        assert.ok(column(TableColumn.KillChain).some(cell => cell !== ""));
        assert.ok(column(TableColumn.WhereCompromised).some(cell => cell === DEFAULT_STRINGS.table.yes));
    });

    it("heads the narrative table with the chosen columns in their order", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const options = new Map([[TABLE_COLUMNS_OPTION_ID, serializeOptionList([{ value: TableColumn.Technique, label: RENAMED }, { value: TableColumn.When, label: null }])]]);
        const page = narrativeRenderer().paginate(contextFor(store, options)).draw(0);
        const headings = texts(page);
        const technique = headings.indexOf(RENAMED.toUpperCase());
        const when = headings.indexOf(DEFAULT_STRINGS.table.when.toUpperCase());
        assert.ok(technique >= 0 && when > technique);
        assert.equal(headings.indexOf(DEFAULT_STRINGS.table.who.toUpperCase()), -1);
    });

    it("draws compact rows shorter than comfortable ones", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const draw = (density: string): SVGGElement => narrativeRenderer().paginate(contextFor(store, new Map([[ROWS_OPTION, density]]))).draw(0);
        assert.ok(rowHeight(draw(COMPACT)) < rowHeight(draw(COMFORTABLE)));
    });

    it("leaves the summary out when it is hidden", () => {
        const store = new DiagramStore();
        store.load(structuredClone(sample));
        const draw = (options: ReadonlyMap<string, string>): string[] => texts(narrativeRenderer().paginate(contextFor(store, options)).draw(0));
        const columns: [string, string] = [TABLE_COLUMNS_OPTION_ID, TableColumn.When];
        assert.ok(draw(new Map([columns])).includes(SUMMARY_HEADING));
        assert.ok(!draw(new Map([columns, [SUMMARY_OPTION, HIDDEN]])).includes(SUMMARY_HEADING));
    });
});

describe("view settings panel", () => {
    async function mounted(viewPicker = ViewPicker.Scroll) {
        installDom();
        const { service, incident } = await seededService();
        const element = document.createElement("div");
        document.body.append(element);
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, viewPicker });
        handle.selectRepresentation(Representation.Narrative);
        return { handle, element };
    }

    it("describes the shared filters in the words of the view, then its own settings", async () => {
        const { handle, element } = await mounted();
        const sections = element.querySelectorAll(".tlg-settings-menu .tlg-view-setting");
        assert.equal(sections.length, SHARED_FILTERS + narrativeRenderer().options(DEFAULT_STRINGS).length);
        const hints = [...element.querySelectorAll(".tlg-view-setting-hint")].map(node => node.textContent);
        assert.equal(hints[0], DEFAULT_STRINGS.filters.narrative.audience);
        assert.equal(hints[1], DEFAULT_STRINGS.filters.narrative.milestones);
        handle.destroy();
    });

    it("keeps only the filters shared by every view in the toolbar", async () => {
        const { handle, element } = await mounted();
        assert.equal(element.querySelectorAll(".tlg-filters .tlg-chip-toggle").length, SHARED_FILTERS);
        handle.destroy();
    });

    it("filters from the panel and lights the choice in the toolbar too", async () => {
        const { handle, element } = await mounted();
        element.querySelector<HTMLButtonElement>(`[data-control="filter-audience:${Audience.Executive}"]`)?.click();
        assert.equal(handle.state.filters.audience, Audience.Executive);
        assert.equal(element.querySelector(".tlg-filters .tlg-chip-toggle")?.getAttribute("aria-pressed"), "true");
        element.querySelector<HTMLButtonElement>("[data-control=\"filter-milestones:only\"]")?.click();
        assert.equal(handle.state.filters.milestonesOnly, true);
        handle.destroy();
    });

    it("offers the views as a dropdown when asked", async () => {
        const { handle, element } = await mounted(ViewPicker.Menu);
        assert.equal(element.querySelector(".tlg-views"), null);
        const picker = element.querySelector<HTMLSelectElement>(".tlg-view-select");
        assert.ok(picker);
        const options = [...picker.querySelectorAll("option")];
        assert.equal(options.find(option => option.selected)?.value, Representation.Narrative);
        const matrix = options.find(option => option.value === Representation.AttackMatrix);
        assert.ok(matrix);
        matrix.selected = true;
        picker.dispatchEvent(syntheticEvent("change"));
        assert.equal(handle.state.representation, Representation.AttackMatrix);
        handle.destroy();
    });

    it("frames the strip of views with an arrow at each end", async () => {
        const { handle, element } = await mounted();
        assert.equal(element.querySelectorAll(".tlg-views-frame .tlg-views-more").length, 2);
        assert.equal(element.querySelector(".tlg-view-select"), null);
        handle.destroy();
    });

    it("adds a ticked column after the chosen ones", async () => {
        const { handle, element } = await mounted();
        const box = element.querySelector<HTMLInputElement>(`[data-control="${TABLE_COLUMNS_OPTION_ID}:${TableColumn.Details}:pick"]`);
        assert.ok(box);
        box.checked = true;
        box.dispatchEvent(syntheticEvent("change"));
        assert.equal(handle.state.options.get(TABLE_COLUMNS_OPTION_ID), serializeOptionList(entries(...COLUMNS.fallback, TableColumn.Details)));
        handle.destroy();
    });

    it("moves a chosen column up", async () => {
        const { handle, element } = await mounted();
        const [first, second] = COLUMNS.fallback;
        assert.ok(first && second);
        element.querySelector<HTMLButtonElement>(`[data-control="${TABLE_COLUMNS_OPTION_ID}:${second}:up"]`)?.click();
        const order = parseOptionList(handle.state.options.get(TABLE_COLUMNS_OPTION_ID), COLUMNS);
        assert.deepEqual(values(order.slice(0, 2)), [second, first]);
        handle.destroy();
    });

    it("renames a chosen column and offers no name to the others", async () => {
        const { handle, element } = await mounted();
        const name = element.querySelector<HTMLInputElement>(`[data-control="${TABLE_COLUMNS_OPTION_ID}:${TableColumn.What}:name"]`);
        assert.ok(name);
        assert.equal(name.value, DEFAULT_STRINGS.table.what);
        assert.equal(element.querySelector(`[data-control="${TABLE_COLUMNS_OPTION_ID}:${TableColumn.Details}:name"]`), null);
        name.value = ` ${RENAMED} `;
        name.dispatchEvent(syntheticEvent("change"));
        const renamed = parseOptionList(handle.state.options.get(TABLE_COLUMNS_OPTION_ID), COLUMNS).find(entry => entry.value === TableColumn.What);
        assert.equal(renamed?.label, RENAMED);
        handle.destroy();
    });

    it("clears a rename given back the name of the column", async () => {
        const { handle, element } = await mounted();
        handle.setOption(Representation.Narrative, TABLE_COLUMNS_OPTION_ID, serializeOptionList([{ value: TableColumn.What, label: RENAMED }]));
        const name = element.querySelector<HTMLInputElement>(`[data-control="${TABLE_COLUMNS_OPTION_ID}:${TableColumn.What}:name"]`);
        assert.equal(name?.value, RENAMED);
        assert.ok(name);
        name.value = DEFAULT_STRINGS.table.what;
        name.dispatchEvent(syntheticEvent("change"));
        assert.equal(handle.state.options.get(TABLE_COLUMNS_OPTION_ID), TableColumn.What);
        handle.destroy();
    });

    it("shows what a column still to be added would hold, and nothing beside a chosen one", async () => {
        const { handle, element } = await mounted();
        const example = (column: TableColumn): string | null | undefined => element
            .querySelector(`[data-control="${TABLE_COLUMNS_OPTION_ID}:${column}:pick"]`)
            ?.closest("label")?.querySelector(".tlg-view-setting-example")?.textContent;
        assert.equal(example(TableColumn.Number), FIRST_ROW);
        assert.equal(example(TableColumn.What), undefined);
        handle.destroy();
    });

    it("puts the view and the shared filters back to their defaults", async () => {
        const { handle, element } = await mounted();
        const reset = (): HTMLButtonElement | null => element.querySelector<HTMLButtonElement>("[data-control=\"reset\"]");
        assert.equal(reset()?.disabled, true);
        handle.setOption(Representation.Narrative, TABLE_COLUMNS_OPTION_ID, serializeOptionList([{ value: TableColumn.What, label: RENAMED }]));
        handle.setFilters({ audience: Audience.Executive, milestonesOnly: true });
        assert.equal(reset()?.disabled, false);

        reset()?.click();
        assert.equal(handle.state.options.size, 0);
        assert.equal(handle.state.filters.audience, Audience.Both);
        assert.equal(handle.state.filters.milestonesOnly, false);
        assert.equal(reset()?.disabled, true);
        handle.destroy();
    });

    it("puts one setting back without touching the others", async () => {
        const { handle, element } = await mounted();
        const resetOf = (key: string): HTMLButtonElement | null => element.querySelector<HTMLButtonElement>(`[data-control="${key}:reset"]`);
        assert.equal(resetOf(ROWS_OPTION), null);
        assert.equal(resetOf("filter-audience"), null);

        handle.setOption(Representation.Narrative, ROWS_OPTION, COMPACT);
        handle.setOption(Representation.Narrative, SUMMARY_OPTION, HIDDEN);
        handle.setFilters({ audience: Audience.Executive });
        resetOf(ROWS_OPTION)?.click();
        assert.equal(handle.state.options.get(ROWS_OPTION), undefined);
        assert.equal(handle.state.options.get(SUMMARY_OPTION), HIDDEN);
        assert.equal(handle.state.filters.audience, Audience.Executive);
        assert.equal(resetOf(ROWS_OPTION), null);

        resetOf("filter-audience")?.click();
        assert.equal(handle.state.filters.audience, Audience.Both);
        handle.destroy();
    });

    it("offers no reset for a setting chosen back to its default", async () => {
        const { handle, element } = await mounted();
        handle.setOption(Representation.Narrative, ROWS_OPTION, COMFORTABLE);
        assert.equal(element.querySelector(`[data-control="${ROWS_OPTION}:reset"]`), null);
        handle.destroy();
    });

    it("keeps the last column", async () => {
        const { handle, element } = await mounted();
        handle.setOption(Representation.Narrative, TABLE_COLUMNS_OPTION_ID, TableColumn.What);
        const box = element.querySelector<HTMLInputElement>(`[data-control="${TABLE_COLUMNS_OPTION_ID}:${TableColumn.What}:pick"]`);
        assert.equal(box?.disabled, true);
        handle.destroy();
    });
});
