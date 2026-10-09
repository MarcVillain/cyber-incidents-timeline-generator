import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { Impact, Side } from "../../src/core/enums.js";
import { ThemeToken } from "../../src/core/theme-token.js";
import type { KeyValueStorage } from "../../src/storage/browser-storage-store.js";
import { loadAppSettings, mountTimelineApp } from "../../src/ui/app.js";
import { CanvasMode } from "../../src/ui/canvas-mode.js";
import { SettingsScope, type AppSettings } from "../../src/ui/settings.js";
import { ColorScheme } from "../../src/ui/theme-detection.js";
import { ThemeMode } from "../../src/ui/workspace.js";
import { chooseOption, fieldNamed, installDom, syntheticEvent } from "../support/dom.js";
import { createService, seededService } from "../support/fixtures.js";

const NEW_TITLE = "Phishing wave on finance";
const RENAMED = "Phishing wave on finance and legal";
const REFERENCE = "CASE-42";
const SETTLE_ROUNDS = 10;
const CRITICAL_LABEL = "Critical";
const SETTINGS_BUTTON = "[aria-label=\"Settings\"]";
const PREFERENCE_KEY = "app-settings-test";
const RED = "#ff0000";
const SEARCHED_ICON = "skull";
const LEGAL = "Legal";
const LEGAL_KEY = "legal";
const THIRD_PARTY_LABEL = "Third party";

function memoryStorage(): KeyValueStorage {
    const entries = new Map<string, string>();
    return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } };
}

function openTab(form: HTMLElement, label: string): void {
    const tab = [...form.querySelectorAll<HTMLButtonElement>("[role=tab]")].find(node => node.textContent?.trim() === label);
    assert.ok(tab, `No tab reads "${label}"`);
    tab.click();
}

async function openSettings(root: HTMLElement): Promise<HTMLFormElement> {
    const button = root.querySelector<HTMLButtonElement>(`.tlg-appbar-actions ${SETTINGS_BUTTON}`);
    assert.ok(button);
    button.click();
    // The full settings read the catalog settings from the api before the dialog opens
    await settle();
    return dialog(root);
}

function mountPoint(): HTMLElement {
    const element = document.createElement("div");
    document.body.appendChild(element);
    return element;
}

async function settle(): Promise<void> {
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

function buttonNamed(root: ParentNode, text: string): HTMLButtonElement {
    const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === text && !button.hidden);
    assert.ok(found, `No button reads "${text}"`);
    return found;
}

function type(control: HTMLInputElement, value: string): void {
    control.value = value;
    control.dispatchEvent(syntheticEvent("change"));
}

function dialog(root: HTMLElement): HTMLFormElement {
    const form = root.querySelector<HTMLFormElement>(".tlg-dialog");
    assert.ok(form);
    return form;
}

describe("mountTimelineApp", () => {
    before(() => {
        installDom();
    });

    beforeEach(() => {
        document.documentElement.removeAttribute("data-theme");
    });

    it("opens the first incident from the empty page with only a title", async () => {
        const { service } = createService();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: null });

        assert.equal(element.querySelector<HTMLElement>(".tlg-app-empty")?.hidden, false);
        assert.equal(app.timeline, null);

        const quick = element.querySelector<HTMLFormElement>(".tlg-app-quick");
        const title = quick?.querySelector("input");
        assert.ok(quick && title);
        title.value = NEW_TITLE;
        quick.dispatchEvent(syntheticEvent("submit"));
        await settle();

        const [incident] = await service.listIncidents();
        assert.equal(incident?.title, NEW_TITLE);
        assert.equal(element.querySelector<HTMLElement>(".tlg-app-empty")?.hidden, true);
        assert.ok(app.timeline);
        assert.equal(element.querySelector(".tlg-appbar-picker .tlg-combo-label")?.textContent, NEW_TITLE);
        app.destroy();
        assert.equal(element.children.length, 0);
    });

    it("edits the details of the open incident and deletes it after a confirmation", async () => {
        const { service, incident } = await seededService();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: null });

        buttonNamed(element, "Details").click();
        const form = dialog(element);
        const [title, reference] = form.querySelectorAll<HTMLInputElement>("input.tlg-input");
        assert.ok(title && reference);
        type(title, RENAMED);
        type(reference, REFERENCE);
        chooseOption(fieldNamed(form, "Impact"), CRITICAL_LABEL);
        form.dispatchEvent(syntheticEvent("submit"));
        await settle();

        const saved = await service.getIncident(incident.id);
        assert.equal(saved.title, RENAMED);
        assert.equal(saved.referenceId, REFERENCE);
        assert.equal(saved.impact, Impact.Critical);
        assert.equal(element.querySelector<HTMLElement>(".tlg-dialog-backdrop")?.hidden, true);
        assert.equal(element.querySelector(".tlg-appbar-picker .tlg-combo-label")?.textContent, `${REFERENCE}, ${RENAMED}`);

        buttonNamed(element, "Details").click();
        buttonNamed(element, "Delete").click();
        assert.ok(await service.getIncident(incident.id));
        // Delete sat first in the footer, so the safe answer has to take that place
        assert.equal(element.querySelector(".tlg-dialog-confirm > :first-child")?.textContent?.trim(), "Keep it");
        buttonNamed(element, "Delete the incident and its timeline").click();
        await settle();

        assert.equal((await service.listIncidents()).some(candidate => candidate.id === incident.id), false);
        app.destroy();
    });

    it("keeps the dialog open and says why when the incident is refused", async () => {
        const { service } = createService();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: null });

        buttonNamed(element, "New incident").click();
        dialog(element).dispatchEvent(syntheticEvent("submit"));
        await settle();

        const error = element.querySelector<HTMLElement>(".tlg-dialog-error");
        assert.equal(error?.hidden, false);
        assert.ok(error?.textContent?.includes("title"));
        assert.deepEqual(await service.listIncidents(), []);
        app.destroy();
    });

    it("only browses incidents when managing them is turned off", async () => {
        const { service } = await seededService();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: null, manageIncidents: false });

        const labels = [...element.querySelectorAll(".tlg-appbar button")].map(button => button.textContent?.trim());
        assert.equal(labels.includes("New incident"), false);
        assert.equal(labels.includes("Details"), false);
        assert.ok(app.timeline);
        app.destroy();
    });

    it("sets the theme of the whole page, which the app and the workspace follow", async () => {
        const { service } = await seededService();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: null });
        const workspace = element.querySelector(".tlg");
        assert.ok(workspace);

        app.setTheme(ThemeMode.Dark);
        await settle();
        assert.equal(document.documentElement.getAttribute("data-theme"), ColorScheme.Dark);
        assert.equal(element.getAttribute("data-tlg-theme"), ColorScheme.Dark);
        assert.equal(workspace.getAttribute("data-tlg-theme"), ColorScheme.Dark);

        app.setTheme(ThemeMode.Auto);
        await settle();
        assert.equal(document.documentElement.hasAttribute("data-theme"), false);
        assert.equal(workspace.getAttribute("data-tlg-theme"), ColorScheme.Light);
        app.destroy();
    });

    it("offers settings only when asked, beside the theme toggle", async () => {
        const { service } = await seededService();
        const plain = mountPoint();
        const app = await mountTimelineApp(plain, { api: service, syncAddress: false, preferences: null });
        assert.equal(plain.querySelector(SETTINGS_BUTTON), null);
        app.destroy();

        const element = mountPoint();
        const custom = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: null, settingsButton: true });
        const tabs = [...(await openSettings(element)).querySelectorAll("[role=tab]")].map(tab => tab.textContent?.trim());
        assert.deepEqual(tabs, ["Appearance", "Vocabulary", "Display", "Privacy", "Backup"]);
        custom.destroy();

        const full = mountPoint();
        const everything = await mountTimelineApp(full, { api: service, syncAddress: false, preferences: null, settingsButton: true, settingsScope: SettingsScope.Everything });
        const all = [...(await openSettings(full)).querySelectorAll("[role=tab]")].map(tab => tab.textContent?.trim());
        assert.deepEqual(all, ["Appearance", "Vocabulary", "Scales", "Display", "Privacy", "Backup"]);
        everything.destroy();
    });

    it("keeps saved settings, applies the colours and tells the host", async () => {
        const { service } = await seededService();
        const storage = memoryStorage();
        const saved: AppSettings[] = [];
        const element = mountPoint();
        const app = await mountTimelineApp(element, {
            api: service, syncAddress: false, preferences: storage, preferenceKey: PREFERENCE_KEY, settingsButton: true,
            onSettingsSaved: settings => saved.push(settings)
        });

        const form = await openSettings(element);
        const accent = form.querySelector<HTMLInputElement>("input.tlg-color");
        assert.ok(accent);
        type(accent, RED);
        openTab(form, "Display");
        chooseOption(fieldNamed(form, "Layout"), "One long page");
        form.dispatchEvent(syntheticEvent("submit"));
        await settle();

        const stored = loadAppSettings(storage, PREFERENCE_KEY);
        assert.equal(stored.canvasMode, CanvasMode.Continuous);
        assert.equal(stored.colors[ColorScheme.Light][ThemeToken.Accent], RED);
        assert.equal(saved.length, 1);
        assert.equal(element.querySelector<HTMLElement>(".tlg-dialog-backdrop")?.hidden, true);
        assert.ok(element.querySelector("style")?.textContent?.includes(`${ThemeToken.Accent}: ${RED}`));
        app.destroy();
    });

    it("finds an icon by searching and flags two parties drawn with it", async () => {
        const { service } = await seededService();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: memoryStorage(), preferenceKey: PREFERENCE_KEY, settingsButton: true });

        const form = await openSettings(element);
        openTab(form, "Vocabulary");
        const [first, second] = form.querySelectorAll<HTMLElement>(".tlg-vocabulary-entry");
        assert.ok(first && second);
        first.querySelector<HTMLButtonElement>("[aria-expanded]")?.click();
        const search = first.querySelector<HTMLInputElement>(".tlg-icon-panel input");
        assert.ok(search);
        search.value = SEARCHED_ICON;
        search.dispatchEvent(syntheticEvent("input"));
        const shown = [...first.querySelectorAll<HTMLButtonElement>(".tlg-icon-choice")].filter(choice => !choice.hidden);
        assert.deepEqual(shown.map(choice => choice.getAttribute("aria-label")), [SEARCHED_ICON]);
        shown[0]?.click();

        const again = form.querySelectorAll<HTMLElement>(".tlg-vocabulary-entry")[1];
        again?.querySelector<HTMLButtonElement>("[aria-expanded]")?.click();
        const match = [...(again?.querySelectorAll<HTMLButtonElement>(".tlg-icon-choice") ?? [])].find(choice => choice.getAttribute("aria-label") === SEARCHED_ICON);
        match?.click();
        assert.equal(form.querySelectorAll(".tlg-settings-clash").length, 2);
        app.destroy();
    });

    it("keeps the advanced settings of an entry behind its own button, and opens them for a new entry", async () => {
        const { service } = await seededService();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: memoryStorage(), preferenceKey: PREFERENCE_KEY, settingsButton: true, settingsScope: SettingsScope.Everything });
        const form = await openSettings(element);
        openTab(form, "Vocabulary");
        const shown = (): number => [...form.querySelectorAll<HTMLElement>(".tlg-vocabulary-details")].filter(panel => !panel.hidden).length;
        assert.equal(shown(), 0);

        const advanced = form.querySelector<HTMLButtonElement>("[aria-label=\"Advanced settings of Attacker\"]");
        assert.ok(advanced);
        advanced.click();
        assert.equal(shown(), 1);
        assert.equal(form.querySelector("[aria-label=\"Advanced settings of Attacker\"]")?.getAttribute("aria-expanded"), "true");

        const adder = form.querySelector<HTMLInputElement>(".tlg-settings-adder input");
        assert.ok(adder);
        adder.value = "Insider";
        adder.dispatchEvent(syntheticEvent("keydown", { key: "Enter" }));
        assert.equal(shown(), 2);
        app.destroy();
    });

    it("adds an audience to its list and keeps the whole list", async () => {
        const { service } = await seededService();
        const storage = memoryStorage();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: storage, preferenceKey: PREFERENCE_KEY, settingsButton: true, settingsScope: SettingsScope.Everything });

        const form = await openSettings(element);
        openTab(form, "Vocabulary");
        chooseOption(fieldNamed(form, "List"), "Audiences");
        const adder = form.querySelector<HTMLInputElement>(".tlg-settings-adder input");
        assert.ok(adder);
        adder.value = LEGAL;
        adder.dispatchEvent(syntheticEvent("keydown", { key: "Enter" }));
        form.dispatchEvent(syntheticEvent("submit"));
        await settle();

        const audiences = (await service.getCatalogSettings()).vocabulary.audiences;
        assert.deepEqual(audiences?.map(entry => entry.value), ["Executive", "Technical", LEGAL_KEY]);
        app.destroy();
    });

    it("warns before removing a party records still use, and puts a list back as it came", async () => {
        const { service } = await seededService();
        const storage = memoryStorage();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: storage, preferenceKey: PREFERENCE_KEY, settingsButton: true, settingsScope: SettingsScope.Everything });

        const form = await openSettings(element);
        openTab(form, "Vocabulary");
        const entryNamed = (label: string): HTMLElement | undefined => [...form.querySelectorAll<HTMLElement>(".tlg-vocabulary-entry")]
            .find(entry => entry.querySelector<HTMLInputElement>("input.tlg-input")?.value === label);
        const unknown = entryNamed("Unknown")?.querySelector<HTMLButtonElement>("[aria-label=Remove]");
        assert.equal(unknown?.disabled, true);
        entryNamed(THIRD_PARTY_LABEL)?.querySelector<HTMLButtonElement>("[aria-label=Remove]")?.click();
        assert.equal(entryNamed(THIRD_PARTY_LABEL), undefined);

        form.dispatchEvent(syntheticEvent("submit"));
        await settle();
        assert.ok(form.querySelector(".tlg-settings-note")?.textContent?.includes(`${THIRD_PARTY_LABEL}: `));

        buttonNamed(form, "Reset this list").click();
        assert.ok(entryNamed(THIRD_PARTY_LABEL));
        form.dispatchEvent(syntheticEvent("submit"));
        await settle();
        const sides = (await service.getCatalogSettings()).vocabulary.sides;
        assert.equal(sides, undefined);
        assert.ok((await service.getCatalog()).sides.some(entry => entry.side === Side.ThirdParty));
        app.destroy();
    });

    it("hands the vocabulary an earlier release kept in the browser over to the service", async () => {
        const { service } = await seededService();
        const storage = memoryStorage();
        const audiences = [...(await service.getCatalog()).audiences, { value: LEGAL_KEY, label: LEGAL }];
        storage.setItem(`${PREFERENCE_KEY}-settings`, JSON.stringify({ vocabulary: { audiences } }));
        const app = await mountTimelineApp(mountPoint(), { api: service, syncAddress: false, preferences: storage, preferenceKey: PREFERENCE_KEY, settingsButton: true, settingsScope: SettingsScope.Everything });

        assert.deepEqual((await service.getCatalogSettings()).vocabulary.audiences?.map(entry => entry.value), audiences.map(entry => entry.value));
        assert.deepEqual(loadAppSettings(storage, PREFERENCE_KEY).vocabulary, {});
        app.destroy();
    });

    it("warns before removing an impact level records still use", async () => {
        const { service, incident } = await seededService();
        await service.updateIncident(incident.id, { impact: Impact.Critical });
        const storage = memoryStorage();
        const element = mountPoint();
        const app = await mountTimelineApp(element, { api: service, syncAddress: false, preferences: storage, preferenceKey: PREFERENCE_KEY, settingsButton: true, settingsScope: SettingsScope.Everything });

        const form = await openSettings(element);
        openTab(form, "Scales");
        const critical = [...form.querySelectorAll(".tlg-settings-item")].find(item => item.querySelector<HTMLInputElement>("input.tlg-input")?.value === CRITICAL_LABEL);
        const remove = critical?.querySelector<HTMLButtonElement>("[aria-label=Remove]");
        assert.ok(remove);
        remove.click();
        form.dispatchEvent(syntheticEvent("submit"));
        await settle();

        assert.ok(form.querySelector(".tlg-settings-note")?.textContent?.includes(`${CRITICAL_LABEL}: `));
        assert.equal(buttonNamed(form, "Save anyway").type, "submit");
        assert.equal(loadAppSettings(storage, PREFERENCE_KEY).impactScale, null);

        form.dispatchEvent(syntheticEvent("submit"));
        await settle();
        const levels = (await service.getCatalogSettings()).impactScale?.levels.map(level => level.level);
        assert.ok(levels && !levels.includes(Impact.Critical));
        assert.equal((await service.getIncident(incident.id)).impact, Impact.Critical);
        app.destroy();
    });
});
