import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RecordType } from "../../src/core/enums.js";
import { Access, RecordAction, type TimelinePermissions } from "../../src/ui/panels.js";
import { mountTimeline } from "../../src/ui/workspace.js";
import { installDom } from "../support/dom.js";
import { seededService } from "../support/fixtures.js";

installDom();

async function mounted(permissions: Partial<TimelinePermissions>) {
    const { service, incident } = await seededService();
    const element = document.createElement("div");
    document.body.append(element);
    const handle = await mountTimeline(element, { api: service, incidentId: incident.id, preferences: null, permissions });
    return { handle, element };
}

describe("Access", () => {
    it("allows everything when the host says nothing", () => {
        const access = new Access();
        assert.equal(access.canExport, true);
        assert.equal(access.canMove, true);
        assert.equal(access.mayCreate(RecordType.Step), true);
    });

    it("follows canEdit for moving unless told otherwise", () => {
        assert.equal(new Access({ canEdit: false }).canMove, false);
        assert.equal(new Access({ canEdit: false, canMove: true }).canMove, true);
        assert.equal(new Access({ canEdit: true, canMove: false }).canMove, false);
    });

    it("asks per record only once the flag allows the action", () => {
        const asked: string[] = [];
        const access = new Access({
            canDelete: false,
            can: (action, type) => {
                asked.push(`${action}:${type}`);
                return true;
            }
        });

        assert.equal(access.mayDelete(RecordType.Node), false);
        assert.equal(asked.length, 0);
        assert.equal(access.mayCreate(RecordType.Node), true);
        assert.deepEqual(asked, [`${RecordAction.Create}:${RecordType.Node}`]);
    });

    it("expresses may add steps, may not delete records", () => {
        const access = new Access({ can: (action, type) => !(action === RecordAction.Delete && type === RecordType.Node) });
        assert.equal(access.mayCreate(RecordType.Step), true);
        assert.equal(access.mayDelete(RecordType.Step), true);
        assert.equal(access.mayDelete(RecordType.Node), false);
    });
});

describe("what the workspace offers", () => {
    it("leaves the export menu out when exporting is refused", async () => {
        const allowed = await mounted({});
        assert.ok(allowed.element.querySelector(".tlg-menu"));
        allowed.handle.destroy();

        const refused = await mounted({ canExport: false });
        assert.equal(refused.element.querySelector(".tlg-menu"), null);
        refused.handle.destroy();
    });

    it("offers only the record kinds the host allows creating", async () => {
        const { handle, element } = await mounted({ can: (action, type) => !(action === RecordAction.Create && type === RecordType.Node) });
        element.querySelector<HTMLButtonElement>(".tlg-add")?.click();

        const labels = [...element.querySelectorAll(".tlg-addmenu-item")].map(node => node.textContent ?? "");
        assert.ok(labels.length > 0);
        assert.equal(labels.some(label => label.includes("Person")), false);
        handle.destroy();
    });
});
