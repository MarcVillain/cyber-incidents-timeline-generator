// Wires the workspace together: load the diagram once, keep it in the store, and redraw the chosen
// representation whenever the records, the filters or the theme change.
//
// Edits are applied here first and saved behind them. That is what lets an open form keep its scroll
// position and its half typed fields while the drawing updates.

import type { Catalog } from "../core/catalog.js";
import { Audience, RecordType, Representation, type AudienceKey, type RepresentationKey } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import { linkFieldsOf, nodeFieldsOf, stepFieldsOf } from "../core/mapping.js";
import type { LinkCreateInput, RecordId, StepInvolvement } from "../core/models.js";
import type { TimelineApi } from "../core/service.js";
import type { KeyValueStorage } from "../storage/browser-storage-store.js";
import { DiagramStore, StoreChange, type Selection, type StepFilters, type TimelineStep } from "./diagram-store.js";
import { h } from "./dom.js";
import { ExportFormat, copyTable, exportCsv, exportDocumentFile, exportHtml, exportMarkdown, exportPng, exportSvg, exportXlsx, printPages } from "./export.js";
import { button } from "./forms.js";
import { History, type HistoryEntry } from "./history.js";
import { IconSet } from "./icons/icon-set.js";
import { Inspector } from "./inspector.js";
import { Access } from "./panels.js";
import type { RecordDraft, RecordEdit, TimelinePermissions, WorkspaceActions } from "./panels.js";
import { Preferences, defaultPreferenceStorage } from "./preferences.js";
import { Rail } from "./rail.js";
import { BUILT_IN_RENDERERS } from "./renderers/index.js";
import { LIST_LABEL_LENGTH, OptionKind, cleanListLabel, parseOptionList, serializeOptionList, type ListEntry, type Pagination, type RenderContext, type Renderer, type RendererChoice, type RendererListOption, type RendererOption, type RendererSetting } from "./renderers/registry.js";
import { tableColumnsOption, timelineTable } from "./timeline-table.js";
import { Palette, elementTokenResolver } from "./theme.js";
import type { SlideHeaderCustomizer } from "./slide-header.js";
import { ColorScheme, detectPageTheme, watchPageTheme, type ThemeDetector } from "./theme-detection.js";
import { ThemeMode } from "./theme-mode.js";
import { CanvasMode } from "./canvas-mode.js";
import { ViewPicker } from "./view-picker.js";
import { TimeFormats, type DurationUnits } from "../core/time.js";
import { buildStrings, type Strings, type StringsOverride } from "./strings.js";
import { DEFAULT_PAGE_SIZE, Viewport, type PageSize, type Point } from "./viewport.js";
import type { DiagramSummary } from "../core/summary.js";
import { withPageSize } from "./chrome.js";

export { CanvasMode, ThemeMode, ViewPicker };

export interface TimelineOptions {
    /** Where the diagram lives: a TimelineService in the page, or an HttpTimelineApi talking to a server. */
    api: TimelineApi;
    incidentId: RecordId;
    /** What the viewer may do. Everything is allowed unless said otherwise; the server still decides. */
    permissions?: Partial<TimelinePermissions>;
    /** The representations offered, in order. Defaults to every built in one. */
    renderers?: readonly Renderer[];
    icons?: IconSet;
    /**
     * The theme to start with when the viewer has not picked one with the toggle yet. Auto follows the page the
     * workspace sits in, and the system when the page declares nothing.
     */
    theme?: ThemeMode;
    /** Whether the toolbar offers the auto, light and dark toggle. Without it, a remembered choice is ignored. */
    themeToggle?: boolean;
    /** How Auto reads the theme of the page. Defaults to the attributes and classes common sites use. */
    themeDetector?: ThemeDetector;
    /** Where the chosen view is remembered. Defaults to localStorage when the page may use it; null forgets. */
    preferences?: KeyValueStorage | null;
    preferenceKey?: string;
    /** Rewrites the title block of every slide, on screen and in exports. */
    slideHeader?: SlideHeaderCustomizer;
    /** Receives every message the workspace would otherwise show as a toast. */
    onNotify?: (message: string) => void;
    /** Receives the view state after every change, which is what lets a host own the address bar. */
    onStateChange?: (state: TimelineState) => void;
    /** The page a representation lays itself out in. Defaults to the 1600 by 900 slide. */
    pageSize?: PageSize;
    /** Whether the scene is cut into slides, or laid out in one run as tall as it needs. */
    canvasMode?: CanvasMode;
    /** Whether the views are offered as a scrolling strip of pills or as one dropdown. Defaults to the strip. */
    viewPicker?: ViewPicker;
    /** The words of the interface. Anything left out keeps the English default. */
    strings?: StringsOverride;
    /** The locale dates are written in. Defaults to en-GB, whatever the browser is set to. */
    locale?: string;
    /** The suffixes durations are written with, which no locale covers. */
    durationUnits?: DurationUnits;
}

/**
 * What the workspace is showing. Handed to onStateChange after every change, so a host can carry it in
 * its own address bar and hand it back through the handle.
 */
export interface TimelineState {
    representation: RepresentationKey;
    pageIndex: number;
    pageCount: number;
    filters: StepFilters;
    /** The settings of the current representation, keyed by option id. */
    options: ReadonlyMap<string, string>;
    selection: Selection | null;
}

export interface TimelineHandle {
    reload(): Promise<void>;
    redraw(): void;
    setTheme(mode: ThemeMode): void;
    selectRepresentation(representation: RepresentationKey): void;
    /** Selects a record and opens its details, or clears the selection when given null. */
    select(selection: Selection | null): void;
    exportAs(format: ExportFormat): Promise<void>;
    /** What is on screen right now. */
    readonly state: TimelineState;
    /** What the loaded incident holds, counted. Unaffected by the filters and the chosen representation. */
    readonly summary: DiagramSummary;
    /** Turns to a slide of the current representation; out of range values are clamped. */
    setPage(pageIndex: number): void;
    setFilters(filters: Partial<StepFilters>): void;
    /** Sets a setting of a representation, such as the density of the timeline. */
    setOption(representation: RepresentationKey, optionId: string, value: string): void;
    destroy(): void;
}

const DEFAULT_PREFERENCE_KEY = "cyber-incidents-timeline";
const TOAST_MS = 4000;
// Names each control of the settings panel, so the focus survives the panel being rebuilt
const CONTROL_KEY = "data-control";
const AUDIENCE_CONTROL = "filter-audience";
const MILESTONES_CONTROL = "filter-milestones";
const RESET_CONTROL = "reset";
// How much of the strip one press of an edge arrow scrolls, leaving a pill of the old view in sight
const VIEW_SCROLL_SHARE = 0.8;
// Sub pixel widths never line up exactly, so an edge closer than this counts as reached
const SCROLL_EDGE = 2;
// The gap kept between an open menu and the edge of the window
const VIEWPORT_MARGIN = 8;
// Below this a menu is left taller than the room under it, since a sliver of a list is no use
const MENU_MIN_HEIGHT = 160;

enum MilestoneChoice {
    Every = "every",
    Only = "only"
}

function milestoneChoices(strings: Strings): readonly RendererChoice<MilestoneChoice>[] {
    return [
        { value: MilestoneChoice.Every, label: strings.workspace.everyStep },
        { value: MilestoneChoice.Only, label: strings.workspace.milestonesOnly }
    ];
}

// Growing the canvas is a search, not a measurement: a renderer only ever says how many pages it took
const CANVAS_GROWTH_TRIES = 6;
const CANVAS_GROWTH_STEP = 4;
const CANVAS_MAX_HEIGHT = 20000;

/** Every step, then each audience of the catalog. */
function audienceChoices(strings: Strings, catalog: Catalog): readonly RendererChoice<AudienceKey>[] {
    return [{ value: Audience.Both, label: strings.workspace.audienceEverything }, ...catalog.audiences];
}

function exportChoices(strings: Strings): readonly { format: ExportFormat; label: string; icon: Icon }[] {
    return [
        { format: ExportFormat.Png, label: strings.workspace.exportPng, icon: Icon.Image },
        { format: ExportFormat.Svg, label: strings.workspace.exportSvg, icon: Icon.Vector },
        { format: ExportFormat.Html, label: strings.workspace.exportHtml, icon: Icon.Code },
        { format: ExportFormat.Print, label: strings.workspace.exportPrint, icon: Icon.Print },
        { format: ExportFormat.Document, label: strings.workspace.exportDocument, icon: Icon.Download },
        { format: ExportFormat.Xlsx, label: strings.workspace.exportXlsx, icon: Icon.Grid },
        { format: ExportFormat.Csv, label: strings.workspace.exportCsv, icon: Icon.FileText },
        { format: ExportFormat.Markdown, label: strings.workspace.exportMarkdown, icon: Icon.FileCode },
        { format: ExportFormat.Clipboard, label: strings.workspace.exportClipboard, icon: Icon.ClipboardList }
    ];
}

interface ThemeChoice {
    label: string;
    icon: Icon;
    next: ThemeMode;
}

function themeChoices(strings: Strings): Readonly<Record<ThemeMode, ThemeChoice>> {
    return {
        [ThemeMode.Auto]: { label: strings.workspace.themeAuto, icon: Icon.Auto, next: ThemeMode.Light },
        [ThemeMode.Light]: { label: strings.workspace.themeLight, icon: Icon.Sun, next: ThemeMode.Dark },
        [ThemeMode.Dark]: { label: strings.workspace.themeDark, icon: Icon.Moon, next: ThemeMode.Auto }
    };
}

const RECORD_ATTRIBUTES: Readonly<Record<RecordType, string>> = {
    [RecordType.Node]: "data-node-id",
    [RecordType.Step]: "data-step-id",
    [RecordType.Link]: "data-link-id"
};

function labelFor(strings: Strings, type: RecordType): string {
    if (type === RecordType.Node) return strings.workspace.recordLabel;
    return type === RecordType.Step ? strings.workspace.stepLabel : strings.workspace.linkLabel;
}

function resolveOptional(history: History, type: RecordType, id: RecordId | null): RecordId | null {
    return id === null ? null : history.resolve(type, id);
}

/**
 * Rewrites the identifiers a captured draft points at, because whatever it referred to may itself have
 * been recreated since.
 */
function remapDraft(draft: RecordDraft, history: History): RecordDraft {
    switch (draft.type) {
        case RecordType.Node:
            return { type: draft.type, input: { ...draft.input, parentId: resolveOptional(history, RecordType.Node, draft.input.parentId ?? null) } };
        case RecordType.Step:
            return {
                type: draft.type,
                input: {
                    ...draft.input,
                    sourceNodeId: resolveOptional(history, RecordType.Node, draft.input.sourceNodeId ?? null),
                    targetNodeId: resolveOptional(history, RecordType.Node, draft.input.targetNodeId ?? null),
                    involvements: (draft.input.involvements ?? []).map((entry: StepInvolvement) => ({ ...entry, nodeId: history.resolve(RecordType.Node, entry.nodeId) }))
                }
            };
        case RecordType.Link:
            return { type: draft.type, input: remapLink(draft.input, history) };
    }
}

function remapLink(input: LinkCreateInput, history: History): LinkCreateInput {
    return {
        ...input,
        sourceNodeId: history.resolve(RecordType.Node, input.sourceNodeId),
        targetNodeId: history.resolve(RecordType.Node, input.targetNodeId),
        stepId: resolveOptional(history, RecordType.Step, input.stepId ?? null)
    };
}

interface Captured {
    draft: RecordDraft;
    id: RecordId;
    links: LinkCreateInput[];
    references: { stepId: RecordId; asSource: boolean; asTarget: boolean }[];
}

interface Elements {
    /** The strip of pills, absent when the views are offered as a dropdown. */
    views: HTMLElement | null;
    viewsBefore: HTMLButtonElement | null;
    viewsAfter: HTMLButtonElement | null;
    viewSelect: HTMLSelectElement | null;
    filters: HTMLElement;
    settingsMenu: HTMLDetailsElement;
    settingsPanel: HTMLElement;
    canvas: HTMLElement;
    caption: HTMLElement;
    pager: HTMLElement;
    empty: HTMLElement;
    emptyAdd: HTMLButtonElement | null;
    list: HTMLElement;
    search: HTMLInputElement;
    stats: HTMLElement;
    addButton: HTMLButtonElement | null;
    addMenu: HTMLElement;
    inspector: HTMLElement;
    undo: HTMLButtonElement | null;
    redo: HTMLButtonElement | null;
    zoomIn: HTMLButtonElement;
    zoomOut: HTMLButtonElement;
    zoomFit: HTMLButtonElement;
    exportMenu: HTMLDetailsElement | null;
    importButton: HTMLButtonElement | null;
    importPicker: HTMLInputElement;
    themeButton: HTMLButtonElement | null;
    stage: HTMLElement;
}

class Workspace implements TimelineHandle {
    private readonly root: HTMLElement;
    private readonly api: TimelineApi;
    private readonly incidentId: RecordId;
    private readonly permissions: Access;
    private readonly renderers: readonly Renderer[];
    private viewPills: HTMLButtonElement[] = [];
    private lit: RecordId | null = null;
    private readonly icons: IconSet;
    private readonly preferences: Preferences;
    private readonly onNotify: ((message: string) => void) | null;
    private readonly onStateChange: ((state: TimelineState) => void) | null;
    private readonly slideHeader: SlideHeaderCustomizer | null;
    private readonly canvasMode: CanvasMode;
    private readonly viewPicker: ViewPicker;
    private readonly slideSize: PageSize;
    private canvas: PageSize;
    private readonly strings: Strings;
    private readonly time: TimeFormats;
    private readonly detectTheme: ThemeDetector;
    private stopWatchingTheme: () => void = () => undefined;
    private readonly store = new DiagramStore();
    private readonly history: History;
    private readonly lifetime = new AbortController();
    private readonly elements: Elements;
    private readonly viewport: Viewport;
    private readonly rail: Rail;
    private readonly inspector: Inspector;
    private representation: RepresentationKey;
    private theme: ThemeMode;
    private pageIndex = 0;
    private pageCount = 1;
    private followedSelection: string | null = null;

    constructor(root: HTMLElement, options: TimelineOptions) {
        this.root = root;
        this.api = options.api;
        this.incidentId = options.incidentId;
        this.permissions = new Access(options.permissions);
        this.renderers = options.renderers ?? BUILT_IN_RENDERERS;
        this.icons = options.icons ?? new IconSet();
        this.onNotify = options.onNotify ?? null;
        this.onStateChange = options.onStateChange ?? null;
        this.slideHeader = options.slideHeader ?? null;
        this.canvasMode = options.canvasMode ?? CanvasMode.Slides;
        this.viewPicker = options.viewPicker ?? ViewPicker.Scroll;
        this.slideSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
        this.canvas = this.slideSize;
        this.strings = buildStrings(options.strings);
        this.time = new TimeFormats(options.locale, options.durationUnits);
        this.preferences = new Preferences(options.preferences === undefined ? defaultPreferenceStorage() : options.preferences, options.preferenceKey ?? DEFAULT_PREFERENCE_KEY);
        this.history = new History(() => this.renderHistoryButtons());

        const first = this.renderers[0];
        if (!first) {
            throw new Error("mountTimeline needs at least one renderer.");
        }
        const remembered = this.preferences.representation;
        this.representation = remembered !== null && this.renderers.some(renderer => renderer.representation === remembered) ? remembered : first.representation;

        const themeToggle = options.themeToggle ?? true;
        this.detectTheme = options.themeDetector ?? detectPageTheme;
        this.theme = (themeToggle ? this.preferences.theme : null) ?? options.theme ?? ThemeMode.Auto;
        this.elements = this.build(themeToggle);
        const signal = this.lifetime.signal;
        this.viewport = new Viewport(this.elements.canvas, {
            onNodeMoved: (nodeId, position) => void this.pinNode(nodeId, position),
            onTap: target => this.selectAt(target),
            signal
        });

        const actions: WorkspaceActions = {
            create: draft => this.create(draft),
            edit: (id, edit) => this.edit(id, edit),
            remove: (type, id) => this.remove(type, id),
            notify: message => this.notify(message)
        };
        const panelContext = { store: this.store, actions, permissions: this.permissions, icons: this.icons, strings: this.strings, time: this.time, signal };
        this.rail = new Rail(this.elements, panelContext);
        this.inspector = new Inspector(this.elements.inspector, panelContext);
        this.bind();
    }

    private build(themeToggle: boolean): Elements {
        const icons = this.icons;
        const iconButton = (icon: Icon, label: string, disabled = false): HTMLButtonElement => {
            const node = h("button", "tlg-button tlg-button-icon", { type: "button", title: label, "aria-label": label }, [icons.element(icon)]);
            node.disabled = disabled;
            return node;
        };

        const words = this.strings.workspace;
        const themes = themeChoices(this.strings);
        const undo = this.permissions.canEdit ? iconButton(Icon.Undo, words.nothingToUndo, true) : null;
        const redo = this.permissions.canEdit ? iconButton(Icon.Redo, words.nothingToRedo, true) : null;
        const zoomOut = iconButton(Icon.ZoomOut, words.zoomOut);
        const zoomFit = iconButton(Icon.Fit, words.fitToScreen);
        const zoomIn = iconButton(Icon.ZoomIn, words.zoomIn);
        const themeButton = themeToggle ? iconButton(themes[this.theme].icon, themes[this.theme].label) : null;

        const exportMenu = this.permissions.canExport ? h("details", "tlg-menu tlg-export-menu", {}, [
            h("summary", "tlg-button", {}, [icons.element(Icon.Download), words.export]),
            h("div", "tlg-menu-list", { role: "menu" }, exportChoices(this.strings).map(entry => h("button", "tlg-menu-item", { type: "button", role: "menuitem", "data-export": entry.format }, [icons.element(entry.icon), entry.label])))
        ]) : null;

        // Beside the export, because opening a timeline file and writing one out are the same errand, and
        // both belong to the timeline on screen rather than to the application around it
        const importButton = this.permissions.canCreate
            ? iconButton(Icon.Upload, words.import)
            : null;
        const importPicker = h("input", "tlg-import-picker", { type: "file", accept: "application/json,.json", hidden: "" });

        const scrolling = this.viewPicker === ViewPicker.Scroll;
        const views = scrolling ? h("div", "tlg-views", { role: "tablist", "aria-label": words.representations }) : null;
        const viewsBefore = scrolling ? iconButton(Icon.ChevronLeft, words.viewsBefore) : null;
        const viewsAfter = scrolling ? iconButton(Icon.ChevronRight, words.viewsAfter) : null;
        viewsBefore?.classList.add("tlg-views-more", "tlg-views-before");
        viewsAfter?.classList.add("tlg-views-more", "tlg-views-after");
        const viewSelect = scrolling ? null : h("select", "tlg-input tlg-view-select", { "aria-label": words.representations });
        const filters = h("div", "tlg-filters");
        const settingsPanel = h("div", "tlg-menu-list tlg-view-settings", { role: "group", "aria-label": words.settings });
        const settingsMenu = h("details", "tlg-menu tlg-settings-menu", {}, [
            h("summary", "tlg-button tlg-button-icon", { title: words.settings, "aria-label": words.settings }, [icons.element(Icon.Settings)]),
            settingsPanel
        ]);
        const search = h("input", "tlg-input", { type: "search", placeholder: words.filterRecords, "aria-label": words.filterRecords });
        const addButton = this.permissions.canCreate
            ? h("button", "tlg-button tlg-button-primary tlg-add", { type: "button", "aria-haspopup": "true", "aria-expanded": "false" }, [icons.element(Icon.Plus), words.add])
            : null;
        const list = h("div", "tlg-rail-list");
        const stats = h("div", "tlg-rail-foot");
        const canvas = h("div", "tlg-canvas");
        const caption = h("div", "tlg-caption");
        const pager = h("div", "tlg-pager");
        const emptyAdd = this.permissions.canCreate ? h("button", "tlg-button tlg-button-primary", { type: "button" }, [icons.element(Icon.Plus), words.addFirstRecord]) : null;
        const empty = h("div", "tlg-empty", {}, [
            icons.element(Icon.Graph),
            h("p", "tlg-empty-title", {}, [words.emptyTitle]),
            h("p", "tlg-empty-hint", {}, [words.emptyHint]),
            emptyAdd
        ]);
        empty.hidden = true;
        const stage = h("main", "tlg-stage", {}, [canvas, h("div", "tlg-stage-foot", {}, [caption, pager]), empty]);
        const inspector = h("aside", "tlg-inspector", { "aria-label": words.recordDetails });
        inspector.hidden = true;
        const addMenu = h("div", "tlg-addmenu", { role: "menu" });
        addMenu.hidden = true;

        this.root.classList.add("tlg");
        this.root.setAttribute("data-tlg-theme", this.scheme());
        this.root.replaceChildren(
            h("div", "tlg-toolbar", {}, [
                h("div", "tlg-views-frame", {}, [viewsBefore, views, viewsAfter, viewSelect]),
                h("div", "tlg-actions", {}, [
                    filters,
                    settingsMenu,
                    undo && redo ? h("div", "tlg-button-group", {}, [undo, redo]) : null,
                    h("div", "tlg-button-group", {}, [zoomOut, zoomFit, zoomIn]),
                    themeButton,
                    importPicker,
                    importButton,
                    exportMenu
                ])
            ]),
            h("div", "tlg-body", {}, [
                h("aside", "tlg-rail", { "aria-label": words.records }, [h("div", "tlg-rail-head", {}, [search, addButton]), list, stats]),
                stage,
                inspector
            ]),
            addMenu
        );

        return { views, viewsBefore, viewsAfter, viewSelect, filters, settingsMenu, settingsPanel, canvas, caption, pager, empty, emptyAdd, list, search, stats, addButton, addMenu, inspector, undo, redo, zoomIn, zoomOut, zoomFit, exportMenu, importButton, importPicker, themeButton, stage };
    }

    async start(): Promise<void> {
        try {
            this.store.load(await this.api.getDiagram(this.incidentId));
        } catch (error) {
            this.notify(this.strings.workspace.loadFailed);
            throw error;
        }
    }

    private bind(): void {
        const signal = this.lifetime.signal;
        const { elements } = this;

        this.store.subscribe(change => {
            if (change === StoreChange.Load) {
                this.renderViewSwitcher();
                this.renderFilters();
                this.renderHistoryButtons();
            }
            this.rail.render();
            if (change === StoreChange.Records || change === StoreChange.Filters) {
                this.inspector.refresh();
            } else {
                this.inspector.render();
            }
            this.redraw();
        });

        // Over rather than enter, because it bubbles: the pointer reaching the bare canvas reports the
        // canvas, which is what says the light belongs back on the selected record
        this.viewport.svg.addEventListener("pointerover", event => this.followPointer(event.target), { signal });

        elements.zoomIn.addEventListener("click", () => this.viewport.zoomIn(), { signal });
        elements.zoomOut.addEventListener("click", () => this.viewport.zoomOut(), { signal });
        elements.zoomFit.addEventListener("click", () => this.viewport.fit(), { signal });
        elements.themeButton?.addEventListener("click", () => this.setTheme(themeChoices(this.strings)[this.theme].next), { signal });
        elements.undo?.addEventListener("click", () => void this.undo(), { signal });
        elements.redo?.addEventListener("click", () => void this.redo(), { signal });
        elements.emptyAdd?.addEventListener("click", event => {
            event.stopPropagation();
            this.rail.openMenu();
        }, { signal });

        // A menu left open would hide the slide it settles, so a press anywhere else closes it
        document.addEventListener("pointerdown", event => {
            [elements.exportMenu, elements.settingsMenu].forEach(menu => {
                if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
            });
        }, { signal });

        const menus = [elements.exportMenu, elements.settingsMenu].flatMap(menu => (menu ? [menu] : []));
        menus.forEach(menu => menu.addEventListener("toggle", () => fitMenu(menu), { signal }));
        window.addEventListener("resize", () => menus.forEach(fitMenu), { signal });

        elements.importButton?.addEventListener("click", () => elements.importPicker.click(), { signal });
        elements.importPicker.addEventListener("change", () => void this.importChosenFile(), { signal });

        elements.exportMenu?.querySelectorAll<HTMLButtonElement>("[data-export]").forEach(control => {
            control.addEventListener("click", () => {
                if (elements.exportMenu) elements.exportMenu.open = false;
                const format = exportChoices(this.strings).find(entry => entry.format === control.getAttribute("data-export"))?.format;
                if (format) void this.exportAs(format);
            }, { signal });
        });

        this.root.addEventListener("keydown", event => {
            if (event.key === "Escape" && this.store.selection && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
                this.store.setSelection(null);
                return;
            }
            if (!(event.ctrlKey || event.metaKey) || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            const key = event.key.toLowerCase();
            if (key === "z" && !event.shiftKey) {
                event.preventDefault();
                void this.undo();
            }
            if (key === "y" || (key === "z" && event.shiftKey)) {
                event.preventDefault();
                void this.redo();
            }
        }, { signal });

        const { views } = elements;
        if (views) {
            // A horizontal strip is expected to answer the wheel, which by default only scrolls the page
            views.addEventListener("wheel", event => {
                const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
                const before = views.scrollLeft;
                views.scrollLeft += delta;
                if (views.scrollLeft !== before) event.preventDefault();
            }, { passive: false, signal });
            views.addEventListener("scroll", () => this.renderViewHints(), { passive: true, signal });
            window.addEventListener("resize", () => this.renderViewHints(), { signal });
            elements.viewsBefore?.addEventListener("click", () => views.scrollBy({ left: -views.clientWidth * VIEW_SCROLL_SHARE, behavior: "smooth" }), { signal });
            elements.viewsAfter?.addEventListener("click", () => views.scrollBy({ left: views.clientWidth * VIEW_SCROLL_SHARE, behavior: "smooth" }), { signal });
        }
        const { viewSelect } = elements;
        viewSelect?.addEventListener("change", () => this.selectRepresentation(viewSelect.value), { signal });

        // The colours come from CSS, so a theme change on the page or in the system has to be drawn again
        this.stopWatchingTheme = watchPageTheme(() => this.applyTheme());
    }

    private scheme(): ColorScheme {
        switch (this.theme) {
            case ThemeMode.Light:
                return ColorScheme.Light;
            case ThemeMode.Dark:
                return ColorScheme.Dark;
            case ThemeMode.Auto:
                return this.detectTheme();
        }
    }

    private applyTheme(): void {
        const scheme = this.scheme();
        if (this.root.getAttribute("data-tlg-theme") === scheme) return;
        this.root.setAttribute("data-tlg-theme", scheme);
        this.redraw();
    }

    private get renderer(): Renderer {
        const found = this.renderers.find(renderer => renderer.representation === this.representation) ?? this.renderers[0];
        if (!found) {
            throw new Error(this.strings.workspace.noRenderer);
        }
        return found;
    }

    private renderContext(): RenderContext {
        return {
            store: this.store,
            palette: new Palette(this.store.catalog, elementTokenResolver(this.root)),
            icons: this.icons,
            strings: this.strings,
            time: this.time,
            representation: this.store.representationInfo(this.representation),
            options: this.preferences.choices(this.representation),
            slideHeader: this.slideHeader
        };
    }

    /**
     * The pills are built once and then only told which of them is the chosen one. Rebuilding them would
     * send the strip back to its first representation, losing the place the reader had scrolled to.
     */
    private renderViewSwitcher(): void {
        const { views, viewSelect } = this.elements;
        if (viewSelect) {
            if (viewSelect.options.length === 0) {
                viewSelect.replaceChildren(...this.renderers.map(renderer => {
                    const info = this.store.representationInfo(renderer.representation);
                    return h("option", null, { value: renderer.representation, title: info.description }, [info.label]);
                }));
            }
            const current = Array.from(viewSelect.options).find(option => option.value === this.representation);
            if (current) current.selected = true;
            return;
        }
        if (!views) return;
        if (this.viewPills.length === 0) {
            this.viewPills = this.renderers.map(renderer => {
                const info = this.store.representationInfo(renderer.representation);
                const pill = h("button", "tlg-view-pill", { type: "button", role: "tab", title: info.description }, [
                    this.icons.element(info.icon),
                    info.label
                ]);
                pill.addEventListener("click", () => this.selectRepresentation(renderer.representation));
                return pill;
            });
            views.replaceChildren(...this.viewPills);
        }
        this.renderers.forEach((renderer, index) => {
            this.viewPills[index]?.setAttribute("aria-selected", String(renderer.representation === this.representation));
        });
        this.renderViewHints();
    }

    /**
     * Shows an arrow at each end of the strip that hides views, so a cut off pill does not pass for the last.
     */
    private renderViewHints(): void {
        const { views, viewsBefore, viewsAfter } = this.elements;
        if (!views || !viewsBefore || !viewsAfter) return;
        viewsBefore.hidden = views.scrollLeft <= SCROLL_EDGE;
        viewsAfter.hidden = views.scrollLeft + views.clientWidth >= views.scrollWidth - SCROLL_EDGE;
    }

    /**
     * A chip that names the setting it holds and moves to the next one when pressed.
     */
    private cycleButton<TValue extends string>(choices: readonly RendererChoice<TValue>[], current: TValue, pressed: boolean, onPick: (value: TValue) => void): HTMLButtonElement {
        const index = Math.max(0, choices.findIndex(choice => choice.value === current));
        const node = h("button", "tlg-chip-toggle", { type: "button", "aria-pressed": String(pressed) }, [choices[index]?.label ?? current]);
        node.addEventListener("click", () => {
            const next = choices[(index + 1) % choices.length];
            if (next) onPick(next.value);
        });
        return node;
    }

    private renderFilters(): void {
        const filters = this.store.filters;
        const audience = this.cycleButton(audienceChoices(this.strings, this.store.catalog), filters.audience, filters.audience !== Audience.Both, value => this.applyFilters({ audience: value }));
        const milestones = h("button", "tlg-chip-toggle", { type: "button", "aria-pressed": String(filters.milestonesOnly) }, [this.strings.workspace.milestonesOnly]);
        milestones.addEventListener("click", () => this.applyFilters({ milestonesOnly: !this.store.filters.milestonesOnly }));
        this.elements.filters.replaceChildren(audience, milestones);
        this.renderSettings();
    }

    private applyFilters(filters: Partial<StepFilters>): void {
        this.store.setFilters(filters);
        this.renderFilters();
    }

    private chosenValue(option: RendererOption, chosen: ReadonlyMap<string, string>): string {
        return option.choices.find(choice => choice.value === chosen.get(option.id))?.value ?? option.fallback;
    }

    /**
     * Every setting of the representation on screen, described, in the panel behind the settings button.
     * The filters every view shares come first, in the words of this view. The panel is rebuilt on each
     * change, so the control that had the focus is found again by its key.
     */
    private renderSettings(): void {
        const panel = this.elements.settingsPanel;
        const words = this.strings.workspace;
        const filters = this.store.filters;
        const described = this.renderer.filters(this.strings);
        const chosen = this.preferences.choices(this.representation);
        const focused = document.activeElement instanceof HTMLElement && panel.contains(document.activeElement)
            ? document.activeElement.getAttribute(CONTROL_KEY)
            : null;

        const audienceChanged = filters.audience !== Audience.Both;
        const settings = this.renderer.options(this.strings);
        const changed = settings.filter(setting => this.differsFromDefault(setting, chosen));
        const shared = [
            this.settingSection(AUDIENCE_CONTROL, words.audience, described.audience, this.choiceGroup(AUDIENCE_CONTROL, words.audience, audienceChoices(this.strings, this.store.catalog), filters.audience,
                value => this.applyFilters({ audience: value })), audienceChanged ? () => this.applyFilters({ audience: Audience.Both }) : null),
            this.settingSection(MILESTONES_CONTROL, words.milestones, described.milestones, this.choiceGroup(MILESTONES_CONTROL, words.milestones, milestoneChoices(this.strings),
                filters.milestonesOnly ? MilestoneChoice.Only : MilestoneChoice.Every, value => this.applyFilters({ milestonesOnly: value === MilestoneChoice.Only })),
            filters.milestonesOnly ? () => this.applyFilters({ milestonesOnly: false }) : null)
        ];
        const own = settings.map(setting => this.settingSection(setting.id, setting.label, setting.description ?? null, setting.kind === OptionKind.List
            ? this.listSetting(setting, chosen.get(setting.id))
            : this.choiceGroup(setting.id, setting.label, setting.choices, this.chosenValue(setting, chosen), value => this.setOption(this.representation, setting.id, value)),
        changed.includes(setting) ? () => this.resetOption(setting.id) : null));
        const untouched = changed.length === 0 && !audienceChanged && !filters.milestonesOnly;
        const reset = button(this.icons, words.resetView, "tlg-button tlg-button-quiet", () => this.resetView(), Icon.Undo);
        reset.setAttribute(CONTROL_KEY, RESET_CONTROL);
        reset.disabled = untouched;
        panel.replaceChildren(...shared, ...own, h("div", "tlg-view-settings-foot", {}, [reset]));

        if (focused !== null) {
            Array.from(panel.querySelectorAll<HTMLElement>(`[${CONTROL_KEY}]`)).find(control => control.getAttribute(CONTROL_KEY) === focused)?.focus();
        }
    }

    /**
     * Puts the view on screen back as it first came: its own settings, columns and their names included,
     * and the filters it shares with every other view.
     */
    private resetView(): void {
        this.preferences.clearChoices(this.representation);
        this.store.setFilters({ audience: Audience.Both, milestonesOnly: false });
        this.pageIndex = 0;
        this.renderFilters();
        this.redraw();
    }

    /** Whether a setting holds something else than it would with nothing chosen. */
    private differsFromDefault(setting: RendererSetting, chosen: ReadonlyMap<string, string>): boolean {
        if (setting.kind === OptionKind.List) {
            const stored = chosen.get(setting.id);
            return stored !== undefined && serializeOptionList(parseOptionList(stored, setting)) !== serializeOptionList(parseOptionList(undefined, setting));
        }
        return this.chosenValue(setting, chosen) !== setting.fallback;
    }

    private resetOption(optionId: string): void {
        this.preferences.clearChoice(this.representation, optionId);
        this.pageIndex = 0;
        this.renderFilters();
        this.redraw();
    }

    /**
     * A setting under its heading. The heading carries a reset for as long as the setting is off its
     * default, so putting one back never means resetting the others with it.
     */
    private settingSection(key: string, label: string, description: string | null, body: HTMLElement, reset: (() => void) | null): HTMLElement {
        const undo = reset ? button(this.icons, "", "tlg-button tlg-button-icon tlg-button-quiet", reset, Icon.Undo) : null;
        if (undo) {
            const name = this.strings.workspace.resetSetting(label);
            undo.setAttribute("aria-label", name);
            undo.title = name;
            undo.setAttribute(CONTROL_KEY, `${key}:${RESET_CONTROL}`);
        }
        return h("section", "tlg-view-setting", {}, [
            h("div", "tlg-view-setting-head", {}, [h("h3", "tlg-view-setting-label", {}, [label]), undo]),
            description ? h("p", "tlg-view-setting-hint", {}, [description]) : null,
            body
        ]);
    }

    private choiceGroup<TValue extends string>(key: string, label: string, choices: readonly RendererChoice<TValue>[], current: string, onPick: (value: TValue) => void): HTMLElement {
        return h("div", "tlg-view-setting-choices", { role: "radiogroup", "aria-label": label }, choices.map(choice => {
            const node = h("button", "tlg-chip-toggle", {
                type: "button", role: "radio", "aria-checked": String(choice.value === current), [CONTROL_KEY]: `${key}:${choice.value}`
            }, [choice.label]);
            node.addEventListener("click", () => onPick(choice.value));
            return node;
        }));
    }

    /**
     * The chosen entries first, in their order and with arrows to move them, then the others to tick.
     */
    private listSetting(option: RendererListOption, stored: string | undefined): HTMLElement {
        const words = this.strings.workspace;
        const context = this.renderContext();
        const selected = parseOptionList(stored, option);
        const save = (entries: readonly ListEntry[]): void => this.setOption(this.representation, option.id, serializeOptionList(entries));
        const unselected = option.choices.filter(choice => !selected.some(entry => entry.value === choice.value));
        const order: ListEntry[] = [...selected, ...unselected.map(choice => ({ value: choice.value, label: null }))];

        return h("ol", "tlg-view-setting-list", { "aria-label": option.label }, order.map(entry => {
            const { value } = entry;
            const label = option.choices.find(choice => choice.value === value)?.label ?? value;
            const index = selected.findIndex(chosen => chosen.value === value);
            const others = selected.filter(chosen => chosen.value !== value);
            const move = (offset: number): void => {
                const next = [...others];
                next.splice(index + offset, 0, entry);
                save(next);
            };

            const box = h("input", null, { type: "checkbox", [CONTROL_KEY]: `${option.id}:${value}:pick` });
            box.checked = index >= 0;
            // A table needs at least one column, so the last one cannot be taken away
            box.disabled = index >= 0 && selected.length === 1;
            box.addEventListener("change", () => save(box.checked ? [...selected, entry] : others));

            const up = button(this.icons, "", "tlg-button tlg-button-icon tlg-button-quiet", () => move(-1), Icon.ChevronUp);
            const down = button(this.icons, "", "tlg-button tlg-button-icon tlg-button-quiet", () => move(1), Icon.ChevronDown);
            up.setAttribute("aria-label", words.moveUp(label));
            down.setAttribute("aria-label", words.moveDown(label));
            up.setAttribute(CONTROL_KEY, `${option.id}:${value}:up`);
            down.setAttribute(CONTROL_KEY, `${option.id}:${value}:down`);
            up.disabled = index <= 0;
            down.disabled = index < 0 || index === selected.length - 1;

            if (index >= 0 && option.renamable === true) {
                // A chosen entry is named in place, and giving it back its own name clears the rename
                box.setAttribute("aria-label", label);
                const name = h("input", "tlg-input tlg-view-setting-name", {
                    type: "text", placeholder: label, maxlength: String(LIST_LABEL_LENGTH), "aria-label": words.rename(label), [CONTROL_KEY]: `${option.id}:${value}:name`
                });
                name.value = entry.label ?? label;
                name.addEventListener("change", () => {
                    const renamed = cleanListLabel(name.value);
                    const next = [...selected];
                    next[index] = { value, label: renamed === label ? null : renamed };
                    save(next);
                });
                return h("li", "tlg-view-setting-item", {}, [h("div", "tlg-view-setting-row", {}, [box, name, up, down])]);
            }

            // Only an entry still to be added needs showing what it holds; a chosen one is on the slide
            const example = index < 0 ? option.example?.(context, value) ?? null : null;
            const check = h("label", "tlg-view-setting-check", {}, [
                box,
                h("span", "tlg-view-setting-choice", {}, [label]),
                example === null ? null : h("span", "tlg-view-setting-example", { title: example }, [example])
            ]);
            return h("li", "tlg-view-setting-item", {}, [h("div", "tlg-view-setting-row", {}, [check, up, down])]);
        }));
    }

    private renderHistoryButtons(): void {
        const { undo, redo } = this.elements;
        if (undo) {
            undo.disabled = !this.history.canUndo;
            undo.title = this.history.undoLabel ? this.strings.workspace.undoChange(this.history.undoLabel) : this.strings.workspace.nothingToUndo;
        }
        if (redo) {
            redo.disabled = !this.history.canRedo;
            redo.title = this.history.redoLabel ? this.strings.workspace.redoChange(this.history.redoLabel) : this.strings.workspace.nothingToRedo;
        }
    }

    select(selection: Selection | null): void {
        this.store.setSelection(selection);
    }

    get summary(): DiagramSummary {
        return this.store.summary;
    }

    get state(): TimelineState {
        return {
            representation: this.representation,
            pageIndex: this.pageIndex,
            pageCount: this.pageCount,
            filters: this.store.filters,
            options: this.preferences.choices(this.representation),
            selection: this.store.selection
        };
    }

    setPage(pageIndex: number): void {
        const wanted = Math.min(Math.max(Math.trunc(pageIndex), 0), Math.max(0, this.pageCount - 1));
        if (wanted === this.pageIndex) return;
        this.pageIndex = wanted;
        // A page turned by hand is the reader's choice, and the selection must stop pulling them back
        this.followedSelection = this.selectionKey();
        this.redraw();
    }

    setFilters(filters: Partial<StepFilters>): void {
        this.store.setFilters(filters);
        this.pageIndex = 0;
        this.renderFilters();
        this.redraw();
    }

    setOption(representation: RepresentationKey, optionId: string, value: string): void {
        this.preferences.setChoice(representation, optionId, value);
        if (representation !== this.representation) return;
        this.pageIndex = 0;
        this.renderFilters();
        this.redraw();
    }

    selectRepresentation(representation: RepresentationKey): void {
        if (!this.renderers.some(renderer => renderer.representation === representation)) return;
        this.representation = representation;
        // A different view paginates differently, so the selection is worth chasing again
        this.followedSelection = null;
        this.pageIndex = 0;
        this.preferences.setRepresentation(representation);
        this.renderViewSwitcher();
        this.renderFilters();
        this.viewport.fit();
        this.redraw();
    }

    setTheme(mode: ThemeMode): void {
        this.theme = mode;
        this.preferences.setTheme(mode);

        const button = this.elements.themeButton;
        if (button) {
            const choice = themeChoices(this.strings)[mode];
            button.replaceChildren(this.icons.element(choice.icon));
            button.title = choice.label;
            button.setAttribute("aria-label", choice.label);
        }
        this.applyTheme();
    }

    /**
     * Selects the record a click landed on, or clears the selection when it landed on empty canvas.
     */
    private selectAt(target: Element | null): void {
        for (const type of [RecordType.Step, RecordType.Node, RecordType.Link]) {
            const hit = target?.closest(`[${RECORD_ATTRIBUTES[type]}]`);
            if (hit) {
                this.store.setSelection({ type, id: Number(hit.getAttribute(RECORD_ATTRIBUTES[type])) });
                return;
            }
        }
        if (this.store.selection) {
            this.store.setSelection(null);
        }
    }

    /**
     * Outlines whatever stands for the selected record on the slide on screen. Exports draw their own
     * pages, so the outline never ends up in a file.
     */
    private markSelection(): void {
        const selection = this.store.selection;
        if (!selection) return;
        this.viewport.svg.querySelectorAll(`[${RECORD_ATTRIBUTES[selection.type]}="${selection.id}"]`)
            .forEach(element => element.classList.add("is-selected"));
        this.lightConnections(this.selectedNode());
    }

    private selectedNode(): RecordId | null {
        const selection = this.store.selection;
        return selection?.type === RecordType.Node ? selection.id : null;
    }

    /**
     * The record the pointer is over answers for as long as it is there, and the selected record answers
     * the rest of the time, so pointing at one record never leaves the light on another.
     */
    private followPointer(target: EventTarget | null): void {
        const hit = target instanceof Element ? target.closest("[data-node-id]") : null;
        const id = hit === null ? this.selectedNode() : Number(hit.getAttribute("data-node-id"));
        if (id === this.lit) return;
        this.lightConnections(id);
    }

    /**
     * A representation that draws the connections of a record names both ends of each line and says where
     * the light starts. The lines touching that record are then lit from it.
     */
    private lightConnections(id: RecordId | null): void {
        this.lit = id;
        this.viewport.svg.querySelectorAll(".tlg-edge.is-linked").forEach(edge => edge.classList.remove("is-linked"));
        if (id === null) return;

        const origin = this.viewport.svg.querySelector(`[data-node-id="${id}"] .tlg-glow-origin`);
        const x = origin?.getAttribute("cx");
        const y = origin?.getAttribute("cy");
        if (x === null || x === undefined || y === null || y === undefined) return;

        this.viewport.glowFrom({ x: Number(x), y: Number(y) });
        this.viewport.svg
            .querySelectorAll(`[data-from-id="${id}"], [data-to-id="${id}"]`)
            .forEach(edge => edge.classList.add("is-linked"));
    }

    redraw(): void {
        if (!this.store.isLoaded) return;

        this.elements.empty.hidden = !this.store.isEmpty;
        this.canvas = this.canvasMode === CanvasMode.Slides ? this.slideSize : this.wholeScene();

        withPageSize(this.canvas, () => {
            const pages = this.renderer.paginate(this.renderContext());
            this.followSelection(pages);
            this.pageIndex = Math.min(Math.max(this.pageIndex, 0), pages.count - 1);
            this.viewport.allowDrag = this.renderer.draggable && this.permissions.canMove;

            const info = this.store.representationInfo(this.representation);
            this.viewport.setPageSize(this.canvas);
            this.viewport.setContent(pages.draw(this.pageIndex), `${info.label} of ${this.store.incident.title}`);
            this.markSelection();
            this.renderCaption();
            this.renderPager(pages.count);
            this.pageCount = pages.count;
        });
        this.onStateChange?.(this.state);
    }

    /**
     * A page tall enough to hold the whole representation in one run. Found by growing the page until the
     * renderer stops splitting, using nothing but the contract every renderer already keeps.
     */
    private wholeScene(): PageSize {
        let size = this.slideSize;
        for (let attempt = 0; attempt < CANVAS_GROWTH_TRIES; attempt += 1) {
            const count = withPageSize(size, () => this.renderer.paginate(this.renderContext()).count);
            if (count === 1) return size;
            size = { width: size.width, height: Math.min(size.height * Math.min(count, CANVAS_GROWTH_STEP), CANVAS_MAX_HEIGHT) };
            if (size.height >= CANVAS_MAX_HEIGHT) break;
        }
        return size;
    }

    /**
     * Takes the analyst to the slide a newly picked record is on. It fires once per selection: after that
     * the pager is theirs, so turning the page with something selected sticks instead of being pulled back.
     */
    private selectionKey(): string | null {
        const selection = this.store.selection;
        return selection ? `${selection.type}:${selection.id}` : null;
    }

    private followSelection(pages: Pagination): void {
        const selection = this.store.selection;
        const key = this.selectionKey();
        if (!selection || !key) {
            this.followedSelection = null;
            return;
        }
        if (this.followedSelection === key || pages.count < 2) return;
        this.followedSelection = key;

        const selector = `[${RECORD_ATTRIBUTES[selection.type]}="${selection.id}"]`;
        for (let index = 0; index < pages.count; index += 1) {
            if (pages.draw(index).querySelector(selector)) {
                this.pageIndex = index;
                return;
            }
        }
    }

    private renderCaption(): void {
        const hidden = this.store.steps.length - this.store.visibleSteps().length;
        const parts = [this.store.representationInfo(this.representation).description];
        if (hidden > 0) {
            parts.push(`${hidden} step(s) hidden by the current filter`);
        }

        // Picking an audience on a diagram where every step is written for both changes nothing, which
        // looks like a broken control unless the diagram says why
        const audience = this.store.filters.audience;
        if (audience !== Audience.Both && hidden === 0 && this.store.steps.length > 0) {
            parts.push(`no step is marked ${audience.toLowerCase()} only`);
        }
        this.elements.caption.textContent = parts.join("   |   ");
    }

    private renderPager(pageCount: number): void {
        if (pageCount <= 1) {
            this.elements.pager.replaceChildren();
            return;
        }

        const turn = (icon: Icon, label: string, disabled: boolean, step: number): HTMLButtonElement => {
            const node = h("button", "tlg-button tlg-button-icon", { type: "button", "aria-label": label }, [this.icons.element(icon)]);
            node.disabled = disabled;
            node.addEventListener("click", () => {
                this.pageIndex += step;
                this.redraw();
            });
            return node;
        };

        this.elements.pager.replaceChildren(
            turn(Icon.ChevronLeft, this.strings.workspace.previousSlide, this.pageIndex === 0, -1),
            h("span", null, {}, [this.strings.workspace.slideCounter(this.pageIndex + 1, pageCount)]),
            turn(Icon.ChevronRight, this.strings.workspace.nextSlide, this.pageIndex === pageCount - 1, 1)
        );
    }

    /**
     * Shows the edit at once, records how to take it back, and saves it.
     */
    private edit(id: RecordId, edit: RecordEdit): void {
        if (!this.permissions.canEdit) return;

        const previous = this.applyEdit(id, edit);
        if (!previous) return;

        this.history.push({
            label: labelFor(this.strings, edit.type),
            undo: history => { this.applyEdit(history.resolve(edit.type, id), previous); },
            redo: history => { this.applyEdit(history.resolve(edit.type, id), edit); }
        });
    }

    private applyEdit(id: RecordId, edit: RecordEdit): RecordEdit | null {
        let previous: RecordEdit | null = null;
        let saving: Promise<void>;

        switch (edit.type) {
            case RecordType.Node: {
                const patch = this.store.patchNode(id, edit.patch);
                if (!patch) return null;
                previous = { type: edit.type, patch };
                saving = this.api.updateNode(this.incidentId, id, edit.patch);
                break;
            }
            case RecordType.Step: {
                const patch = this.store.patchStep(id, edit.patch);
                if (!patch) return null;
                previous = { type: edit.type, patch };
                saving = this.api.updateStep(this.incidentId, id, edit.patch);
                break;
            }
            case RecordType.Link: {
                const patch = this.store.patchLink(id, edit.patch);
                if (!patch) return null;
                previous = { type: edit.type, patch };
                saving = this.api.updateLink(this.incidentId, id, edit.patch);
                break;
            }
        }

        saving.catch(() => {
            this.notify(this.strings.workspace.saveFailed);
            void this.reload();
        });
        return previous;
    }

    private async post(draft: RecordDraft): Promise<RecordId> {
        switch (draft.type) {
            case RecordType.Node:
                return (await this.api.createNode(this.incidentId, draft.input)).id;
            case RecordType.Step:
                return (await this.api.createStep(this.incidentId, draft.input)).id;
            case RecordType.Link:
                return (await this.api.createLink(this.incidentId, draft.input)).id;
        }
    }

    private deleteRemote(type: RecordType, id: RecordId): Promise<void> {
        switch (type) {
            case RecordType.Node:
                return this.api.deleteNode(this.incidentId, id);
            case RecordType.Step:
                return this.api.deleteStep(this.incidentId, id);
            case RecordType.Link:
                return this.api.deleteLink(this.incidentId, id);
        }
    }

    private async create(draft: RecordDraft): Promise<RecordId | null> {
        if (!this.permissions.canCreate) return null;

        try {
            const createdId = await this.post(draft);
            await this.reload();

            const entry: HistoryEntry = {
                label: labelFor(this.strings, draft.type),
                undo: async history => {
                    await this.deleteRemote(draft.type, history.resolve(draft.type, createdId));
                    await this.reload();
                },
                redo: async history => {
                    const againId = await this.post(remapDraft(draft, history));
                    history.rename(draft.type, history.resolve(draft.type, createdId), againId);
                    await this.reload();
                }
            };
            this.history.push(entry);
            return createdId;
        } catch {
            this.notify(this.strings.workspace.createFailed);
            return null;
        }
    }

    /**
     * Deleting captures enough of the record, and of everything hanging off it, to put it all back.
     */
    private async remove(type: RecordType, id: RecordId): Promise<void> {
        if (!this.permissions.canDelete) return;

        const captured = this.capture(type, id);
        if (!captured) return;

        try {
            await this.deleteRemote(type, id);
            this.store.setSelection(null);
            await this.reload();

            this.history.push({
                label: labelFor(this.strings, type),
                undo: async history => {
                    await this.restore(captured, history);
                    await this.reload();
                },
                redo: async history => {
                    await this.deleteRemote(type, history.resolve(type, captured.id));
                    await this.reload();
                }
            });
        } catch {
            this.notify(this.strings.workspace.deleteFailed);
        }
    }

    private capture(type: RecordType, id: RecordId): Captured | null {
        const { store } = this;
        switch (type) {
            case RecordType.Node: {
                const node = store.node(id);
                if (!node) return null;
                return {
                    draft: { type, input: nodeFieldsOf(node) },
                    id,
                    links: store.links.filter(link => link.sourceNodeId === id || link.targetNodeId === id).map(linkFieldsOf),
                    references: store.steps
                        .filter(step => step.sourceNodeId === id || step.targetNodeId === id)
                        .map(step => ({ stepId: step.id, asSource: step.sourceNodeId === id, asTarget: step.targetNodeId === id }))
                };
            }
            case RecordType.Step: {
                const step = store.step(id);
                if (!step) return null;
                return {
                    draft: { type, input: stepFieldsOf(withoutMoments(step)) },
                    id,
                    links: store.links.filter(link => link.stepId === id).map(linkFieldsOf),
                    references: []
                };
            }
            case RecordType.Link: {
                const link = store.link(id);
                if (!link) return null;
                return { draft: { type, input: linkFieldsOf(link) }, id, links: [], references: [] };
            }
        }
    }

    private async restore(captured: Captured, history: History): Promise<void> {
        const createdId = await this.post(remapDraft(captured.draft, history));
        history.rename(captured.draft.type, captured.id, createdId);

        for (const link of captured.links) {
            await this.api.createLink(this.incidentId, remapLink(link, history));
        }
        for (const reference of captured.references) {
            await this.api.updateStep(this.incidentId, history.resolve(RecordType.Step, reference.stepId), {
                ...(reference.asSource ? { sourceNodeId: createdId } : {}),
                ...(reference.asTarget ? { targetNodeId: createdId } : {})
            });
        }
    }

    private async undo(): Promise<void> {
        try {
            const label = await this.history.undo();
            if (label) this.notify(this.strings.workspace.undone(label));
        } catch {
            this.notify(this.strings.workspace.undoExpired);
            await this.reload();
        }
    }

    private async redo(): Promise<void> {
        try {
            const label = await this.history.redo();
            if (label) this.notify(this.strings.workspace.redone(label));
        } catch {
            this.notify(this.strings.workspace.redoExpired);
            await this.reload();
        }
    }

    private async pinNode(nodeId: RecordId, position: Point): Promise<void> {
        this.store.setPlacement(nodeId, this.representation, position);
        try {
            await this.api.saveLayout(this.incidentId, [{ nodeId, representation: this.representation, x: position.x, y: position.y }]);
        } catch {
            this.notify(this.strings.workspace.placementFailed);
        }
    }

    async reload(): Promise<void> {
        const selection = this.store.selection;
        this.store.load(await this.api.getDiagram(this.incidentId));
        if (selection) {
            this.store.setSelection(selection);
        }
    }

    /**
     * Reads a timeline written elsewhere into the incident on screen. The records are added to what is
     * already here rather than replacing it, and a record the file names again is recognised, so opening
     * the same file twice does not draw everything twice.
     */
    private async importChosenFile(): Promise<void> {
        const picker = this.elements.importPicker;
        const file = picker.files?.[0];
        // Cleared before the work, so choosing the same file again still counts as a change
        picker.value = "";
        if (!file || !this.permissions.canCreate) return;

        try {
            const report = await this.api.importDocument(JSON.parse(await file.text()), { into: this.incidentId });
            await this.reload();
            this.redraw();
            this.notify(this.strings.workspace.imported(report.created.nodes, report.created.steps));
        } catch {
            this.notify(this.strings.workspace.importFailed);
        }
    }

    async exportAs(format: ExportFormat): Promise<void> {
        if (!this.store.isLoaded) return;

        if (format === ExportFormat.Document) {
            try {
                await exportDocumentFile(await this.api.exportDocument(this.incidentId), this.store.incident.title);
            } catch {
                this.notify(this.strings.workspace.exportFailed);
            }
            return;
        }

        if (format === ExportFormat.Xlsx || format === ExportFormat.Csv || format === ExportFormat.Markdown || format === ExportFormat.Clipboard) {
            await this.exportTable(format);
            return;
        }

        const context = this.renderContext();
        const pages = this.renderer.paginate(context);
        const drawn = Array.from({ length: pages.count }, (_, index) => pages.draw(index));
        const title = `${this.store.incident.title} - ${context.representation.label}`;

        try {
            switch (format) {
                case ExportFormat.Png:
                    await exportPng(drawn, title, context.palette.surface);
                    break;
                case ExportFormat.Svg:
                    await exportSvg(drawn, title);
                    break;
                case ExportFormat.Html:
                    await exportHtml(drawn, title, title, this.strings.deck, this.time.locale);
                    break;
                case ExportFormat.Print:
                    await printPages(drawn, title);
                    break;
            }
        } catch {
            this.notify(this.strings.workspace.exportFailed);
        }
    }

    /**
     * The table uses the columns chosen for the narrative, whichever view is on screen, so what was
     * arranged there is what lands in the file.
     */
    private async exportTable(format: ExportFormat.Xlsx | ExportFormat.Csv | ExportFormat.Markdown | ExportFormat.Clipboard): Promise<void> {
        const option = tableColumnsOption(this.strings);
        const columns = parseOptionList(this.preferences.choices(Representation.Narrative).get(option.id), option);
        const table = timelineTable(this.store, this.time, this.strings, columns);
        const name = this.store.incident.title;
        try {
            switch (format) {
                case ExportFormat.Xlsx:
                    await exportXlsx(table, name, this.strings.table.sheet);
                    break;
                case ExportFormat.Csv:
                    await exportCsv(table, name);
                    break;
                case ExportFormat.Markdown:
                    await exportMarkdown(table, name);
                    break;
                case ExportFormat.Clipboard:
                    await copyTable(table);
                    this.notify(this.strings.workspace.copied);
                    break;
            }
        } catch {
            this.notify(this.strings.workspace.exportFailed);
        }
    }

    private notify(message: string): void {
        if (this.onNotify) {
            this.onNotify(message);
            return;
        }
        this.root.querySelector(".tlg-toast")?.remove();
        const toast = h("div", "tlg-toast", { role: "status" }, [message]);
        this.elements.stage.append(toast);
        window.setTimeout(() => toast.remove(), TOAST_MS);
    }

    destroy(): void {
        this.lifetime.abort();
        this.stopWatchingTheme();
        this.root.replaceChildren();
        this.root.classList.remove("tlg");
        this.root.removeAttribute("data-tlg-theme");
    }
}

/**
 * Keeps an open menu inside the window: as tall as the room under it, scrolling past that, and pushed
 * back in when its left edge would leave the screen. The list is placed by CSS first, then measured.
 */
function fitMenu(menu: HTMLDetailsElement): void {
    const list = menu.querySelector<HTMLElement>(".tlg-menu-list");
    if (!list || !menu.open) return;
    list.style.maxHeight = "";
    list.style.transform = "";
    const box = list.getBoundingClientRect();
    list.style.maxHeight = `${Math.max(MENU_MIN_HEIGHT, window.innerHeight - box.top - VIEWPORT_MARGIN)}px`;
    const spill = VIEWPORT_MARGIN - box.left;
    if (spill > 0) list.style.transform = `translateX(${spill}px)`;
}

function withoutMoments(step: TimelineStep): Omit<TimelineStep, "at" | "until"> {
    const { at, until, ...rest } = step;
    return rest;
}

/**
 * Builds the workspace inside the element and loads the incident. The element should have a height,
 * for example through the --tlg-height custom property; everything else is drawn by the workspace.
 */
export async function mountTimeline(element: HTMLElement, options: TimelineOptions): Promise<TimelineHandle> {
    const workspace = new Workspace(element, options);
    await workspace.start();
    return workspace;
}
