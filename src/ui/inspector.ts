// The panel describing one record. Every control saves as soon as it is left.
//
// The panel is rebuilt when the selection changes and at no other time. An edit updates the record in
// place, so the other fields keep what was typed in them and the scroll position stays where it was.

import { impactLevelsOf } from "../core/catalog.js";
import { Involvement, RecordType, Side } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import type { DiagramLink, DiagramNode, LinkUpdateInput, NodeUpdateInput, StepUpdateInput } from "../core/models.js";
import { joinWallClock, splitWallClock } from "../core/time.js";
import type { Selection, TimelineStep } from "./diagram-store.js";
import { h } from "./dom.js";
import { button, checkbox, dateAndTime, field, recordSelect, row, select, tagsInput, textArea, textInput, type Choice } from "./forms.js";
import type { PanelContext } from "./panels.js";

type InspectedRecord =
    | { type: RecordType.Node; record: DiagramNode }
    | { type: RecordType.Step; record: TimelineStep }
    | { type: RecordType.Link; record: DiagramLink };

export class Inspector {
    private readonly root: HTMLElement;
    private readonly context: PanelContext;
    private shown: string | null = null;

    constructor(root: HTMLElement, context: PanelContext) {
        this.root = root;
        this.context = context;
    }

    private close(): void {
        this.shown = null;
        this.root.hidden = true;
        this.root.replaceChildren();
    }

    private find(selection: Selection): InspectedRecord | null {
        const { store } = this.context;
        switch (selection.type) {
            case RecordType.Node: {
                const record = store.node(selection.id);
                return record ? { type: RecordType.Node, record } : null;
            }
            case RecordType.Step: {
                const record = store.step(selection.id);
                return record ? { type: RecordType.Step, record } : null;
            }
            case RecordType.Link: {
                const record = store.link(selection.id);
                return record ? { type: RecordType.Link, record } : null;
            }
        }
    }

    /**
     * Rebuilds only when a different record is selected. Anything else would throw away the control the
     * analyst is working in.
     */
    render(): void {
        const selection = this.context.store.selection;
        const inspected = selection ? this.find(selection) : null;
        if (!selection || !inspected) {
            this.close();
            return;
        }

        const key = `${selection.type}:${selection.id}`;
        if (this.shown === key) {
            this.refreshTitle(inspected);
            return;
        }

        this.shown = key;
        this.root.hidden = false;
        this.root.replaceChildren(this.header(inspected), this.body(inspected), this.footer(inspected));
    }

    /**
     * Called when the records changed but the selection did not, so nothing is rebuilt.
     */
    refresh(): void {
        const selection = this.context.store.selection;
        const inspected = selection ? this.find(selection) : null;
        if (!inspected) {
            this.close();
            return;
        }
        this.refreshTitle(inspected);
    }

    private refreshTitle(inspected: InspectedRecord): void {
        const title = this.root.querySelector(".tlg-inspector-title");
        if (title) title.textContent = this.titleFor(inspected);
    }

    private titleFor(inspected: InspectedRecord): string {
        const { store } = this.context;
        switch (inspected.type) {
            case RecordType.Node:
                return inspected.record.name;
            case RecordType.Step:
                return inspected.record.title;
            case RecordType.Link:
                return `${store.node(inspected.record.sourceNodeId)?.name ?? "?"} to ${store.node(inspected.record.targetNodeId)?.name ?? "?"}`;
        }
    }

    private iconFor(inspected: InspectedRecord): string {
        const { store } = this.context;
        switch (inspected.type) {
            case RecordType.Node:
                return store.nodeIcon(inspected.record);
            case RecordType.Step:
                return store.stepIcon(inspected.record);
            case RecordType.Link:
                return Icon.Link;
        }
    }

    private sideOf(inspected: InspectedRecord): Side {
        if (inspected.type === RecordType.Link) {
            return this.context.store.node(inspected.record.sourceNodeId)?.side ?? Side.Unknown;
        }
        return inspected.record.side;
    }

    private header(inspected: InspectedRecord): HTMLDivElement {
        const { store, icons } = this.context;
        const badge = h("span", "tlg-record-icon", {}, [icons.element(this.iconFor(inspected))]);
        badge.style.background = `var(${store.sideInfo(this.sideOf(inspected)).colorToken})`;

        const close = button(icons, "", "tlg-button tlg-button-quiet", () => store.setSelection(null), Icon.Close);
        close.setAttribute("aria-label", this.context.strings.inspector.close);
        return h("div", "tlg-inspector-head", {}, [badge, h("div", "tlg-inspector-title", {}, [this.titleFor(inspected)]), close]);
    }

    private body(inspected: InspectedRecord): HTMLDivElement {
        const container = h("div", "tlg-inspector-body");
        if (!this.context.permissions.canEdit) {
            container.append(this.readOnly(inspected));
            return container;
        }
        switch (inspected.type) {
            case RecordType.Node:
                this.nodeFields(container, inspected.record);
                break;
            case RecordType.Step:
                this.stepFields(container, inspected.record);
                break;
            case RecordType.Link:
                this.linkFields(container, inspected.record);
                break;
        }
        return container;
    }

    private readOnly(inspected: InspectedRecord): HTMLDListElement {
        const { store } = this.context;
        const w = this.context.strings.inspector;
        const entries: [string, string | null][] = inspected.type === RecordType.Node
            ? [[w.kind, store.kindInfo(inspected.record.kind).label], [w.side, store.sideInfo(inspected.record.side).label], [w.identifier, inspected.record.identifier], [w.role, inspected.record.role], [w.notes, inspected.record.description]]
            : inspected.type === RecordType.Step
                ? [[w.when, this.context.time.formatMoment(inspected.record)], [w.side, store.sideInfo(inspected.record.side).label], [w.outcome, store.outcomeInfo(inspected.record.outcome).label], [w.notes, inspected.record.description]]
                : [[w.relationship, store.linkKindInfo(inspected.record.kind).label], [w.label, inspected.record.label], [w.confidence, inspected.record.confidence]];

        const list = h("dl", "tlg-readonly");
        entries.forEach(([label, value]) => {
            if (value) list.append(h("dt", null, {}, [label]), h("dd", null, {}, [value]));
        });
        return list;
    }

    private nodeFields(container: HTMLElement, node: DiagramNode): void {
        const { store, actions } = this.context;
        const w = this.context.strings.inspector;
        const save = (patch: NodeUpdateInput): void => actions.edit(node.id, { type: RecordType.Node, patch });
        const catalog = store.catalog;
        const kinds: Choice<typeof node.kind>[] = catalog.nodeKinds.map(entry => ({ value: entry.kind, label: entry.label }));
        const sides: Choice<Side>[] = catalog.sides.map(entry => ({ value: entry.side, label: entry.label }));
        const impacts: Choice<string>[] = impactLevelsOf(catalog.impactScale).map(entry => ({ value: entry.level, label: entry.label }));
        const others = store.nodes.filter(candidate => candidate.id !== node.id);

        container.append(
            field(w.name, textInput(node.name, value => { if (value) save({ name: value }); })),
            row(
                field(w.kind, select(node.kind, kinds, value => { if (value) save({ kind: value }); })),
                field(w.side, select(node.side, sides, value => { if (value) save({ side: value }); }))
            ),
            field(w.identifier, textInput(node.identifier, value => save({ identifier: value }), w.identifierHint)),
            field(w.role, textInput(node.role, value => save({ role: value }), w.roleHint)),
            row(
                field(w.belongsTo, recordSelect(node.parentId, others, value => save({ parentId: value }), { allowEmpty: true, emptyLabel: w.nothing })),
                field(w.criticality, select(node.criticality, impacts, value => { if (value) save({ criticality: value }); }))
            ),
            checkbox(w.compromised, node.compromised, value => save({ compromised: value })),
            field(w.notes, textArea(node.description, value => save({ description: value })))
        );
    }

    private stepFields(container: HTMLElement, step: TimelineStep): void {
        const { store, actions } = this.context;
        const w = this.context.strings.inspector;
        const save = (patch: StepUpdateInput): void => actions.edit(step.id, { type: RecordType.Step, patch });
        const catalog = store.catalog;
        const nodes = store.nodes;

        container.append(
            field(w.whatHappened, textInput(step.title, value => { if (value) save({ title: value }); })),
            field(w.when, dateAndTime(splitWallClock(step.at, step.timeKnown), value => {
                if (!value.date) return;
                save({ timestamp: joinWallClock(value.date, value.time), timeKnown: value.time !== null });
            }, this.context.strings.forms)),
            field(w.until, dateAndTime(splitWallClock(step.until, step.timeKnown), value => {
                save({ endTimestamp: value.date ? joinWallClock(value.date, value.time) : null });
            }, this.context.strings.forms)),
            row(
                field(w.side, select(step.side, catalog.sides.map(entry => ({ value: entry.side, label: entry.label })), value => { if (value) save({ side: value }); })),
                field(w.outcome, select(step.outcome, catalog.outcomes.map(entry => ({ value: entry.outcome, label: entry.label })), value => { if (value) save({ outcome: value }); }))
            ),
            row(
                field(w.performedBy, recordSelect(step.sourceNodeId, nodes, value => save({ sourceNodeId: value }), { allowEmpty: true, emptyLabel: w.nobodyRecorded })),
                field(w.performedOn, recordSelect(step.targetNodeId, nodes, value => save({ targetNodeId: value }), { allowEmpty: true, emptyLabel: w.nothingRecorded }))
            ),
            row(
                field(w.attackTactic, select(step.attackTactic, catalog.attackTactics.map(entry => ({ value: entry.tactic, label: entry.label })), value => { if (value) save({ attackTactic: value }); })),
                field(w.technique, textInput(step.mitreTechniqueId, value => save({ mitreTechniqueId: value }), w.techniqueHint))
            ),
            row(
                field(w.responsePhase, select(step.responsePhase, catalog.responsePhases.map(entry => ({ value: entry.phase, label: entry.label })), value => { if (value) save({ responsePhase: value }); })),
                field(w.severity, select(step.severity, impactLevelsOf(catalog.impactScale).map(entry => ({ value: entry.level, label: entry.label })), value => { if (value) save({ severity: value }); }))
            ),
            row(
                field(w.confidence, select(step.confidence, catalog.confidences, value => { if (value) save({ confidence: value }); })),
                field(w.audience, select(step.audience, catalog.audiences, value => { if (value) save({ audience: value }); }))
            ),
            field(w.evidenceSource, textInput(step.evidenceSource, value => save({ evidenceSource: value }), w.evidenceSourceHint)),
            checkbox(w.milestone, step.isMilestone, value => save({ isMilestone: value })),
            ...(catalog.milestones.length
                ? [field(w.namedMilestone, select(step.milestoneKey ?? "", catalog.milestones.map(entry => ({ value: entry.key, label: entry.label })), value => save({ milestoneKey: value || null }), { allowEmpty: true, emptyLabel: w.none }))]
                : []),
            field(w.tags, tagsInput(step.tags, value => save({ tags: value }), this.context.strings.forms)),
            field(w.notes, textArea(step.description, value => save({ description: value }), 4)),
            this.involvements(step)
        );
    }

    private involvements(step: TimelineStep): HTMLDivElement {
        const { store, actions, icons } = this.context;
        const list = h("div", "tlg-chips");
        const picker = h("div");
        const container = h("div", "tlg-field", {}, [h("label", null, {}, [this.context.strings.inspector.alsoInvolved]), list, picker]);

        const paint = (): void => {
            const current = store.step(step.id) ?? step;
            const save = (involvements: typeof current.involvements): void => {
                actions.edit(current.id, { type: RecordType.Step, patch: { involvements } });
                paint();
            };

            list.replaceChildren(...current.involvements.flatMap(involvement => {
                const node = store.node(involvement.nodeId);
                if (!node) return [];
                const remove = button(icons, "", "tlg-chip-remove", () => save(current.involvements.filter(entry => entry.nodeId !== involvement.nodeId)), Icon.Close);
                remove.setAttribute("aria-label", `Remove ${node.name}`);
                return [h("span", "tlg-chip", {}, [node.name, remove])];
            }));

            const taken = new Set(current.involvements.map(entry => entry.nodeId));
            const available = store.nodes.filter(node => !taken.has(node.id) && node.id !== current.sourceNodeId && node.id !== current.targetNodeId);
            picker.replaceChildren(recordSelect(null, available, value => {
                if (value !== null) save([...current.involvements, { nodeId: value, involvement: Involvement.Involved }]);
            }, { allowEmpty: true, emptyLabel: this.context.strings.inspector.addRecord }));
        };

        paint();
        return container;
    }

    private linkFields(container: HTMLElement, link: DiagramLink): void {
        const { store, actions } = this.context;
        const w = this.context.strings.inspector;
        const save = (patch: LinkUpdateInput): void => actions.edit(link.id, { type: RecordType.Link, patch });
        const nodes = store.nodes;

        container.append(
            row(
                field(w.from, recordSelect(link.sourceNodeId, nodes, value => { if (value !== null) save({ sourceNodeId: value }); })),
                field(w.to, recordSelect(link.targetNodeId, nodes, value => { if (value !== null) save({ targetNodeId: value }); }))
            ),
            field(w.relationship, select(link.kind, store.catalog.linkKinds.map(entry => ({ value: entry.kind, label: entry.label })), value => { if (value) save({ kind: value }); })),
            field(w.label, textInput(link.label, value => save({ label: value }), w.labelHint)),
            field(w.confidence, select(link.confidence, store.catalog.confidences, value => { if (value) save({ confidence: value }); }))
        );
    }

    /**
     * Close and Delete. Delete asks again in the panel rather than in a browser dialog, and the answer that
     * takes the place of the Delete button is Keep it, so a double click cannot delete.
     */
    private footer(inspected: InspectedRecord): HTMLDivElement {
        const { store, actions, permissions, icons } = this.context;
        const w = this.context.strings.inspector;
        const close = button(icons, w.close, "tlg-button", () => store.setSelection(null));
        const foot = h("div", "tlg-inspector-foot", {}, [close]);
        if (!permissions.canDelete) {
            return foot;
        }

        const remove = button(icons, w.delete, "tlg-button tlg-button-danger", () => showQuestion(), Icon.Trash);
        const keep = button(icons, w.keepIt, "tlg-button", () => showActions());
        const confirm = button(icons, w.delete, "tlg-button tlg-button-danger tlg-inspector-delete-confirm", () => void actions.remove(inspected.type, inspected.record.id), Icon.Trash);
        const question = h("p", "tlg-inspector-question", {}, [`Delete "${this.titleFor(inspected)}"? This cannot be undone.`]);

        const showActions = (): void => {
            foot.classList.remove("is-confirming");
            foot.replaceChildren(close, remove);
            remove.focus();
        };
        const showQuestion = (): void => {
            foot.classList.add("is-confirming");
            foot.replaceChildren(question, confirm, keep);
            keep.focus();
        };

        foot.append(remove);
        return foot;
    }
}
