// Wires the workspace together: load the diagram once, keep it in the store, and redraw the chosen
// representation whenever the records, the filters or the theme change.
//
// Edits are applied here first and saved behind them. That is what lets an open form keep its scroll
// position and its half typed fields while the drawing updates.

import { Audience, RecordType, Representation } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import { linkFieldsOf, nodeFieldsOf, stepFieldsOf } from "../core/mapping.js";
import type { LinkCreateInput, RecordId, StepInvolvement } from "../core/models.js";
import type { TimelineApi } from "../core/service.js";
import type { KeyValueStorage } from "../storage/browser-storage-store.js";
import { DiagramStore, StoreChange, type Selection, type TimelineStep } from "./diagram-store.js";
import { h } from "./dom.js";
import { ExportFormat, exportHtml, exportPng, exportSvg, printPages } from "./export.js";
import { History, type HistoryEntry } from "./history.js";
import { IconSet } from "./icons/icon-set.js";
import { Inspector } from "./inspector.js";
import type { RecordDraft, RecordEdit, TimelinePermissions, WorkspaceActions } from "./panels.js";
import { Preferences, defaultPreferenceStorage } from "./preferences.js";
import { Rail } from "./rail.js";
import { BUILT_IN_RENDERERS } from "./renderers/index.js";
import type { Pagination, RenderContext, Renderer, RendererChoice } from "./renderers/registry.js";
import { Palette, elementTokenResolver } from "./theme.js";
import type { SlideHeaderCustomizer } from "./slide-header.js";
import { ColorScheme, detectPageTheme, watchPageTheme, type ThemeDetector } from "./theme-detection.js";
import { ThemeMode } from "./theme-mode.js";
import { Viewport, type Point } from "./viewport.js";

export { ThemeMode };

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
}

export interface TimelineHandle {
    reload(): Promise<void>;
    redraw(): void;
    setTheme(mode: ThemeMode): void;
    selectRepresentation(representation: Representation): void;
    /** Selects a record and opens its details, or clears the selection when given null. */
    select(selection: Selection | null): void;
    exportAs(format: ExportFormat): Promise<void>;
    destroy(): void;
}

const DEFAULT_PREFERENCE_KEY = "cyber-incidents-timeline";
const TOAST_MS = 4000;
const AUDIENCE_CHOICES: readonly RendererChoice<Audience>[] = [
    { value: Audience.Both, label: "Everything" },
    { value: Audience.Executive, label: "Executive" },
    { value: Audience.Technical, label: "Technical" }
];
const EXPORTS: readonly { format: ExportFormat; label: string; icon: Icon }[] = [
    { format: ExportFormat.Png, label: "PNG, one file per slide", icon: Icon.Image },
    { format: ExportFormat.Svg, label: "SVG, one file per slide", icon: Icon.Vector },
    { format: ExportFormat.Html, label: "Interactive HTML", icon: Icon.Code },
    { format: ExportFormat.Print, label: "Print or save as PDF", icon: Icon.Print }
];
interface ThemeChoice {
    label: string;
    icon: Icon;
    next: ThemeMode;
}

const THEME_CHOICES: Readonly<Record<ThemeMode, ThemeChoice>> = {
    [ThemeMode.Auto]: { label: "Theme follows the page, switch to light", icon: Icon.Auto, next: ThemeMode.Light },
    [ThemeMode.Light]: { label: "Light theme, switch to dark", icon: Icon.Sun, next: ThemeMode.Dark },
    [ThemeMode.Dark]: { label: "Dark theme, switch to following the page", icon: Icon.Moon, next: ThemeMode.Auto }
};

const RECORD_ATTRIBUTES: Readonly<Record<RecordType, string>> = {
    [RecordType.Node]: "data-node-id",
    [RecordType.Step]: "data-step-id",
    [RecordType.Link]: "data-link-id"
};

function labelFor(type: RecordType): string {
    return type === RecordType.Node ? "record" : type;
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
    views: HTMLElement;
    filters: HTMLElement;
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
    exportMenu: HTMLDetailsElement;
    themeButton: HTMLButtonElement | null;
    stage: HTMLElement;
}

class Workspace implements TimelineHandle {
    private readonly root: HTMLElement;
    private readonly api: TimelineApi;
    private readonly incidentId: RecordId;
    private readonly permissions: TimelinePermissions;
    private readonly renderers: readonly Renderer[];
    private readonly icons: IconSet;
    private readonly preferences: Preferences;
    private readonly onNotify: ((message: string) => void) | null;
    private readonly slideHeader: SlideHeaderCustomizer | null;
    private readonly detectTheme: ThemeDetector;
    private stopWatchingTheme: () => void = () => undefined;
    private readonly store = new DiagramStore();
    private readonly history: History;
    private readonly lifetime = new AbortController();
    private readonly elements: Elements;
    private readonly viewport: Viewport;
    private readonly rail: Rail;
    private readonly inspector: Inspector;
    private representation: Representation;
    private theme: ThemeMode;
    private pageIndex = 0;
    private followedSelection: string | null = null;

    constructor(root: HTMLElement, options: TimelineOptions) {
        this.root = root;
        this.api = options.api;
        this.incidentId = options.incidentId;
        this.permissions = { canCreate: true, canEdit: true, canDelete: true, ...options.permissions };
        this.renderers = options.renderers ?? BUILT_IN_RENDERERS;
        this.icons = options.icons ?? new IconSet();
        this.onNotify = options.onNotify ?? null;
        this.slideHeader = options.slideHeader ?? null;
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
        const panelContext = { store: this.store, actions, permissions: this.permissions, icons: this.icons, signal };
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

        const undo = this.permissions.canEdit ? iconButton(Icon.Undo, "Nothing to undo", true) : null;
        const redo = this.permissions.canEdit ? iconButton(Icon.Redo, "Nothing to redo", true) : null;
        const zoomOut = iconButton(Icon.ZoomOut, "Zoom out");
        const zoomFit = iconButton(Icon.Fit, "Fit to screen");
        const zoomIn = iconButton(Icon.ZoomIn, "Zoom in");
        const themeButton = themeToggle ? iconButton(THEME_CHOICES[this.theme].icon, THEME_CHOICES[this.theme].label) : null;

        const exportMenu = h("details", "tlg-menu", {}, [
            h("summary", "tlg-button", {}, [icons.element(Icon.Download), "Export"]),
            h("div", "tlg-menu-list", { role: "menu" }, EXPORTS.map(entry => h("button", "tlg-menu-item", { type: "button", role: "menuitem", "data-export": entry.format }, [icons.element(entry.icon), entry.label])))
        ]);

        const views = h("div", "tlg-views", { role: "tablist", "aria-label": "Representations" });
        const filters = h("div", "tlg-filters");
        const search = h("input", "tlg-input", { type: "search", placeholder: "Filter records", "aria-label": "Filter records" });
        const addButton = this.permissions.canCreate
            ? h("button", "tlg-button tlg-button-primary tlg-add", { type: "button", "aria-haspopup": "true", "aria-expanded": "false" }, [icons.element(Icon.Plus), "Add"])
            : null;
        const list = h("div", "tlg-rail-list");
        const stats = h("div", "tlg-rail-foot");
        const canvas = h("div", "tlg-canvas");
        const caption = h("div", "tlg-caption");
        const pager = h("div", "tlg-pager");
        const emptyAdd = this.permissions.canCreate ? h("button", "tlg-button tlg-button-primary", { type: "button" }, [icons.element(Icon.Plus), "Add the first record"]) : null;
        const empty = h("div", "tlg-empty", {}, [
            icons.element(Icon.Graph),
            h("p", "tlg-empty-title", {}, ["No incident diagram yet"]),
            h("p", "tlg-empty-hint", {}, ["Add the parties, the machines they touched and what happened, and every view builds itself."]),
            emptyAdd
        ]);
        empty.hidden = true;
        const stage = h("main", "tlg-stage", {}, [canvas, h("div", "tlg-stage-foot", {}, [caption, pager]), empty]);
        const inspector = h("aside", "tlg-inspector", { "aria-label": "Record details" });
        inspector.hidden = true;
        const addMenu = h("div", "tlg-addmenu", { role: "menu" });
        addMenu.hidden = true;

        this.root.classList.add("tlg");
        this.root.setAttribute("data-tlg-theme", this.scheme());
        this.root.replaceChildren(
            h("div", "tlg-toolbar", {}, [
                views,
                h("div", "tlg-actions", {}, [
                    filters,
                    undo && redo ? h("div", "tlg-button-group", {}, [undo, redo]) : null,
                    h("div", "tlg-button-group", {}, [zoomOut, zoomFit, zoomIn]),
                    themeButton,
                    exportMenu
                ])
            ]),
            h("div", "tlg-body", {}, [
                h("aside", "tlg-rail", { "aria-label": "Records" }, [h("div", "tlg-rail-head", {}, [search, addButton]), list, stats]),
                stage,
                inspector
            ]),
            addMenu
        );

        return { views, filters, canvas, caption, pager, empty, emptyAdd, list, search, stats, addButton, addMenu, inspector, undo, redo, zoomIn, zoomOut, zoomFit, exportMenu, themeButton, stage };
    }

    async start(): Promise<void> {
        try {
            this.store.load(await this.api.getDiagram(this.incidentId));
        } catch (error) {
            this.notify("The incident diagram could not be loaded.");
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

        elements.zoomIn.addEventListener("click", () => this.viewport.zoomIn(), { signal });
        elements.zoomOut.addEventListener("click", () => this.viewport.zoomOut(), { signal });
        elements.zoomFit.addEventListener("click", () => this.viewport.fit(), { signal });
        elements.themeButton?.addEventListener("click", () => this.setTheme(THEME_CHOICES[this.theme].next), { signal });
        elements.undo?.addEventListener("click", () => void this.undo(), { signal });
        elements.redo?.addEventListener("click", () => void this.redo(), { signal });
        elements.emptyAdd?.addEventListener("click", event => {
            event.stopPropagation();
            this.rail.openMenu();
        }, { signal });

        elements.exportMenu.querySelectorAll<HTMLButtonElement>("[data-export]").forEach(control => {
            control.addEventListener("click", () => {
                elements.exportMenu.open = false;
                const format = EXPORTS.find(entry => entry.format === control.getAttribute("data-export"))?.format;
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

        // A horizontal strip is expected to answer the wheel, which by default only scrolls the page
        elements.views.addEventListener("wheel", event => {
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            const before = elements.views.scrollLeft;
            elements.views.scrollLeft += delta;
            if (elements.views.scrollLeft !== before) event.preventDefault();
        }, { passive: false, signal });

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
            throw new Error("No renderer is available.");
        }
        return found;
    }

    private renderContext(): RenderContext {
        return {
            store: this.store,
            palette: new Palette(this.store.catalog, elementTokenResolver(this.root)),
            icons: this.icons,
            representation: this.store.representationInfo(this.representation),
            options: this.preferences.choices(this.representation),
            slideHeader: this.slideHeader
        };
    }

    private renderViewSwitcher(): void {
        const pills = this.renderers.map(renderer => {
            const info = this.store.representationInfo(renderer.representation);
            const pill = h("button", "tlg-view-pill", { type: "button", role: "tab", title: info.description, "aria-selected": String(renderer.representation === this.representation) }, [
                this.icons.element(info.icon),
                info.label
            ]);
            pill.addEventListener("click", () => this.selectRepresentation(renderer.representation));
            return pill;
        });
        this.elements.views.replaceChildren(...pills);
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
        const controls: HTMLButtonElement[] = [
            this.cycleButton(AUDIENCE_CHOICES, filters.audience, filters.audience !== Audience.Both, value => {
                this.store.setFilters({ audience: value });
                this.renderFilters();
            })
        ];

        const milestones = h("button", "tlg-chip-toggle", { type: "button", "aria-pressed": String(filters.milestonesOnly) }, ["Milestones only"]);
        milestones.addEventListener("click", () => {
            this.store.setFilters({ milestonesOnly: !this.store.filters.milestonesOnly });
            this.renderFilters();
        });
        controls.push(milestones);

        const chosen = this.preferences.choices(this.representation);
        this.renderer.options.forEach(option => {
            const current = option.choices.find(choice => choice.value === chosen.get(option.id))?.value ?? option.fallback;
            controls.push(this.cycleButton(option.choices, current, current !== option.fallback, value => {
                this.preferences.setChoice(this.representation, option.id, value);
                this.pageIndex = 0;
                this.renderFilters();
                this.redraw();
            }));
        });

        this.elements.filters.replaceChildren(...controls);
    }

    private renderHistoryButtons(): void {
        const { undo, redo } = this.elements;
        if (undo) {
            undo.disabled = !this.history.canUndo;
            undo.title = this.history.undoLabel ? `Undo ${this.history.undoLabel}` : "Nothing to undo";
        }
        if (redo) {
            redo.disabled = !this.history.canRedo;
            redo.title = this.history.redoLabel ? `Redo ${this.history.redoLabel}` : "Nothing to redo";
        }
    }

    select(selection: Selection | null): void {
        this.store.setSelection(selection);
    }

    selectRepresentation(representation: Representation): void {
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
            button.replaceChildren(this.icons.element(THEME_CHOICES[mode].icon));
            button.title = THEME_CHOICES[mode].label;
            button.setAttribute("aria-label", THEME_CHOICES[mode].label);
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
        this.viewport.svg.querySelectorAll(`[${RECORD_ATTRIBUTES[selection.type]}="${selection.id}"]`).forEach(element => element.classList.add("is-selected"));
    }

    redraw(): void {
        if (!this.store.isLoaded) return;

        this.elements.empty.hidden = !this.store.isEmpty;
        const pages = this.renderer.paginate(this.renderContext());
        this.followSelection(pages);
        this.pageIndex = Math.min(Math.max(this.pageIndex, 0), pages.count - 1);
        this.viewport.allowDrag = this.renderer.draggable && this.permissions.canEdit;

        const info = this.store.representationInfo(this.representation);
        this.viewport.setContent(pages.draw(this.pageIndex), `${info.label} of ${this.store.incident.title}`);
        this.markSelection();
        this.renderCaption();
        this.renderPager(pages.count);
    }

    /**
     * Takes the analyst to the slide a newly picked record is on. It fires once per selection: after that
     * the pager is theirs, so turning the page with something selected sticks instead of being pulled back.
     */
    private followSelection(pages: Pagination): void {
        const selection = this.store.selection;
        const key = selection ? `${selection.type}:${selection.id}` : null;
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
            turn(Icon.ChevronLeft, "Previous slide", this.pageIndex === 0, -1),
            h("span", null, {}, [`Slide ${this.pageIndex + 1} of ${pageCount}`]),
            turn(Icon.ChevronRight, "Next slide", this.pageIndex === pageCount - 1, 1)
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
            label: labelFor(edit.type),
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
            this.notify("The change could not be saved, reloading the diagram.");
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
                label: labelFor(draft.type),
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
            this.notify("The record could not be created.");
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
                label: labelFor(type),
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
            this.notify("The record could not be deleted.");
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
            if (label) this.notify(`Undid the ${label} change.`);
        } catch {
            this.notify("That change can no longer be undone.");
            await this.reload();
        }
    }

    private async redo(): Promise<void> {
        try {
            const label = await this.history.redo();
            if (label) this.notify(`Redid the ${label} change.`);
        } catch {
            this.notify("That change can no longer be redone.");
            await this.reload();
        }
    }

    private async pinNode(nodeId: RecordId, position: Point): Promise<void> {
        this.store.setPlacement(nodeId, this.representation, position);
        try {
            await this.api.saveLayout(this.incidentId, [{ nodeId, representation: this.representation, x: position.x, y: position.y }]);
        } catch {
            this.notify("The new position could not be saved.");
        }
    }

    async reload(): Promise<void> {
        const selection = this.store.selection;
        this.store.load(await this.api.getDiagram(this.incidentId));
        if (selection) {
            this.store.setSelection(selection);
        }
    }

    async exportAs(format: ExportFormat): Promise<void> {
        if (!this.store.isLoaded) return;

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
                    await exportHtml(drawn, title, title);
                    break;
                case ExportFormat.Print:
                    await printPages(drawn, title);
                    break;
            }
        } catch {
            this.notify("The export could not be produced.");
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
