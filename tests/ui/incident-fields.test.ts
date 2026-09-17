import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TimelineService } from "../../src/core/service.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { mountTimelineApp } from "../../src/ui/app.js";
import { IncidentFieldType, checkIncidentFields, fieldValue, withFieldValues, type IncidentFieldDef } from "../../src/ui/incident-fields.js";
import { installDom } from "../support/dom.js";

installDom();

const FIELDS: IncidentFieldDef[] = [
    { key: "ticket", label: "Ticket", type: IncidentFieldType.Text, onCreate: true },
    { key: "severity", label: "Severity", type: IncidentFieldType.Choice, choices: [{ value: "high", label: "High" }] },
    { key: "regulated", label: "Regulated", type: IncidentFieldType.Flag },
    { key: "affected", label: "People affected", type: IncidentFieldType.Number },
    { key: "reported_on", label: "Reported on", type: IncidentFieldType.Date }
];

describe("fields of the host's own", () => {
    it("refuses a declaration that cannot be rendered", () => {
        assert.throws(() => checkIncidentFields([{ key: "a", label: "A", type: IncidentFieldType.Choice }]));
        assert.throws(() => checkIncidentFields([FIELDS[0] as IncidentFieldDef, FIELDS[0] as IncidentFieldDef]));
        assert.throws(() => checkIncidentFields([{ key: " ", label: "A", type: IncidentFieldType.Text }]));
    });

    it("reads a value out of the metadata by type", () => {
        const metadata = { ticket: "INC-1", regulated: true, affected: 40, severity: "high" };
        assert.equal(fieldValue(metadata, FIELDS[0] as IncidentFieldDef), "INC-1");
        assert.equal(fieldValue(metadata, FIELDS[2] as IncidentFieldDef), true);
        assert.equal(fieldValue(metadata, FIELDS[3] as IncidentFieldDef), 40);
        assert.equal(fieldValue(null, FIELDS[0] as IncidentFieldDef), null);
    });

    it("leaves keys the host did not declare exactly as they were", () => {
        const merged = withFieldValues({ ticket: "INC-1", crudyId: "7f0c" }, new Map([["ticket", "INC-2"]]));
        assert.deepEqual(merged, { ticket: "INC-2", crudyId: "7f0c" });
    });

    it("clears a key rather than storing an empty one", () => {
        assert.deepEqual(withFieldValues({ ticket: "INC-1", keep: 1 }, new Map([["ticket", null]])), { keep: 1 });
        assert.equal(withFieldValues({ ticket: "INC-1" }, new Map([["ticket", ""]])), null);
    });

    it("asks only for the fields marked onCreate when an incident is opened", async () => {
        const service = new TimelineService(new MemoryTimelineStore());
        const element = document.createElement("div");
        document.body.append(element);
        const app = await mountTimelineApp(element, { api: service, incidentFields: FIELDS, syncAddress: false });

        element.querySelector<HTMLButtonElement>(".tlg-appbar-actions .tlg-button-primary")?.click();
        const labels = [...element.querySelectorAll(".tlg-dialog-backdrop label")].map(node => node.textContent ?? "");
        assert.ok(labels.includes("Ticket"), labels.join(" | "));
        assert.equal(labels.includes("Severity"), false, labels.join(" | "));
        app.destroy();
    });

    it("shows every declared field in the details of an incident", async () => {
        const service = new TimelineService(new MemoryTimelineStore());
        const incident = await service.createIncident({ title: "Incident", metadata: { ticket: "INC-9", affected: 12 } });
        const element = document.createElement("div");
        document.body.append(element);
        const app = await mountTimelineApp(element, { api: service, incidentId: incident.id, incidentFields: FIELDS, syncAddress: false });

        element.querySelector<HTMLButtonElement>(".tlg-appbar-incident .tlg-button")?.click();
        const labels = [...element.querySelectorAll(".tlg-dialog-backdrop label")].map(node => node.textContent ?? "");
        FIELDS.forEach(entry => assert.ok(labels.includes(entry.label), `${entry.label} missing from ${labels.join(" | ")}`));

        const values = [...element.querySelectorAll<HTMLInputElement>(".tlg-dialog-backdrop input")].map(node => node.value);
        assert.ok(values.includes("INC-9"), values.join(" | "));
        assert.ok(values.includes("12"), values.join(" | "));
        app.destroy();
    });
});
