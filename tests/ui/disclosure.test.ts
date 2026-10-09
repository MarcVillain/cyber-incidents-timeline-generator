import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CENSOR_GLYPH, defaultPrivacyRules, foldTerm, type PrivacyRules } from "../../src/core/anonymize.js";
import { Disclosure, NodeKind, RecordType, Representation, Side } from "../../src/core/enums.js";
import type { RecordId } from "../../src/core/models.js";
import { TimelineService } from "../../src/core/service.js";
import type { KeyValueStorage } from "../../src/storage/browser-storage-store.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { ExportFormat } from "../../src/ui/export.js";
import { DEFAULT_STRINGS } from "../../src/ui/strings.js";
import { mountTimeline, type TimelineHandle, type TimelineOptions } from "../../src/ui/workspace.js";
import { installDom } from "../support/dom.js";

const PERSON = "Alice Martin";
const COMPANY = "Acme Corp";
const NEAR_MISS = "Acme Crop";
const MAIL = "alice@acme-corp.example";
const TIMESTAMP = "2026-01-12T08:00";
const PERSON_ALIAS = "Person-1";
const PREFERENCE_KEY = "disclosure-test";

class MapStorage implements KeyValueStorage {
    readonly entries = new Map<string, string>();

    getItem(key: string): string | null {
        return this.entries.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.entries.set(key, value);
    }
}

interface Mounted {
    handle: TimelineHandle;
    element: HTMLElement;
    personId: RecordId;
}

async function mounted(options: Partial<TimelineOptions> = {}): Promise<Mounted> {
    installDom();
    const service = new TimelineService(new MemoryTimelineStore());
    const incident = await service.createIncident({ title: "Phishing" });
    const alice = await service.createNode(incident.id, { name: PERSON, kind: NodeKind.Person, side: Side.Victim });
    await service.createNode(incident.id, { name: COMPANY, kind: NodeKind.Company, side: Side.Victim });
    await service.createStep(incident.id, { title: `${PERSON} opens the attachment`, timestamp: TIMESTAMP, description: `Sent from ${MAIL}`, sourceNodeId: alice.id });
    await service.createStep(incident.id, { title: `Invoice signed by ${NEAR_MISS}`, timestamp: TIMESTAMP });
    const element = document.createElement("div");
    document.body.append(element);
    const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, ...options });
    handle.selectRepresentation(Representation.Narrative);
    return { handle, element, personId: alice.id };
}

function canvasText(element: HTMLElement): string {
    return element.querySelector(".tlg-canvas")?.textContent ?? "";
}

function railText(element: HTMLElement): string {
    return element.querySelector(".tlg-rail-list")?.textContent ?? "";
}

function press(element: HTMLElement, control: string): void {
    const found = element.querySelector(`[data-control="${control}"]`);
    assert.ok(found instanceof HTMLElement, `no control ${control}`);
    found.click();
}

/** Runs an export and hands back the text of the file it wrote. */
async function exported(handle: TimelineHandle, format: ExportFormat): Promise<string> {
    const original = URL.createObjectURL;
    const written: Blob[] = [];
    URL.createObjectURL = (blob: Blob): string => {
        written.push(blob);
        return original.call(URL, blob);
    };
    try {
        await handle.exportAs(format);
    } finally {
        URL.createObjectURL = original;
    }
    const file = written[0];
    assert.ok(file);
    return file.text();
}

describe("disclosure of names", () => {
    it("masks the views, not the records, and offers the choice beside the audience", async () => {
        const { handle, element } = await mounted();
        assert.ok(canvasText(element).includes(PERSON));

        press(element, `filter-disclosure:${Disclosure.Anonymized}`);
        assert.equal(handle.state.filters.disclosure, Disclosure.Anonymized);
        assert.ok(!canvasText(element).includes(PERSON));
        assert.ok(!canvasText(element).includes(MAIL));
        assert.ok(canvasText(element).includes(PERSON_ALIAS));
        assert.ok(railText(element).includes(PERSON));

        press(element, `filter-disclosure:${Disclosure.Censored}`);
        assert.ok(canvasText(element).includes(CENSOR_GLYPH));
        assert.ok(!canvasText(element).includes(PERSON_ALIAS));

        press(element, "reset");
        assert.equal(handle.state.filters.disclosure, Disclosure.Full);
        assert.ok(canvasText(element).includes(PERSON));
        handle.destroy();
    });

    it("remembers the mode chosen", async () => {
        const storage = new MapStorage();
        const first = await mounted({ preferences: storage, preferenceKey: PREFERENCE_KEY });
        first.handle.setFilters({ disclosure: Disclosure.Censored });
        first.handle.destroy();

        const second = await mounted({ preferences: storage, preferenceKey: PREFERENCE_KEY });
        assert.equal(second.handle.state.filters.disclosure, Disclosure.Censored);
        second.handle.destroy();
    });

    it("keeps a mode the host locked, whatever is asked later", async () => {
        const { handle, element } = await mounted({ disclosureLock: Disclosure.Censored });
        assert.equal(element.querySelector("[data-control^=\"filter-disclosure:\"]"), null);
        assert.ok(element.textContent?.includes(DEFAULT_STRINGS.privacy.lockedHint));
        handle.setFilters({ disclosure: Disclosure.Full });
        assert.equal(handle.state.filters.disclosure, Disclosure.Censored);
        assert.ok(!canvasText(element).includes(PERSON));
        handle.destroy();
    });

    it("masks the list and the details when asked, and leaves them read only", async () => {
        const privacy: PrivacyRules = { ...defaultPrivacyRules(), maskPanels: true };
        const { handle, element, personId } = await mounted({ privacy });
        handle.setFilters({ disclosure: Disclosure.Anonymized });
        assert.ok(!railText(element).includes(PERSON));
        assert.equal(element.querySelector<HTMLButtonElement>(".tlg-add")?.hidden, true);
        assert.equal(element.querySelector(".tlg-record-delete"), null);

        element.querySelector<HTMLElement>(".tlg-rail-list .tlg-record")?.click();
        assert.equal(handle.state.selection?.type, RecordType.Node);
        handle.select({ type: RecordType.Node, id: personId });
        const details = element.querySelector(".tlg-inspector");
        assert.ok(details?.querySelector(".tlg-readonly"));
        assert.ok(!details?.textContent?.includes(PERSON));
        assert.equal(details?.querySelector("input"), null);
        handle.destroy();
    });

    it("reveals a name and settles a possible mention, handing the rules to the host", async () => {
        const kept: PrivacyRules[] = [];
        const { handle, element } = await mounted({ onPrivacyChange: rules => kept.push(rules) });
        handle.setFilters({ disclosure: Disclosure.Anonymized });
        assert.ok(canvasText(element).includes(NEAR_MISS));

        press(element, `possible-mention:${foldTerm(NEAR_MISS)}:mask`);
        assert.deepEqual(kept.at(-1)?.confirmed, [NEAR_MISS]);
        assert.ok(!canvasText(element).includes(NEAR_MISS));

        press(element, `protected-name:${foldTerm(PERSON)}`);
        assert.deepEqual(kept.at(-1)?.revealedTerms, [foldTerm(PERSON)]);
        assert.ok(canvasText(element).includes(PERSON));
        handle.destroy();
    });

    it("writes a masked timeline file while names are masked, and says so", async () => {
        const notes: string[] = [];
        const { handle } = await mounted({ onNotify: message => notes.push(message) });
        assert.ok((await exported(handle, ExportFormat.Document)).includes(PERSON));

        handle.setFilters({ disclosure: Disclosure.Anonymized });
        const masked = await exported(handle, ExportFormat.Document);
        assert.ok(!masked.includes(PERSON));
        assert.ok(!masked.includes(MAIL));
        assert.ok(masked.includes(PERSON_ALIAS));
        assert.deepEqual(notes, [DEFAULT_STRINGS.privacy.exportWarning]);

        const table = await exported(handle, ExportFormat.Csv);
        assert.ok(!table.includes(PERSON));
        handle.destroy();
    });
});
