// A single page incident desk around the workspace: pick an incident, open a new one, edit or delete its details,
// and switch the theme of the whole page. Hosts that manage incidents in their own screens mount the workspace
// alone instead.

import { impactLevelsOf, type Catalog } from "../core/catalog.js";
import { ValidationError } from "../core/errors.js";
import { Icon } from "../core/icon.js";
import type { Incident, IncidentUpdateInput, RecordId } from "../core/models.js";
import type { TimelineApi } from "../core/service.js";
import type { KeyValueStorage } from "../storage/browser-storage-store.js";
import { h } from "./dom.js";
import { field, row, select, tagsInput, textInput, type Choice } from "./forms.js";
import { IconSet } from "./icons/icon-set.js";
import type { TimelinePermissions } from "./panels.js";
import { Preferences, defaultPreferenceStorage } from "./preferences.js";
import { ColorScheme, detectPageTheme, watchPageTheme } from "./theme-detection.js";
import { ThemeMode } from "./theme-mode.js";
import { mountTimeline, type TimelineHandle, type TimelineOptions } from "./workspace.js";

export interface TimelineAppOptions {
    api: TimelineApi;
    /** The name shown at the top of the page. */
    title?: string;
    /** Whether incidents can be opened, edited and deleted from the app. Off, it only browses them. */
    manageIncidents?: boolean;
    /** Finer control over what the app lets viewers do with incidents when they are managed. */
    incidentPermissions?: Partial<TimelinePermissions>;
    /** The incident to open first. Defaults to the one in the address, then the latest. */
    incidentId?: RecordId;
    /** Whether the address carries the open incident, so it can be bookmarked and shared. */
    syncAddress?: boolean;
    /** Light and dark are set as data-theme on the page root, so the rest of the site follows. Auto leaves the page alone. */
    theme?: ThemeMode;
    /** Whether the app offers the auto, light and dark toggle, which sets data-theme on the page root. */
    themeToggle?: boolean;
    preferences?: KeyValueStorage | null;
    preferenceKey?: string;
    /** Passed to the workspace of the open incident. */
    timeline?: Omit<TimelineOptions, "api" | "incidentId" | "theme" | "themeToggle" | "preferences" | "onNotify">;
    onNotify?: (message: string) => void;
}

export interface TimelineAppHandle {
    /** The workspace of the open incident, null while no incident is open. */
    readonly timeline: TimelineHandle | null;
    open(incidentId: RecordId): Promise<void>;
    /** Reads the incidents again, keeping the open one when it still exists. */
    refresh(): Promise<void>;
    setTheme(mode: ThemeMode): void;
    destroy(): void;
}

const DEFAULT_TITLE = "Incident timelines";
const DEFAULT_PREFERENCE_KEY = "cyber-incidents-timeline-app";
const ADDRESS_KEY = "incident";
const PAGE_THEME_ATTRIBUTE = "data-theme";
const TOAST_MS = 4000;

const THEME_LABELS: Readonly<Record<ThemeMode, { label: string; icon: Icon; next: ThemeMode }>> = {
    [ThemeMode.Auto]: { label: "Theme follows the system, switch to light", icon: Icon.Auto, next: ThemeMode.Light },
    [ThemeMode.Light]: { label: "Light theme, switch to dark", icon: Icon.Sun, next: ThemeMode.Dark },
    [ThemeMode.Dark]: { label: "Dark theme, switch to following the system", icon: Icon.Moon, next: ThemeMode.Auto }
};

function messageOf(error: unknown): string {
    if (error instanceof ValidationError) {
        return error.issues.map(issue => `${issue.field} ${issue.message}`).join(". ");
    }
    return error instanceof Error ? error.message : "The request could not be completed.";
}

function incidentLabel(incident: Incident): string {
    return incident.referenceId ? `${incident.referenceId}, ${incident.title}` : incident.title;
}

function addressedIncident(): RecordId | null {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(ADDRESS_KEY);
    const id = Number(value);
    return value !== null && Number.isInteger(id) && id > 0 ? id : null;
}

interface AppElements {
    picker: HTMLSelectElement;
    details: HTMLButtonElement | null;
    create: HTMLButtonElement | null;
    themeButton: HTMLButtonElement | null;
    main: HTMLElement;
    timeline: HTMLElement;
    empty: HTMLElement;
    dialog: HTMLElement;
}

class TimelineApp implements TimelineAppHandle {
    private readonly root: HTMLElement;
    private readonly api: TimelineApi;
    private readonly options: TimelineAppOptions;
    private readonly permissions: TimelinePermissions;
    private readonly icons: IconSet;
    private readonly preferences: Preferences;
    private readonly elements: AppElements;
    private readonly lifetime = new AbortController();
    private readonly stopWatchingTheme: () => void;
    private catalog: Catalog | null = null;
    private incidents: Incident[] = [];
    private openId: RecordId | null = null;
    private handle: TimelineHandle | null = null;
    private theme: ThemeMode;

    constructor(root: HTMLElement, options: TimelineAppOptions) {
        this.root = root;
        this.api = options.api;
        this.options = options;
        const managed = options.manageIncidents ?? true;
        this.permissions = { canCreate: managed, canEdit: managed, canDelete: managed, ...(managed ? options.incidentPermissions : {}) };
        this.icons = options.timeline?.icons ?? new IconSet();
        this.preferences = new Preferences(options.preferences === undefined ? defaultPreferenceStorage() : options.preferences, options.preferenceKey ?? DEFAULT_PREFERENCE_KEY);
        const themeToggle = options.themeToggle ?? true;
        this.theme = (themeToggle ? this.preferences.theme : null) ?? options.theme ?? ThemeMode.Auto;
        if (this.theme !== ThemeMode.Auto) {
            this.applyPageTheme();
        }
        this.elements = this.build(themeToggle);
        this.stopWatchingTheme = watchPageTheme(() => this.followPageTheme());
        this.bind();
    }

    get timeline(): TimelineHandle | null {
        return this.handle;
    }

    private build(themeToggle: boolean): AppElements {
        const icons = this.icons;
        const picker = h("select", "tlg-select tlg-appbar-picker", { "aria-label": "Incident" });
        const details = this.permissions.canEdit || this.permissions.canDelete
            ? h("button", "tlg-button", { type: "button" }, [icons.element(Icon.Text), "Details"])
            : null;
        const create = this.permissions.canCreate
            ? h("button", "tlg-button tlg-button-primary", { type: "button" }, [icons.element(Icon.Plus), "New incident"])
            : null;
        const themeButton = themeToggle
            ? h("button", "tlg-button tlg-button-icon", { type: "button", title: THEME_LABELS[this.theme].label, "aria-label": THEME_LABELS[this.theme].label }, [icons.element(THEME_LABELS[this.theme].icon)])
            : null;
        const timeline = h("div", "tlg-app-timeline");
        const empty = h("section", "tlg-app-empty");
        empty.hidden = true;
        const main = h("main", "tlg-app-main", {}, [timeline, empty]);
        const dialog = h("div", "tlg-dialog-backdrop");
        dialog.hidden = true;

        this.root.classList.add("tlg-app");
        this.root.setAttribute("data-tlg-theme", this.scheme());
        this.root.replaceChildren(
            h("header", "tlg-appbar", {}, [
                h("span", "tlg-appbar-brand", {}, [icons.element(Icon.Timeline), this.options.title ?? DEFAULT_TITLE]),
                h("div", "tlg-appbar-incident", {}, [picker, details]),
                h("div", "tlg-appbar-actions", {}, [create, themeButton])
            ]),
            main,
            dialog
        );
        return { picker, details, create, themeButton, main, timeline, empty, dialog };
    }

    private bind(): void {
        const signal = this.lifetime.signal;
        this.elements.picker.addEventListener("change", () => void this.open(Number(this.elements.picker.value)), { signal });
        this.elements.details?.addEventListener("click", () => this.showDetails(), { signal });
        this.elements.create?.addEventListener("click", () => this.showCreate(), { signal });
        this.elements.themeButton?.addEventListener("click", () => this.setTheme(THEME_LABELS[this.theme].next), { signal });
        this.elements.dialog.addEventListener("click", event => {
            if (event.target === this.elements.dialog) this.closeDialog();
        }, { signal });
        this.root.addEventListener("keydown", event => {
            if (event.key === "Escape" && !this.elements.dialog.hidden) this.closeDialog();
        }, { signal });
        if (this.syncAddress()) {
            window.addEventListener("hashchange", () => {
                const addressed = addressedIncident();
                if (addressed !== null && addressed !== this.openId) void this.open(addressed);
            }, { signal });
        }
    }

    private syncAddress(): boolean {
        return this.options.syncAddress ?? true;
    }

    async start(): Promise<void> {
        try {
            this.catalog = await this.api.getCatalog();
            this.incidents = await this.api.listIncidents();
        } catch (error) {
            this.notify(`The incidents could not be loaded. ${messageOf(error)}`);
            return;
        }
        const wanted = this.options.incidentId ?? (this.syncAddress() ? addressedIncident() : null);
        const first = this.incidents.find(incident => incident.id === wanted) ?? this.incidents.at(-1) ?? null;
        await this.show(first?.id ?? null);
    }

    private scheme(): ColorScheme {
        return this.options.timeline?.themeDetector?.() ?? detectPageTheme();
    }

    private followPageTheme(): void {
        this.root.setAttribute("data-tlg-theme", this.scheme());
    }

    private applyPageTheme(): void {
        const page = document.documentElement;
        if (this.theme === ThemeMode.Auto) {
            page.removeAttribute(PAGE_THEME_ATTRIBUTE);
        } else {
            page.setAttribute(PAGE_THEME_ATTRIBUTE, this.theme);
        }
    }

    setTheme(mode: ThemeMode): void {
        this.theme = mode;
        this.preferences.setTheme(mode);
        this.applyPageTheme();
        const button = this.elements.themeButton;
        if (button) {
            const choice = THEME_LABELS[mode];
            button.replaceChildren(this.icons.element(choice.icon));
            button.title = choice.label;
            button.setAttribute("aria-label", choice.label);
        }
        this.followPageTheme();
    }

    async open(incidentId: RecordId): Promise<void> {
        if (!this.incidents.some(incident => incident.id === incidentId)) {
            await this.refresh();
        }
        if (!this.incidents.some(incident => incident.id === incidentId)) {
            this.notify(`Incident ${incidentId} does not exist or is not available.`);
            return;
        }
        await this.show(incidentId);
    }

    async refresh(): Promise<void> {
        try {
            this.incidents = await this.api.listIncidents();
        } catch (error) {
            this.notify(`The incidents could not be loaded. ${messageOf(error)}`);
            return;
        }
        this.fillPicker();
    }

    private fillPicker(): void {
        const picker = this.elements.picker;
        picker.replaceChildren(...this.incidents.map(incident => h("option", null, { value: String(incident.id) }, [incidentLabel(incident)])));
        picker.value = this.openId === null ? "" : String(this.openId);
        picker.hidden = this.incidents.length === 0;
        if (this.elements.details) this.elements.details.hidden = this.openId === null;
    }

    private async show(incidentId: RecordId | null): Promise<void> {
        this.handle?.destroy();
        this.handle = null;
        this.openId = incidentId;
        this.fillPicker();
        this.elements.timeline.hidden = incidentId === null;
        this.elements.empty.hidden = incidentId !== null;

        if (this.syncAddress() && incidentId !== null && addressedIncident() !== incidentId) {
            window.history.replaceState(null, "", `#${ADDRESS_KEY}=${incidentId}`);
        }
        if (incidentId === null) {
            this.renderEmpty();
            return;
        }
        this.handle = await mountTimeline(this.elements.timeline, {
            ...this.options.timeline,
            api: this.api,
            incidentId,
            theme: ThemeMode.Auto,
            themeToggle: false,
            preferences: this.options.preferences,
            onNotify: this.options.onNotify
        });
    }

    private renderEmpty(): void {
        const icons = this.icons;
        if (!this.permissions.canCreate) {
            this.elements.empty.replaceChildren(
                icons.element(Icon.Timeline),
                h("p", "tlg-empty-title", {}, ["No incidents to show"]),
                h("p", "tlg-empty-hint", {}, ["Incidents appear here once they are recorded."])
            );
            return;
        }
        const title = h("input", "tlg-input", { type: "text", placeholder: "What happened, in a few words", "aria-label": "Incident title", required: "" });
        const form = h("form", "tlg-app-quick", {}, [
            title,
            h("button", "tlg-button tlg-button-primary", { type: "submit" }, [icons.element(Icon.Plus), "Open the incident"])
        ]);
        form.addEventListener("submit", event => {
            event.preventDefault();
            void this.createIncident({ title: title.value }, null);
        });
        this.elements.empty.replaceChildren(
            icons.element(Icon.Timeline),
            h("p", "tlg-empty-title", {}, ["No incidents yet"]),
            h("p", "tlg-empty-hint", {}, ["Give the incident a title to start its timeline. Everything else can be filled in later."]),
            form
        );
    }

    private async createIncident(input: IncidentUpdateInput, error: HTMLElement | null): Promise<void> {
        try {
            const incident = await this.api.createIncident({ ...input, title: input.title ?? "" });
            this.closeDialog();
            await this.refresh();
            await this.show(incident.id);
        } catch (failure) {
            this.report(failure, error);
        }
    }

    private report(failure: unknown, error: HTMLElement | null): void {
        if (error) {
            error.textContent = messageOf(failure);
            error.hidden = false;
        } else {
            this.notify(messageOf(failure));
        }
    }

    private showCreate(): void {
        const draft: IncidentUpdateInput = {};
        this.openDialog("New incident", this.incidentFields(null, draft, false), "Open the incident", error => this.createIncident(draft, error), null);
    }

    private showDetails(): void {
        const incident = this.incidents.find(candidate => candidate.id === this.openId);
        if (!incident) return;
        const draft: IncidentUpdateInput = {};
        const save = this.permissions.canEdit ? (error: HTMLElement): Promise<void> => this.saveIncident(incident.id, draft, error) : null;
        const remove = this.permissions.canDelete ? (error: HTMLElement): Promise<void> => this.deleteIncident(incident.id, error) : null;
        this.openDialog("Incident details", this.incidentFields(incident, draft, !this.permissions.canEdit), save ? "Save" : null, save, remove);
    }

    private async saveIncident(incidentId: RecordId, draft: IncidentUpdateInput, error: HTMLElement): Promise<void> {
        try {
            await this.api.updateIncident(incidentId, draft);
            this.closeDialog();
            await this.refresh();
            await this.handle?.reload();
        } catch (failure) {
            this.report(failure, error);
        }
    }

    private async deleteIncident(incidentId: RecordId, error: HTMLElement): Promise<void> {
        try {
            await this.api.deleteIncident(incidentId);
            this.closeDialog();
            this.incidents = this.incidents.filter(incident => incident.id !== incidentId);
            if (this.syncAddress()) window.history.replaceState(null, "", window.location.pathname + window.location.search);
            await this.refresh();
            await this.show(this.incidents.at(-1)?.id ?? null);
        } catch (failure) {
            this.report(failure, error);
        }
    }

    /**
     * The fields of an incident, reporting every change into the draft. A new incident only asks for what
     * people know when they open one.
     */
    private incidentFields(incident: Incident | null, draft: IncidentUpdateInput, readOnly: boolean): HTMLElement[] {
        const impactChoices: Choice<string>[] = this.catalog
            ? impactLevelsOf(this.catalog.impactScale).map(level => ({ value: level.level, label: level.label }))
            : [];
        const title = textInput(incident?.title ?? null, value => { draft.title = value ?? ""; }, "What happened, in a few words");
        title.required = true;
        const fields: HTMLElement[] = [
            field("Title", title),
            row(
                field("Reference", textInput(incident?.referenceId ?? null, value => { draft.referenceId = value; }, "Ticket or case number")),
                field("Impact", select(incident?.impact ?? this.catalog?.impactScale.unassessed.level ?? null, impactChoices, value => { if (value) draft.impact = value; }))
            )
        ];
        if (incident) {
            fields.push(
                row(
                    field("Scope", textInput(incident.scope, value => { draft.scope = value; }, "Organisation or business unit")),
                    field("Classifications", tagsInput(incident.classifications, values => { draft.classifications = values; }))
                )
            );
            if (incident.externalId) {
                fields.push(h("p", "tlg-dialog-note", {}, [`Linked to ${incident.externalId} in the system that owns the incident.`]));
            }
        }
        if (readOnly) {
            fields.forEach(node => node.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach(control => { control.disabled = true; }));
        }
        return fields;
    }

    private openDialog(
        heading: string,
        fields: HTMLElement[],
        submitLabel: string | null,
        submit: ((error: HTMLElement) => Promise<void>) | null,
        remove: ((error: HTMLElement) => Promise<void>) | null
    ): void {
        const icons = this.icons;
        const error = h("p", "tlg-dialog-error", { role: "alert" });
        error.hidden = true;
        const close = h("button", "tlg-button tlg-button-quiet", { type: "button" }, ["Cancel"]);
        close.addEventListener("click", () => this.closeDialog());

        const confirm = h("div", "tlg-dialog-confirm");
        confirm.hidden = true;
        const removeButton = remove ? h("button", "tlg-button tlg-button-danger", { type: "button" }, [icons.element(Icon.Trash), "Delete"]) : null;
        if (remove && removeButton) {
            const really = h("button", "tlg-button tlg-button-danger", { type: "button" }, ["Delete the incident and its timeline"]);
            const keep = h("button", "tlg-button tlg-button-quiet", { type: "button" }, ["Keep it"]);
            // Keep it takes the place of Delete, so a double click cannot delete
            confirm.replaceChildren(keep, h("span", null, {}, ["This cannot be undone."]), really);
            removeButton.addEventListener("click", () => { confirm.hidden = false; removeButton.hidden = true; keep.focus(); });
            keep.addEventListener("click", () => { confirm.hidden = true; removeButton.hidden = false; removeButton.focus(); });
            really.addEventListener("click", () => void remove(error));
        }

        const form = h("form", "tlg-dialog", { role: "dialog", "aria-modal": "true", "aria-label": heading }, [
            h("div", "tlg-dialog-head", {}, [h("h2", null, {}, [heading])]),
            h("div", "tlg-dialog-body", {}, [...fields, error]),
            h("div", "tlg-dialog-foot", {}, [
                removeButton,
                confirm,
                h("span", "tlg-dialog-spacer"),
                close,
                submit && submitLabel ? h("button", "tlg-button tlg-button-primary", { type: "submit" }, [submitLabel]) : null
            ])
        ]);
        form.addEventListener("submit", event => {
            event.preventDefault();
            if (submit) void submit(error);
        });

        this.elements.dialog.replaceChildren(form);
        this.elements.dialog.hidden = false;
        form.querySelector<HTMLInputElement>("input")?.focus();
    }

    private closeDialog(): void {
        this.elements.dialog.hidden = true;
        this.elements.dialog.replaceChildren();
    }

    private notify(message: string): void {
        if (this.options.onNotify) {
            this.options.onNotify(message);
            return;
        }
        this.root.querySelector(".tlg-app-main > .tlg-toast")?.remove();
        const toast = h("div", "tlg-toast", { role: "status" }, [message]);
        this.elements.main.append(toast);
        window.setTimeout(() => toast.remove(), TOAST_MS);
    }

    destroy(): void {
        this.lifetime.abort();
        this.stopWatchingTheme();
        this.handle?.destroy();
        this.handle = null;
        this.root.replaceChildren();
        this.root.classList.remove("tlg-app");
        this.root.removeAttribute("data-tlg-theme");
    }
}

/**
 * Builds a single page incident desk inside the element: an incident picker, creation and editing of incidents
 * when allowed, and the workspace of the open incident. The element is meant to fill the page.
 */
export async function mountTimelineApp(element: HTMLElement, options: TimelineAppOptions): Promise<TimelineAppHandle> {
    const app = new TimelineApp(element, options);
    await app.start();
    return app;
}
