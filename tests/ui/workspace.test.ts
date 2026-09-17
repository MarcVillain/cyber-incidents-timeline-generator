import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { NodeKind, RecordType, Representation, Side } from "../../src/core/enums.js";
import { BUILT_IN_RENDERERS } from "../../src/ui/renderers/index.js";
import { ColorScheme } from "../../src/ui/theme-detection.js";
import { mountTimeline, ThemeMode } from "../../src/ui/workspace.js";
import { installDom, syntheticEvent } from "../support/dom.js";
import { createIncident, createService, seededService } from "../support/fixtures.js";

const VIEW_PILL = ".tlg-view-pill";
const RECORD_ROW = ".tlg-record";
const START_X = 100;
const START_Y = 100;
const PAN_DISTANCE = 40;
const SETTLE_ROUNDS = 10;
const FIRST_STEP = "2026-01-12T08:00:00";
const SECOND_STEP = "2026-01-12T10:00:00";
const BETWEEN_STEPS = "2026-01-12T09:00:00";
const AFTER_LAST_STEP = "2026-01-12T11:00:00";
const PERSON_NAME = "Alice";
const EXPLOIT_NAME = "CVE-2026-0001";

async function settle(): Promise<void> {
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

function footButton(element: HTMLElement, text: string): HTMLButtonElement {
    const found = [...element.querySelectorAll<HTMLButtonElement>(".tlg-inspector-foot button")].find(button => button.textContent?.trim() === text);
    assert.ok(found, `The details panel has no "${text}" button`);
    return found;
}

function addMenuItem(element: HTMLElement, text: string): HTMLButtonElement {
    const found = [...element.querySelectorAll<HTMLButtonElement>(".tlg-addmenu-item")].find(button => button.textContent?.trim() === text);
    assert.ok(found, `The add menu has no "${text}" item`);
    return found;
}

function mountPoint(): HTMLElement {
    const element = document.createElement("div");
    document.body.appendChild(element);
    return element;
}

describe("mountTimeline", () => {
    before(() => {
        installDom();
    });

    it("builds the workspace, draws the diagram and cleans up after itself", async () => {
        const { service, incident } = await seededService();
        const element = mountPoint();
        const notices: string[] = [];
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, onNotify: message => notices.push(message) });

        assert.equal(element.querySelectorAll(VIEW_PILL).length, BUILT_IN_RENDERERS.length);
        assert.ok(element.querySelectorAll(RECORD_ROW).length > 10);
        assert.ok(element.querySelector(".tlg-canvas svg [data-step-id]"));

        handle.selectRepresentation(Representation.RelationshipGraph);
        assert.ok(element.querySelector(".tlg-canvas svg [data-node-id]"));

        handle.setTheme(ThemeMode.Dark);
        assert.equal(element.getAttribute("data-tlg-theme"), ThemeMode.Dark);
        assert.deepEqual(notices, []);

        handle.destroy();
        assert.equal(element.children.length, 0);
    });

    it("selects a record clicked on the canvas, outlines it and lets Escape clear it", async () => {
        const { service, incident } = await seededService();
        const element = mountPoint();
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null });
        const canvas = element.querySelector<HTMLElement>(".tlg-canvas");
        const step = element.querySelector(".tlg-canvas svg [data-step-id]");
        const stepId = step?.getAttribute("data-step-id");
        assert.ok(canvas && step && stepId);

        // A press that travels is a pan, not a click
        (step.querySelector("rect") ?? step).dispatchEvent(syntheticEvent("pointerdown", { clientX: START_X, clientY: START_Y }));
        canvas.dispatchEvent(syntheticEvent("pointerup", { clientX: START_X + PAN_DISTANCE, clientY: START_Y }));
        assert.equal(element.querySelector<HTMLElement>(".tlg-inspector")?.hidden, true);

        (element.querySelector(`.tlg-canvas svg [data-step-id="${stepId}"] rect`) ?? step).dispatchEvent(syntheticEvent("pointerdown", { clientX: START_X, clientY: START_Y }));
        canvas.dispatchEvent(syntheticEvent("pointerup", { clientX: START_X + 1, clientY: START_Y }));

        assert.equal(element.querySelector<HTMLElement>(".tlg-inspector")?.hidden, false);
        assert.equal(element.querySelector(".tlg-canvas svg .is-selected")?.getAttribute("data-step-id"), stepId);

        handle.select({ type: RecordType.Step, id: Number(stepId) });
        assert.equal(element.querySelector<HTMLElement>(".tlg-inspector")?.hidden, false);
        element.dispatchEvent(syntheticEvent("keydown", { key: "Escape" }));
        assert.equal(element.querySelector<HTMLElement>(".tlg-inspector")?.hidden, true);
        assert.equal(element.querySelector(".tlg-canvas svg .is-selected"), null);
        handle.destroy();
    });

    it("cycles the theme from the toolbar and remembers it", async () => {
        const { service, incident } = await seededService();
        const storage = new Map<string, string>();
        const preferences = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
        const first = mountPoint();
        const handle = await mountTimeline(first, { api: service, incidentId: incident.id, preferences });

        assert.equal(first.getAttribute("data-tlg-theme"), ColorScheme.Light);
        const toggle = [...first.querySelectorAll<HTMLButtonElement>(".tlg-button")].find(button => button.title.includes("switch to light"));
        assert.ok(toggle);
        toggle.click();
        assert.equal(first.getAttribute("data-tlg-theme"), ThemeMode.Light);
        toggle.click();
        assert.equal(first.getAttribute("data-tlg-theme"), ThemeMode.Dark);
        handle.destroy();

        const second = mountPoint();
        const again = await mountTimeline(second, { api: service, incidentId: incident.id, preferences, theme: ThemeMode.Light });
        assert.equal(second.getAttribute("data-tlg-theme"), ThemeMode.Dark);
        again.destroy();

        // Without the toggle the viewer has no way to change a remembered choice, so the host decides
        const hidden = mountPoint();
        const withoutToggle = await mountTimeline(hidden, { api: service, incidentId: incident.id, preferences, themeToggle: false, theme: ThemeMode.Light });
        assert.equal(hidden.getAttribute("data-tlg-theme"), ThemeMode.Light);
        assert.equal([...hidden.querySelectorAll<HTMLButtonElement>(".tlg-button")].some(button => button.title.includes("theme")), false);
        withoutToggle.destroy();
    });

    it("follows the theme of the page it sits in while the theme is automatic", async () => {
        const { service, incident } = await seededService();
        const element = mountPoint();
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null });
        const root = document.documentElement;

        root.setAttribute("data-theme", ColorScheme.Dark);
        await Promise.resolve();
        assert.equal(element.getAttribute("data-tlg-theme"), ColorScheme.Dark);

        root.setAttribute("data-theme", ColorScheme.Light);
        root.classList.add(ColorScheme.Dark);
        await Promise.resolve();
        assert.equal(element.getAttribute("data-tlg-theme"), ColorScheme.Light);

        root.removeAttribute("data-theme");
        await Promise.resolve();
        assert.equal(element.getAttribute("data-tlg-theme"), ColorScheme.Dark);
        root.classList.remove(ColorScheme.Dark);

        handle.setTheme(ThemeMode.Light);
        root.setAttribute("data-bs-theme", ColorScheme.Dark);
        await Promise.resolve();
        assert.equal(element.getAttribute("data-tlg-theme"), ColorScheme.Light);
        root.removeAttribute("data-bs-theme");
        handle.destroy();

        const custom = mountPoint();
        const detected = await mountTimeline(custom, { api: service, incidentId: incident.id, preferences: null, themeDetector: () => ColorScheme.Dark });
        assert.equal(custom.getAttribute("data-tlg-theme"), ColorScheme.Dark);
        detected.destroy();
    });

    it("asks in the details panel before deleting a record, without a browser dialog", async () => {
        const { service, incident } = await seededService();
        const element = mountPoint();
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null });
        const [step] = (await service.getDiagram(incident.id)).steps;
        assert.ok(step);
        handle.select({ type: RecordType.Step, id: step.id });

        footButton(element, "Delete").click();
        assert.ok(element.querySelector(".tlg-inspector-question")?.textContent?.includes(step.title));
        // Delete sat last in the footer, so the safe answer has to take that place
        assert.equal(element.querySelector(".tlg-inspector-foot button:last-child")?.textContent?.trim(), "Keep it");
        footButton(element, "Keep it").click();
        assert.equal(element.querySelector(".tlg-inspector-question"), null);
        assert.ok((await service.getDiagram(incident.id)).steps.some(candidate => candidate.id === step.id));

        footButton(element, "Delete").click();
        element.querySelector<HTMLButtonElement>(".tlg-inspector-delete-confirm")?.click();
        await settle();
        assert.equal((await service.getDiagram(incident.id)).steps.some(candidate => candidate.id === step.id), false);
        handle.destroy();
    });

    it("keeps both answers of a list deletion in one box, so moving between them does not cancel", async () => {
        const { service, incident } = await seededService();
        const element = mountPoint();
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null });
        const control = element.querySelector<HTMLElement>(".tlg-record-delete");
        assert.ok(control);

        control.querySelector<HTMLButtonElement>(".tlg-record-delete-trigger")?.click();
        assert.ok(control.classList.contains("is-asking"));
        const answers = control.querySelector(".tlg-record-delete-ask");
        assert.ok(answers?.querySelector(".tlg-record-delete-confirm") && answers.querySelector(".tlg-record-delete-cancel"));
        handle.destroy();
    });

    it("offers only what the permissions allow", async () => {
        const { service, incident } = await seededService();
        const element = mountPoint();
        const handle = await mountTimeline(element, {
            api: service,
            incidentId: incident.id,
            preferences: null,
            permissions: { canCreate: false, canEdit: false, canDelete: false }
        });

        assert.equal(element.querySelector(".tlg-add"), null);
        assert.equal(element.querySelector(".tlg-record-delete"), null);
        handle.destroy();
    });

    it("shows the empty state and saves records created from the rail", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const element = mountPoint();
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, renderers: BUILT_IN_RENDERERS.slice(0, 1) });

        assert.equal(element.querySelector<HTMLElement>(".tlg-empty")?.hidden, false);

        await service.createStep(incident.id, { title: "Seen from outside", timestamp: "2026-01-12T08:00" });
        await handle.reload();
        assert.equal(element.querySelector<HTMLElement>(".tlg-empty")?.hidden, true);
        assert.ok(element.querySelector(".tlg-canvas svg [data-step-id]"));
        handle.destroy();
    });

    it("adds a step right after the selected one, halfway to the next", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const first = await service.createStep(incident.id, { title: "First", timestamp: FIRST_STEP });
        const second = await service.createStep(incident.id, { title: "Second", timestamp: SECOND_STEP });
        const element = mountPoint();
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, renderers: BUILT_IN_RENDERERS.slice(0, 1) });
        const addStep = async (): Promise<string[]> => {
            element.querySelector<HTMLButtonElement>(".tlg-add")?.click();
            addMenuItem(element, "Step").click();
            await settle();
            const { steps } = await service.getDiagram(incident.id);
            return steps.map(step => step.timestamp);
        };

        handle.select({ type: RecordType.Step, id: first.id });
        assert.deepEqual(await addStep(), [FIRST_STEP, BETWEEN_STEPS, SECOND_STEP]);

        handle.select({ type: RecordType.Step, id: second.id });
        assert.deepEqual(await addStep(), [FIRST_STEP, BETWEEN_STEPS, SECOND_STEP, AFTER_LAST_STEP]);
        handle.destroy();
    });

    it("saves a record typed in the rail once the line is left, without waiting for Enter", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const element = mountPoint();
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, renderers: BUILT_IN_RENDERERS.slice(0, 1) });

        element.querySelector<HTMLButtonElement>(".tlg-add")?.click();
        addMenuItem(element, "Exploit").click();
        const input = element.querySelector<HTMLInputElement>(".tlg-quickadd input");
        assert.ok(input);
        input.value = EXPLOIT_NAME;
        input.dispatchEvent(syntheticEvent("blur"));
        await settle();

        const nodes = (await service.getDiagram(incident.id)).nodes;
        assert.deepEqual(nodes.map(node => [node.name, node.kind, node.side]), [[EXPLOIT_NAME, NodeKind.Exploit, Side.Attacker]]);
        handle.destroy();
    });

    it("keeps the kind and side of a record placed in a group when a relationship is added", async () => {
        const { service } = createService();
        const incident = await createIncident(service);
        const element = mountPoint();
        const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, renderers: BUILT_IN_RENDERERS.slice(0, 1) });
        const addRecord = async (kind: string, name: string): Promise<void> => {
            element.querySelector<HTMLButtonElement>(".tlg-add")?.click();
            addMenuItem(element, kind).click();
            const input = element.querySelector<HTMLInputElement>(".tlg-quickadd input");
            assert.ok(input);
            input.value = name;
            input.dispatchEvent(syntheticEvent("keydown", { key: "Enter" }));
            await settle();
        };

        await addRecord("Person", PERSON_NAME);
        await addRecord("Exploit", EXPLOIT_NAME);
        const created = (await service.getDiagram(incident.id)).nodes;
        const owner = created.find(node => node.name === PERSON_NAME);
        const exploit = created.find(node => node.name === EXPLOIT_NAME);
        assert.ok(owner && exploit);
        assert.equal(exploit.kind, NodeKind.Exploit);
        assert.equal(exploit.side, Side.Attacker);

        handle.select({ type: RecordType.Node, id: exploit.id });
        const belongsTo = [...element.querySelectorAll<HTMLElement>(".tlg-inspector .tlg-field")]
            .find(field => field.querySelector("label")?.textContent === "Belongs to")
            ?.querySelector<HTMLSelectElement>("select");
        assert.ok(belongsTo);
        belongsTo.value = String(owner.id);
        belongsTo.dispatchEvent(syntheticEvent("change"));
        await settle();

        element.querySelector<HTMLButtonElement>(".tlg-add")?.click();
        addMenuItem(element, "Relationship").click();
        await settle();

        const diagram = await service.getDiagram(incident.id);
        assert.equal(diagram.links.length, 1);
        const kept = diagram.nodes.find(node => node.id === exploit.id);
        assert.ok(kept);
        assert.equal(kept.parentId, owner.id);
        assert.equal(kept.kind, NodeKind.Exploit);
        assert.equal(kept.side, Side.Attacker);
        handle.destroy();
    });
});
