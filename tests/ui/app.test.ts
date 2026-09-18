import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { Impact } from "../../src/core/enums.js";
import { mountTimelineApp } from "../../src/ui/app.js";
import { ColorScheme } from "../../src/ui/theme-detection.js";
import { ThemeMode } from "../../src/ui/workspace.js";
import { chooseOption, fieldNamed, installDom, syntheticEvent } from "../support/dom.js";
import { createService, seededService } from "../support/fixtures.js";

const NEW_TITLE = "Phishing wave on finance";
const RENAMED = "Phishing wave on finance and legal";
const REFERENCE = "CASE-42";
const SETTLE_ROUNDS = 10;
const CRITICAL_LABEL = "Critical";

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
});
