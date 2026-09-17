import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Involvement, NodeKind, Representation, Side } from "../../src/core/enums.js";
import type { StepRecord } from "../../src/core/models.js";
import type { TimelineStore } from "../../src/core/store.js";
import { readIncidentCreate, readLinkCreate, readNodeCreate, readStepCreate } from "../../src/core/validation.js";

const TIMESTAMP = "2026-01-12T08:00:00";

export interface StoreContractOptions {
    /** False for stores whose incidents live in an outside system that cannot join a local transaction. */
    transactionalIncidents?: boolean;
}

/**
 * What every implementation of the persistence port has to honour. Each store runs the same cases.
 */
export function runStoreContract(name: string, createStore: () => Promise<TimelineStore>, options: StoreContractOptions = {}): void {
    describe(`${name} honours the store contract`, () => {
        it("round trips an incident with its classifications", async () => {
            const store = await createStore();
            const incident = await store.insertIncident(readIncidentCreate({ title: "Incident", classifications: ["A", "B"], referenceId: "REF-1" }));
            assert.deepEqual(await store.findIncident(incident.id), incident);

            await store.updateIncident({ ...incident, title: "Renamed", classifications: ["C"] });
            const updated = await store.findIncident(incident.id);
            assert.equal(updated?.title, "Renamed");
            assert.deepEqual(updated?.classifications, ["C"]);
            assert.equal((await store.listIncidents()).length, 1);
        });

        it("round trips the host metadata of every record", async () => {
            const store = await createStore();
            const bag = { crudyId: "7f0c", nested: { depth: 2 }, list: [1, 2] };
            const incident = await store.insertIncident(readIncidentCreate({ title: "Incident", metadata: bag }));
            const node = await store.insertNode({ ...readNodeCreate({ name: "Clerk", kind: NodeKind.Person, metadata: bag }), incidentId: incident.id, canonicalKey: null });
            const step = await store.insertStep({ ...readStepCreate({ title: "Step", timestamp: TIMESTAMP, externalId: "ticket-8", metadata: bag }), incidentId: incident.id });
            const link = await store.insertLink({ ...readLinkCreate({ sourceNodeId: node.id, targetNodeId: node.id, metadata: bag }), incidentId: incident.id });

            assert.deepEqual((await store.findIncident(incident.id))?.metadata, bag);
            assert.deepEqual((await store.findNode(node.id))?.metadata, bag);
            assert.deepEqual((await store.findStep(step.id))?.metadata, bag);
            assert.equal((await store.findStep(step.id))?.externalId, "ticket-8");
            assert.deepEqual((await store.findLink(link.id))?.metadata, bag);

            await store.updateStep({ ...step, metadata: null });
            assert.equal((await store.findStep(step.id))?.metadata, null);
        });

        it("round trips records, steps and links", async () => {
            const store = await createStore();
            const incident = await store.insertIncident(readIncidentCreate({ title: "Incident" }));
            const node = await store.insertNode({ ...readNodeCreate({ name: "Clerk", kind: NodeKind.Person, compromised: true }), incidentId: incident.id, canonicalKey: "Person:clerk" });
            const step = await store.insertStep({
                ...readStepCreate({ title: "Step", timestamp: TIMESTAMP, tags: ["one", "two"], involvements: [{ nodeId: node.id, involvement: Involvement.Target }] }),
                incidentId: incident.id
            });
            const link = await store.insertLink({ ...readLinkCreate({ sourceNodeId: node.id, targetNodeId: node.id, stepId: step.id }), incidentId: incident.id });

            assert.deepEqual(await store.findNode(node.id), node);
            assert.deepEqual(await store.findStep(step.id), step);
            assert.deepEqual(await store.findLink(link.id), link);
            assert.deepEqual(await store.listNodes(incident.id), [node]);
            assert.deepEqual(await store.listSteps(incident.id), [step]);
            assert.deepEqual(await store.listLinks(incident.id), [link]);

            const changed: StepRecord = { ...step, side: Side.Attacker, tags: ["three"], involvements: [] };
            await store.updateStep(changed);
            assert.deepEqual(await store.findStep(step.id), changed);

            await store.updateNode({ ...node, name: "Renamed" });
            assert.equal((await store.findNode(node.id))?.name, "Renamed");
        });

        it("hands out copies that do not write back", async () => {
            const store = await createStore();
            const incident = await store.insertIncident(readIncidentCreate({ title: "Incident" }));
            const found = await store.findIncident(incident.id);
            found?.classifications.push("Leaked");
            assert.deepEqual((await store.findIncident(incident.id))?.classifications, []);
        });

        it("replaces a layout and removes it", async () => {
            const store = await createStore();
            const incident = await store.insertIncident(readIncidentCreate({ title: "Incident" }));
            const node = await store.insertNode({ ...readNodeCreate({ name: "Box", kind: NodeKind.Server }), incidentId: incident.id, canonicalKey: null });

            await store.saveLayout({ nodeId: node.id, representation: Representation.RelationshipGraph, x: 1, y: 2 });
            await store.saveLayout({ nodeId: node.id, representation: Representation.RelationshipGraph, x: 3, y: 4 });
            assert.deepEqual(await store.listLayouts(incident.id), [{ nodeId: node.id, representation: Representation.RelationshipGraph, x: 3, y: 4 }]);

            await store.deleteLayout(node.id, Representation.RelationshipGraph);
            assert.deepEqual(await store.listLayouts(incident.id), []);
        });

        it("deletes an incident with everything in it", async () => {
            const store = await createStore();
            const incident = await store.insertIncident(readIncidentCreate({ title: "Incident" }));
            const parent = await store.insertNode({ ...readNodeCreate({ name: "Company", kind: NodeKind.Company }), incidentId: incident.id, canonicalKey: null });
            const child = await store.insertNode({ ...readNodeCreate({ name: "Clerk", kind: NodeKind.Person, parentId: parent.id }), incidentId: incident.id, canonicalKey: null });
            const step = await store.insertStep({ ...readStepCreate({ title: "Step", timestamp: TIMESTAMP, sourceNodeId: child.id }), incidentId: incident.id });
            await store.insertLink({ ...readLinkCreate({ sourceNodeId: parent.id, targetNodeId: child.id, stepId: step.id }), incidentId: incident.id });
            await store.saveLayout({ nodeId: child.id, representation: Representation.RelationshipGraph, x: 1, y: 1 });

            await store.deleteIncident(incident.id);

            assert.equal(await store.findIncident(incident.id), null);
            assert.equal(await store.findNode(child.id), null);
            assert.equal(await store.findStep(step.id), null);
            assert.deepEqual(await store.listLinks(incident.id), []);
            assert.deepEqual(await store.listLayouts(incident.id), []);
        });

        it("rolls a failed transaction back", { skip: options.transactionalIncidents === false }, async () => {
            const store = await createStore();
            await assert.rejects(store.transaction(async () => {
                await store.insertIncident(readIncidentCreate({ title: "Doomed" }));
                throw new Error("abort");
            }), /abort/);
            assert.deepEqual(await store.listIncidents(), []);
        });

        it("keeps a nested transaction inside its parent", async () => {
            const store = await createStore();
            await store.transaction(async () => {
                await store.insertIncident(readIncidentCreate({ title: "Kept" }));
                await assert.rejects(store.transaction(async () => {
                    throw new Error("inner");
                }), /inner/);
            });
            assert.equal((await store.listIncidents()).length, 1);
        });
    });
}
