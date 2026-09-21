// The settings of the incident desk as a dialog of tabs. It edits a draft and hands it back on save; storing
// it and applying it is the app's to do.

import { buildCatalog, impactLevelsOf, type ImpactLevelInfo, type ImpactScale, type MilestoneInfo } from "../core/catalog.js";
import { isEnumValue } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import { DEFAULT_TOKEN_VALUES, ThemeToken } from "../core/theme-token.js";
import { DEFAULT_DURATION_UNITS, type DurationUnits } from "../core/time.js";
import { CanvasMode } from "./canvas-mode.js";
import { h, uniqueId } from "./dom.js";
import { download } from "./export.js";
import { button, field, row, select, textInput, type Choice } from "./forms.js";
import type { IconSet } from "./icons/icon-set.js";
import {
    ColorSection, EDITABLE_COLORS, LOCALES, PAGE_PRESETS, SettingsGroup, SettingsScope,
    catalogEntries, defaultSettings, groupHasIcons, iconCollisions, isHexColor, keyFor, parseSettings,
    serializeSettings, settingsCatalog, type AppSettings, type EntryOverride
} from "./settings.js";
import type { Strings } from "./strings.js";
import { ColorScheme } from "./theme-detection.js";
import { ThemeMode } from "./theme-mode.js";
import { DEFAULT_PAGE_SIZE } from "./viewport.js";

export enum SettingsTab {
    Appearance = "appearance",
    Vocabulary = "vocabulary",
    Scales = "scales",
    Display = "display",
    Backup = "backup"
}

export interface SettingsDialogOptions {
    settings: AppSettings;
    theme: ThemeMode;
    icons: IconSet;
    strings: Strings;
    /** Presentation leaves out the tab of the impact scale and milestones, which the catalog owner validates. */
    scope: SettingsScope;
    /** The colour a token has in a scheme before any setting touches it. */
    defaultColor(scheme: ColorScheme, token: ThemeToken): string;
    /** Lines describing records that still use what the draft removes, empty when nothing does. */
    usage(settings: AppSettings): Promise<string[]>;
    save(settings: AppSettings, theme: ThemeMode): Promise<void>;
    close(): void;
}

const SETTINGS_FILE = "timeline-settings.json";
const JSON_TYPE = "application/json";
const MAX_LABEL_LENGTH = 60;
const MAX_UNIT_LENGTH = 8;
const NEW_LEVEL_COLOR = DEFAULT_TOKEN_VALUES[ThemeToken.InkMuted];
const SCHEMES: readonly ColorScheme[] = [ColorScheme.Light, ColorScheme.Dark];
const PAGE_KEY_SEPARATOR = "x";

function tabLabels(strings: Strings): Readonly<Record<SettingsTab, { label: string; icon: Icon }>> {
    const words = strings.settings;
    return {
        [SettingsTab.Appearance]: { label: words.tabAppearance, icon: Icon.Palette },
        [SettingsTab.Vocabulary]: { label: words.tabVocabulary, icon: Icon.Tag },
        [SettingsTab.Scales]: { label: words.tabScales, icon: Icon.Scale },
        [SettingsTab.Display]: { label: words.tabDisplay, icon: Icon.Workstation },
        [SettingsTab.Backup]: { label: words.tabBackup, icon: Icon.Archive }
    };
}

function groupLabels(strings: Strings): Readonly<Record<SettingsGroup, string>> {
    const words = strings.settings;
    return {
        [SettingsGroup.Sides]: words.groupSides,
        [SettingsGroup.NodeKinds]: words.groupNodeKinds,
        [SettingsGroup.AttackTactics]: words.groupAttackTactics,
        [SettingsGroup.KillChainPhases]: words.groupKillChainPhases,
        [SettingsGroup.ResponsePhases]: words.groupResponsePhases,
        [SettingsGroup.Outcomes]: words.groupOutcomes,
        [SettingsGroup.LinkKinds]: words.groupLinkKinds,
        [SettingsGroup.Confidences]: words.groupConfidences,
        [SettingsGroup.Involvements]: words.groupInvolvements,
        [SettingsGroup.Audiences]: words.groupAudiences,
        [SettingsGroup.Representations]: words.groupRepresentations
    };
}

function section(heading: string, hint: string, content: readonly HTMLElement[]): HTMLElement {
    return h("section", "tlg-settings-section", {}, [
        h("h3", null, {}, [heading]),
        h("p", "tlg-settings-hint", {}, [hint]),
        ...content
    ]);
}

function colorInput(value: string, label: string, onChange: (value: string) => void): HTMLInputElement {
    const input = h("input", "tlg-color", { type: "color", id: uniqueId("color"), "aria-label": label, title: label });
    input.value = value;
    input.addEventListener("change", () => {
        if (isHexColor(input.value)) onChange(input.value);
    });
    return input;
}

function labelInput(value: string, placeholder: string, label: string, onChange: (value: string | null) => void): HTMLInputElement {
    const input = textInput(value, onChange, placeholder);
    input.maxLength = MAX_LABEL_LENGTH;
    input.setAttribute("aria-label", label);
    return input;
}

function readableIcon(name: string): string {
    return name.replace(/-/g, " ");
}

interface IconPicker {
    toggle: HTMLButtonElement;
    panel: HTMLDivElement;
}

/**
 * A button showing the icon, and a panel below its row with a search box over every icon the set can draw.
 * The panel sits in the flow rather than floating, so the dialog never clips it. The grid is only built the
 * first time it opens, since most rows are never opened.
 */
function iconPicker(icons: IconSet, current: string, label: string, strings: Strings, onPick: (icon: string) => void): IconPicker {
    const toggle = h("button", "tlg-button tlg-button-icon", { type: "button", title: label, "aria-label": label, "aria-expanded": "false" }, [icons.element(current)]);
    const search = h("input", "tlg-input", { type: "search", placeholder: strings.settings.searchIcons, "aria-label": strings.settings.searchIcons });
    const grid = h("div", "tlg-icon-grid", { role: "listbox", "aria-label": label });
    const empty = h("p", "tlg-settings-hint", {}, [strings.forms.noMatch]);
    empty.hidden = true;
    const panel = h("div", "tlg-icon-panel", {}, [search, grid, empty]);
    panel.hidden = true;

    const show = (open: boolean): void => {
        panel.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
    };
    const filter = (): void => {
        const query = search.value.trim().toLowerCase();
        let shown = 0;
        grid.querySelectorAll<HTMLButtonElement>(".tlg-icon-choice").forEach(choice => {
            const match = (choice.getAttribute("aria-label") ?? "").includes(query);
            choice.hidden = !match;
            if (match) shown += 1;
        });
        empty.hidden = shown > 0;
    };

    toggle.addEventListener("click", () => {
        const opening = panel.hidden === true;
        // One panel at a time, or the list turns into a wall of icons
        const list = panel.closest(".tlg-vocabulary");
        list?.querySelectorAll<HTMLElement>(".tlg-icon-panel").forEach(other => { other.hidden = true; });
        list?.querySelectorAll("[aria-expanded]").forEach(other => other.setAttribute("aria-expanded", "false"));
        show(opening);
        if (!opening) return;
        if (grid.childElementCount === 0) {
            grid.replaceChildren(...icons.names().map(name => {
                const choice = h("button", "tlg-icon-choice", { type: "button", role: "option", title: readableIcon(name), "aria-label": readableIcon(name), "aria-selected": String(name === current) }, [icons.element(name)]);
                choice.addEventListener("click", () => {
                    show(false);
                    onPick(name);
                });
                return choice;
            }));
        }
        search.focus();
    });
    search.addEventListener("input", filter);
    search.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        // Escape shuts the panel, not the whole dialog around it
        event.stopPropagation();
        show(false);
        toggle.focus();
    });
    return { toggle, panel };
}

function pageKey(width: number, height: number): string {
    return `${width}${PAGE_KEY_SEPARATOR}${height}`;
}

class SettingsDialog {
    private readonly options: SettingsDialogOptions;
    private readonly strings: Strings;
    private readonly icons: IconSet;
    private readonly form: HTMLFormElement;
    private readonly tabs = new Map<SettingsTab, HTMLButtonElement>();
    private readonly panel: HTMLDivElement;
    private readonly note: HTMLDivElement;
    private readonly submit: HTMLButtonElement;
    private draft: AppSettings;
    private theme: ThemeMode;
    private tab = SettingsTab.Appearance;
    private group = SettingsGroup.Sides;
    private acknowledged = false;

    constructor(options: SettingsDialogOptions) {
        this.options = options;
        this.strings = options.strings;
        this.icons = options.icons;
        this.draft = structuredClone(options.settings);
        this.theme = options.theme;

        const words = this.strings.settings;
        const labels = tabLabels(this.strings);
        const tabList = h("div", "tlg-tabs", { role: "tablist", "aria-label": words.title });
        this.panel = h("div", "tlg-settings-panel", { role: "tabpanel" });
        const offered = Object.values(SettingsTab).filter(tab => tab !== SettingsTab.Scales || options.scope === SettingsScope.Everything);
        offered.forEach(tab => {
            const node = h("button", "tlg-tab", { type: "button", role: "tab", id: uniqueId("tab") }, [this.icons.element(labels[tab].icon), labels[tab].label]);
            node.addEventListener("click", () => this.show(tab));
            this.tabs.set(tab, node);
            tabList.append(node);
        });
        this.note = h("div", "tlg-settings-note", { role: "status" });
        this.note.hidden = true;
        const cancel = h("button", "tlg-button tlg-button-quiet", { type: "button" }, [words.cancel]);
        cancel.addEventListener("click", () => options.close());
        this.submit = h("button", "tlg-button tlg-button-primary", { type: "submit" }, [words.save]);

        this.form = h("form", "tlg-dialog tlg-settings", { role: "dialog", "aria-modal": "true", "aria-label": words.title }, [
            h("div", "tlg-dialog-head", {}, [h("h2", null, {}, [this.icons.element(Icon.Settings), words.title])]),
            tabList,
            h("div", "tlg-dialog-body", {}, [this.panel]),
            h("div", "tlg-dialog-foot", {}, [this.note, h("span", "tlg-dialog-spacer"), cancel, this.submit])
        ]);
        this.form.addEventListener("submit", event => {
            event.preventDefault();
            void this.save();
        });
        // Any edit after a warning means the warning may no longer hold, so it has to be earned again
        this.panel.addEventListener("change", () => this.touched());
        this.panel.addEventListener("click", event => {
            if (event.target instanceof Element && event.target.closest("button")) this.touched();
        });
        this.show(SettingsTab.Appearance);
    }

    get element(): HTMLFormElement {
        return this.form;
    }

    private touched(): void {
        if (!this.acknowledged) return;
        this.acknowledged = false;
        this.submit.textContent = this.strings.settings.save;
        this.tell([]);
    }

    private tell(lines: readonly string[], warning = false): void {
        this.note.replaceChildren(...lines.map(line => h("p", null, {}, [line])));
        this.note.classList.toggle("tlg-settings-warning", warning);
        this.note.hidden = lines.length === 0;
    }

    private show(tab: SettingsTab): void {
        this.tab = tab;
        this.tabs.forEach((node, key) => {
            node.setAttribute("aria-selected", String(key === tab));
            if (key === tab) this.panel.setAttribute("aria-labelledby", node.id);
        });
        this.panel.replaceChildren(...this.content(tab));
    }

    private content(tab: SettingsTab): HTMLElement[] {
        switch (tab) {
            case SettingsTab.Appearance:
                return this.appearance();
            case SettingsTab.Vocabulary:
                return this.vocabulary();
            case SettingsTab.Scales:
                return this.scales();
            case SettingsTab.Display:
                return this.display();
            case SettingsTab.Backup:
                return this.backup();
        }
    }

    private appearance(): HTMLElement[] {
        const words = this.strings.settings;
        const themes: Choice<ThemeMode>[] = [
            { value: ThemeMode.Auto, label: words.auto },
            { value: ThemeMode.Light, label: words.light },
            { value: ThemeMode.Dark, label: words.dark }
        ];
        const mode = field(words.themeMode, select(this.theme, themes, value => { if (value) this.theme = value; }, { strings: this.strings.forms }));

        const sides = settingsCatalog(this.draft).sides;
        const nameOf = (token: ThemeToken): string => {
            if (token === ThemeToken.Accent) return words.accent;
            if (token === ThemeToken.Good) return words.positive;
            return sides.find(entry => entry.colorToken === token)?.label ?? token;
        };
        const grid = (colorSection: ColorSection): HTMLElement => h("div", "tlg-color-grid", {}, [
            h("span"),
            ...SCHEMES.map(scheme => h("span", "tlg-color-head", {}, [scheme === ColorScheme.Light ? words.light : words.dark])),
            h("span"),
            ...EDITABLE_COLORS.filter(entry => entry.section === colorSection).flatMap(({ token }) => this.colorRow(nameOf(token), token))
        ]);

        return [
            section(words.themeHeading, words.themeHint, [mode]),
            section(words.colorsHeading, words.colorsHint, [
                h("h4", null, {}, [words.colorsInterface]),
                grid(ColorSection.Brand),
                h("h4", null, {}, [words.colorsParties]),
                grid(ColorSection.Sides)
            ])
        ];
    }

    private colorRow(name: string, token: ThemeToken): HTMLElement[] {
        const current = (scheme: ColorScheme): string => this.draft.colors[scheme][token] ?? this.options.defaultColor(scheme, token);
        const inputs = SCHEMES.map(scheme => colorInput(current(scheme), `${name}, ${scheme}`, value => {
            this.draft.colors[scheme][token] = value;
        }));
        const reset = button(this.icons, this.strings.settings.resetColor, "tlg-button tlg-button-quiet", () => {
            SCHEMES.forEach((scheme, index) => {
                delete this.draft.colors[scheme][token];
                const input = inputs[index];
                if (input) input.value = current(scheme);
            });
        }, Icon.Undo);
        return [h("span", "tlg-color-name", {}, [name]), ...inputs, reset];
    }

    private vocabulary(): HTMLElement[] {
        const words = this.strings.settings;
        const names = groupLabels(this.strings);
        const choices: Choice<SettingsGroup>[] = Object.values(SettingsGroup).map(group => ({ value: group, label: names[group] }));
        const list = h("div", "tlg-vocabulary");
        const picker = select(this.group, choices, value => {
            if (!value) return;
            this.group = value;
            this.paintGroup(list);
        }, { strings: this.strings.forms });
        this.paintGroup(list);
        return [section(words.vocabularyHeading, words.vocabularyHint, [field(words.list, picker), list])];
    }

    private overridesOf(group: SettingsGroup): Map<string, EntryOverride> {
        const existing = this.draft.entries.get(group);
        if (existing) return existing;
        const created = new Map<string, EntryOverride>();
        this.draft.entries.set(group, created);
        return created;
    }

    private paintGroup(list: HTMLElement): void {
        const words = this.strings.settings;
        const group = this.group;
        const defaults = catalogEntries(buildCatalog(), group);
        const current = catalogEntries(settingsCatalog(this.draft), group);
        const clashes = iconCollisions(current);
        const overrides = this.overridesOf(group);

        const change = (key: string, patch: Partial<EntryOverride>): void => {
            const next = { label: null, icon: null, ...overrides.get(key), ...patch };
            if (next.label === null && next.icon === null) {
                overrides.delete(key);
            } else {
                overrides.set(key, next);
            }
        };

        list.replaceChildren(...current.map(entry => {
            const builtIn = defaults.find(candidate => candidate.key === entry.key);
            const override = overrides.get(entry.key);
            const name = labelInput(override?.label ?? "", builtIn?.label ?? entry.label, entry.label, value => {
                change(entry.key, { label: value === null ? null : value.trim() });
                this.paintGroup(list);
            });
            const picker = groupHasIcons(group) && entry.icon !== null
                ? iconPicker(this.icons, entry.icon, words.iconOf(entry.label), this.strings, icon => {
                    change(entry.key, { icon: icon === builtIn?.icon ? null : icon });
                    this.paintGroup(list);
                })
                : null;
            const clash = clashes.get(entry.key);
            const warning = clash
                ? h("span", "tlg-settings-clash", { title: words.iconClash(clash), role: "img", "aria-label": words.iconClash(clash) }, [this.icons.element(Icon.Warning)])
                : null;
            return h("div", "tlg-vocabulary-entry", {}, [
                h("div", "tlg-vocabulary-row", {}, [picker?.toggle ?? null, name, warning]),
                picker?.panel ?? null
            ]);
        }));
    }

    private scale(): ImpactScale {
        return this.draft.impactScale ?? buildCatalog().impactScale;
    }

    private milestones(): MilestoneInfo[] {
        return this.draft.milestones ?? [];
    }

    private scales(): HTMLElement[] {
        const words = this.strings.settings;
        const levels = h("div", "tlg-settings-list");
        const milestones = h("div", "tlg-settings-list");
        this.paintLevels(levels);
        this.paintMilestones(milestones);
        return [
            section(words.impactHeading, words.impactHint, [levels, this.adder(words.addLevel, name => this.addLevel(name, levels))]),
            section(words.milestonesHeading, words.milestonesHint, [milestones, this.adder(words.addMilestone, name => this.addMilestone(name, milestones))])
        ];
    }

    private adder(label: string, add: (name: string) => void): HTMLElement {
        const input = h("input", "tlg-input", { type: "text", maxlength: String(MAX_LABEL_LENGTH), placeholder: this.strings.settings.newName, "aria-label": label });
        const commit = (): void => {
            const name = input.value.trim();
            if (name === "") return;
            add(name);
            input.value = "";
            input.focus();
        };
        input.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commit();
        });
        return h("div", "tlg-settings-adder", {}, [input, button(this.icons, label, "tlg-button", commit, Icon.Plus)]);
    }

    private levelColor(level: ImpactLevelInfo): string {
        if (isHexColor(level.color)) return level.color;
        return isEnumValue(ThemeToken, level.color) ? this.options.defaultColor(ColorScheme.Light, level.color) : NEW_LEVEL_COLOR;
    }

    private paintLevels(list: HTMLElement): void {
        const words = this.strings.settings;
        const scale = structuredClone(this.scale());
        const commit = (): void => {
            this.draft.impactScale = scale;
            this.paintLevels(list);
        };
        const levelRow = (level: ImpactLevelInfo, index: number | null): HTMLElement => {
            const color = colorInput(this.levelColor(level), words.colorOf(level.label), value => {
                level.color = value;
                this.draft.impactScale = scale;
            });
            const name = labelInput(level.label, level.label, level.label, value => {
                if (value !== null && value.trim() !== "") level.label = value.trim();
                commit();
            });
            const key = h("code", "tlg-settings-key", {}, [index === null ? words.unassessed : level.level]);
            if (index === null) return h("div", "tlg-settings-item", {}, [color, name, key]);
            const move = (offset: number): void => {
                const [moved] = scale.levels.splice(index, 1);
                if (moved) scale.levels.splice(index + offset, 0, moved);
                commit();
            };
            const up = button(this.icons, "", "tlg-button tlg-button-icon tlg-button-quiet", () => move(-1), Icon.ChevronUp);
            const down = button(this.icons, "", "tlg-button tlg-button-icon tlg-button-quiet", () => move(1), Icon.ChevronDown);
            const remove = button(this.icons, "", "tlg-button tlg-button-icon tlg-button-quiet", () => {
                scale.levels.splice(index, 1);
                commit();
            }, Icon.Trash);
            up.setAttribute("aria-label", words.moveUp);
            down.setAttribute("aria-label", words.moveDown);
            remove.setAttribute("aria-label", words.remove);
            up.disabled = index === 0;
            down.disabled = index === scale.levels.length - 1;
            remove.disabled = scale.levels.length === 1;
            return h("div", "tlg-settings-item", {}, [color, name, key, up, down, remove]);
        };
        list.replaceChildren(levelRow(scale.unassessed, null), ...scale.levels.map((level, index) => levelRow(level, index)));
    }

    private addLevel(name: string, list: HTMLElement): void {
        const scale = structuredClone(this.scale());
        const taken = new Set(impactLevelsOf(scale).map(level => level.level));
        scale.levels.push({ level: keyFor(name, taken), label: name, color: NEW_LEVEL_COLOR });
        this.draft.impactScale = scale;
        this.paintLevels(list);
    }

    private paintMilestones(list: HTMLElement): void {
        const words = this.strings.settings;
        const milestones = structuredClone(this.milestones());
        if (milestones.length === 0) {
            list.replaceChildren(h("p", "tlg-settings-hint", {}, [words.noMilestones]));
            return;
        }
        list.replaceChildren(...milestones.map((milestone, index) => {
            const name = labelInput(milestone.label, milestone.label, milestone.label, value => {
                if (value !== null && value.trim() !== "") milestone.label = value.trim();
                this.draft.milestones = milestones;
                this.paintMilestones(list);
            });
            const remove = button(this.icons, "", "tlg-button tlg-button-icon tlg-button-quiet", () => {
                milestones.splice(index, 1);
                this.draft.milestones = milestones;
                this.paintMilestones(list);
            }, Icon.Trash);
            remove.setAttribute("aria-label", words.remove);
            return h("div", "tlg-settings-item", {}, [name, h("code", "tlg-settings-key", {}, [milestone.key]), remove]);
        }));
    }

    private addMilestone(name: string, list: HTMLElement): void {
        const milestones = structuredClone(this.milestones());
        milestones.push({ key: keyFor(name, new Set(milestones.map(entry => entry.key))), label: name });
        this.draft.milestones = milestones;
        this.paintMilestones(list);
    }

    private display(): HTMLElement[] {
        const words = this.strings.settings;
        const forms = { strings: this.strings.forms };
        const size = this.draft.pageSize ?? DEFAULT_PAGE_SIZE;
        const pages: Choice<string>[] = PAGE_PRESETS.map(preset => ({ value: pageKey(preset.size.width, preset.size.height), label: preset.key }));
        const chosen = pageKey(size.width, size.height);
        if (!pages.some(page => page.value === chosen)) pages.push({ value: chosen, label: `${size.width} ${PAGE_KEY_SEPARATOR} ${size.height}` });
        const pageShape = select(chosen, pages, value => {
            const preset = PAGE_PRESETS.find(entry => pageKey(entry.size.width, entry.size.height) === value);
            if (preset) this.draft.pageSize = { ...preset.size };
        }, forms);
        const layouts: Choice<CanvasMode>[] = [
            { value: CanvasMode.Slides, label: words.layoutSlides },
            { value: CanvasMode.Continuous, label: words.layoutContinuous }
        ];
        const layout = select(this.draft.canvasMode ?? CanvasMode.Slides, layouts, value => { this.draft.canvasMode = value; }, forms);

        const locale = this.draft.locale ?? LOCALES[0] ?? "";
        const locales: Choice<string>[] = [...new Set([...LOCALES, locale])].map(value => ({ value, label: value }));
        const dates = select(locale, locales, value => { this.draft.locale = value; }, forms);
        const units = this.draft.durationUnits ?? DEFAULT_DURATION_UNITS;
        const unitInput = (key: keyof DurationUnits, label: string): HTMLElement => {
            const input = textInput(units[key], value => {
                const trimmed = value?.trim() ?? "";
                if (trimmed === "") {
                    input.value = (this.draft.durationUnits ?? DEFAULT_DURATION_UNITS)[key];
                    return;
                }
                this.draft.durationUnits = { ...(this.draft.durationUnits ?? DEFAULT_DURATION_UNITS), [key]: trimmed };
            });
            input.maxLength = MAX_UNIT_LENGTH;
            return field(label, input);
        };

        return [
            section(words.pagesHeading, words.pagesHint, [row(field(words.pageShape, pageShape), field(words.layout, layout))]),
            section(words.datesHeading, words.datesHint, [
                field(words.dateFormat, dates),
                row(unitInput("minutes", words.minutes), unitInput("hours", words.hours), unitInput("days", words.days))
            ])
        ];
    }

    private backup(): HTMLElement[] {
        const words = this.strings.settings;
        const file = h("input", null, { type: "file", accept: `${JSON_TYPE},.json`, hidden: "" });
        file.addEventListener("change", () => {
            const chosen = file.files?.[0];
            file.value = "";
            if (chosen) void this.importFile(chosen);
        });
        const exporter = button(this.icons, words.exportSettings, "tlg-button", () => {
            download(new Blob([serializeSettings(this.draft)], { type: JSON_TYPE }), SETTINGS_FILE);
        }, Icon.Download);
        const importer = button(this.icons, words.importSettings, "tlg-button", () => file.click(), Icon.Upload);
        const reset = button(this.icons, words.resetAll, "tlg-button tlg-button-danger", () => {
            this.draft = defaultSettings();
            this.theme = ThemeMode.Auto;
            this.show(this.tab);
            this.tell([words.resetDone]);
        }, Icon.Recover);
        return [
            section(words.backupHeading, words.backupHint, [h("div", "tlg-settings-actions", {}, [exporter, importer, file])]),
            section(words.resetHeading, words.resetHint, [h("div", "tlg-settings-actions", {}, [reset])])
        ];
    }

    private async importFile(file: File): Promise<void> {
        const words = this.strings.settings;
        let parsed: unknown;
        try {
            parsed = JSON.parse(await file.text());
        } catch {
            this.tell([words.importFailed], true);
            return;
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            this.tell([words.importFailed], true);
            return;
        }
        this.draft = parseSettings(parsed);
        this.show(this.tab);
        this.tell([words.imported]);
    }

    private async save(): Promise<void> {
        const words = this.strings.settings;
        if (!this.acknowledged) {
            const lines = await this.options.usage(this.draft);
            if (lines.length > 0) {
                this.acknowledged = true;
                this.submit.textContent = words.saveAnyway;
                this.tell([words.inUseWarning, ...lines], true);
                return;
            }
        }
        await this.options.save(this.draft, this.theme);
    }
}

/**
 * The settings dialog, ready to be placed in a backdrop.
 */
export function settingsDialog(options: SettingsDialogOptions): HTMLFormElement {
    return new SettingsDialog(options).element;
}
