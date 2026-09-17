// The list of records and the way new ones get in. Adding is meant to cost one click and one line of
// typing: pick a kind, type a name, and either press Enter or leave the line.

import type { NodeKindInfo } from "../core/catalog.js";
import { LinkKind, NodeCategory, NodeKind, RecordType, Side } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import type { DiagramLink, DiagramNode, RecordId } from "../core/models.js";
import { formatWallClock, millisecondsFromHours, momentBetween } from "../core/time.js";
import type { TimelineStep } from "./diagram-store.js";
import { h } from "./dom.js";
import type { PanelContext, PendingRecord } from "./panels.js";
import { canDrop } from "./rail-drag.js";

/**
 * The side a new record most likely belongs to, so the common case needs no correction afterwards.
 */
const DEFAULT_SIDES: ReadonlyMap<NodeKind, Side> = new Map([
    [NodeKind.ThreatActor, Side.Attacker],
    [NodeKind.Vendor, Side.ThirdParty],
    [NodeKind.Authority, Side.ThirdParty],
    [NodeKind.Malware, Side.Attacker],
    [NodeKind.Tool, Side.Attacker],
    [NodeKind.Exploit, Side.Attacker],
    [NodeKind.C2Server, Side.Attacker]
]);

const MENU_MARGIN = 8;
const MENU_OFFSET = 6;
const BLUR_GRACE_MS = 120;
const HOURS_AFTER_LAST_STEP = 1;

export interface RailElements {
    list: HTMLElement;
    search: HTMLInputElement;
    stats: HTMLElement;
    addButton: HTMLButtonElement | null;
    addMenu: HTMLElement;
}

interface RowDescription {
    type: RecordType;
    id: RecordId;
    icon: string;
    side: Side;
    name: string;
    meta: string;
    child: boolean;
}

export class Rail {
    private readonly elements: RailElements;
    private readonly context: PanelContext;
    private query = "";
    private pending: PendingRecord | null = null;
    private dragging: RecordId | null = null;
    private pendingInput: HTMLInputElement | null = null;

    constructor(elements: RailElements, context: PanelContext) {
        this.elements = elements;
        this.context = context;
        const { signal } = context;

        elements.search.addEventListener("input", () => {
            this.query = elements.search.value.trim().toLowerCase();
            this.render();
        }, { signal });

        if (elements.addButton) {
            elements.addButton.addEventListener("click", event => {
                event.stopPropagation();
                this.toggleMenu();
            }, { signal });
            document.addEventListener("click", event => {
                if (!elements.addMenu.hidden && event.target instanceof Node && !elements.addMenu.contains(event.target)) {
                    this.closeMenu();
                }
            }, { signal });
            document.addEventListener("keydown", event => {
                if (event.key === "Escape") this.closeMenu();
            }, { signal });
        }
    }

    private matches(value: string | null): boolean {
        return !this.query || (value ?? "").toLowerCase().includes(this.query);
    }

    render(): void {
        const { store } = this.context;
        const fragment = document.createDocumentFragment();
        const words = this.context.strings.rail;
        const nodes = store.nodes;
        const containers = nodes.filter(node => nodes.some(candidate => candidate.parentId === node.id));
        const containerIds = new Set(containers.map(node => node.id));
        const loose = (category: NodeCategory): DiagramNode[] => nodes.filter(node => node.category === category && !containerIds.has(node.id) && node.parentId === null);

        this.appendGroup(fragment, words.groups, containers.filter(node => this.nodeMatches(node)), container => [
            this.nodeRow(container, false),
            ...nodes.filter(node => node.parentId === container.id).map(member => this.nodeRow(member, true))
        ]);
        this.appendGroup(fragment, words.parties, loose(NodeCategory.Actor).filter(node => this.nodeMatches(node)), node => [this.nodeRow(node, false)], true);
        this.appendGroup(fragment, words.resources, loose(NodeCategory.Resource).filter(node => this.nodeMatches(node)), node => [this.nodeRow(node, false)], true);
        this.appendGroup(fragment, words.steps, store.steps.filter(step => this.matches(step.title) || this.matches(step.description)), step => [this.stepRow(step)]);
        this.appendGroup(fragment, words.relationships, store.links.filter(link => this.linkMatches(link)), link => [this.linkRow(link)]);

        if (this.pending) {
            fragment.append(this.quickAddRow(this.pending));
        }

        this.elements.list.replaceChildren(fragment);
        this.renderStats();
        this.pendingInput?.focus();
    }

    private nodeMatches(node: DiagramNode): boolean {
        return this.matches(node.name) || this.matches(node.identifier);
    }

    private linkMatches(link: DiagramLink): boolean {
        const { store } = this.context;
        return this.matches(store.node(link.sourceNodeId)?.name ?? null) || this.matches(store.node(link.targetNodeId)?.name ?? null);
    }

    private appendGroup<TRecord>(fragment: DocumentFragment, label: string, records: readonly TRecord[], rowsFor: (record: TRecord) => HTMLElement[], topLevel = false): void {
        if (records.length === 0) return;
        const title = h("div", "tlg-group-title", {}, [label, h("span", "tlg-count", {}, [String(records.length)])]);
        // The headings of the two record categories are where a record goes to leave the group it is in
        if (topLevel) this.makeDropTarget(title, null);
        fragment.append(title);
        records.forEach(record => rowsFor(record).forEach(row => fragment.append(row)));
    }

    private badge(icon: string, side: Side): HTMLSpanElement {
        const badge = h("span", "tlg-record-icon", {}, [this.context.icons.element(icon)]);
        badge.style.background = `var(${this.context.store.sideInfo(side).colorToken})`;
        return badge;
    }

    private row(description: RowDescription): HTMLDivElement {
        const { store, permissions, signal } = this.context;
        const { type, id } = description;

        // Not a button, because the delete control is one and a button cannot live inside another
        const node = h("div", description.child ? "tlg-record tlg-record-child" : "tlg-record", { role: "button", tabindex: "0" }, [
            this.badge(description.icon, description.side),
            h("span", "tlg-record-body", {}, [
                h("span", "tlg-record-name", {}, [description.name]),
                h("span", "tlg-record-meta", {}, [description.meta])
            ])
        ]);

        const selection = store.selection;
        if (selection && selection.type === type && selection.id === id) {
            node.classList.add("is-selected");
        }
        if (permissions.mayDelete(type)) {
            node.append(this.deleteControl(node, type, id, description.name));
        }

        node.addEventListener("click", event => {
            if (event.target instanceof Element && event.target.closest(".tlg-record-delete")) return;
            store.setSelection({ type, id });
        }, { signal });
        node.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            store.setSelection({ type, id });
        }, { signal });

        if (type === RecordType.Node) {
            this.makeDraggable(node, id);
            this.makeDropTarget(node, id);
        }
        return node;
    }

    /**
     * Records are carried by their row. Only records: a step and a relationship belong to the incident
     * rather than to anything in it, so there is nowhere to drop them.
     */
    private makeDraggable(row: HTMLElement, id: RecordId): void {
        if (!this.context.permissions.mayEdit(RecordType.Node)) return;
        const { signal } = this.context;

        row.setAttribute("draggable", "true");
        row.addEventListener("dragstart", event => {
            this.dragging = id;
            row.classList.add("is-dragging");
            event.dataTransfer?.setData("text/plain", String(id));
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        }, { signal });
        row.addEventListener("dragend", () => {
            this.dragging = null;
            row.classList.remove("is-dragging");
            this.clearDropMarks();
        }, { signal });
    }

    /**
     * A record dropped on another belongs to it, which is what makes the other a group. A record dropped
     * on a section heading belongs to nobody and goes back to its category. A drop the service would
     * refuse is not offered: the row never lights up and the browser shows no drop cursor.
     */
    private makeDropTarget(target: HTMLElement, id: RecordId | null): void {
        if (!this.context.permissions.mayEdit(RecordType.Node)) return;
        const { signal } = this.context;

        target.addEventListener("dragover", event => {
            if (!this.mayDropOn(id)) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            target.classList.add("is-drop-target");
        }, { signal });
        target.addEventListener("dragleave", () => target.classList.remove("is-drop-target"), { signal });
        target.addEventListener("drop", event => {
            if (!this.mayDropOn(id)) return;
            event.preventDefault();
            const moved = this.dragging;
            this.dragging = null;
            this.clearDropMarks();
            if (moved !== null) {
                this.context.actions.edit(moved, { type: RecordType.Node, patch: { parentId: id } });
            }
        }, { signal });
    }

    private mayDropOn(target: RecordId | null): boolean {
        return this.dragging !== null && canDrop(this.context.store.nodes, this.dragging, target);
    }

    private clearDropMarks(): void {
        this.elements.list.querySelectorAll(".is-drop-target").forEach(node => node.classList.remove("is-drop-target"));
    }

    /**
     * A bin that shows up when the pointer is over the row and asks again once clicked. The way out appears
     * right under the cursor and the confirmation beside it, so a double click cannot delete.
     *
     * The question closes when the pointer leaves the row rather than the control: the two answers sit
     * where the bin was, so reaching for either one means leaving the few pixels the bin occupied.
     */
    private deleteControl(row: HTMLElement, type: RecordType, id: RecordId, name: string): HTMLSpanElement {
        const { icons, actions } = this.context;
        const holder = h("span", "tlg-record-delete");
        const control = (className: string, label: string, icon: Icon): HTMLButtonElement =>
            h("button", className, { type: "button", title: label, "aria-label": label }, [icons.element(icon)]);

        const bin = control("tlg-record-delete-trigger", `Delete ${name}`, Icon.Trash);
        const confirm = control("tlg-record-delete-confirm", `Confirm deleting ${name}`, Icon.Check);
        const cancel = control("tlg-record-delete-cancel", this.context.strings.rail.keepIt, Icon.Close);
        const reset = (): void => holder.classList.remove("is-asking");

        bin.addEventListener("click", () => {
            this.elements.list.querySelectorAll(".tlg-record-delete.is-asking").forEach(other => {
                if (other !== holder) other.classList.remove("is-asking");
            });
            holder.classList.add("is-asking");
        });
        confirm.addEventListener("click", () => {
            reset();
            void actions.remove(type, id);
        });
        cancel.addEventListener("click", reset);
        row.addEventListener("mouseleave", reset, { signal: this.context.signal });

        holder.append(bin, h("span", "tlg-record-delete-ask", {}, [confirm, cancel]));
        return holder;
    }

    private nodeRow(node: DiagramNode, child: boolean): HTMLDivElement {
        const { store } = this.context;
        const meta = [store.kindInfo(node.kind).label, node.identifier ?? node.role].filter(Boolean).join(" - ");
        return this.row({ type: RecordType.Node, id: node.id, icon: store.nodeIcon(node), side: node.side, name: node.name, meta, child });
    }

    private stepRow(step: TimelineStep): HTMLDivElement {
        const { store } = this.context;
        const meta = [this.context.time.formatDateTime(step.at), store.node(step.sourceNodeId)?.name ?? null].filter(Boolean).join(" - ");
        return this.row({ type: RecordType.Step, id: step.id, icon: store.stepIcon(step), side: step.side, name: step.title, meta, child: false });
    }

    private linkRow(link: DiagramLink): HTMLDivElement {
        const { store } = this.context;
        const source = store.node(link.sourceNodeId);
        const target = store.node(link.targetNodeId);
        const name = `${source?.name ?? "?"} to ${target?.name ?? "?"}`;
        return this.row({
            type: RecordType.Link, id: link.id, icon: Icon.Link, side: source?.side ?? Side.Unknown,
            name, meta: link.label ?? store.linkKindInfo(link.kind).label, child: false
        });
    }

    private renderStats(): void {
        const { store } = this.context;
        this.elements.stats.replaceChildren(
            h("span", null, {}, [`${store.nodes.length} records`]),
            h("span", null, {}, [`${store.steps.length} steps`]),
            h("span", null, {}, [`${store.links.length} links`])
        );
    }

    private toggleMenu(): void {
        if (this.elements.addMenu.hidden) {
            this.openMenu();
        } else {
            this.closeMenu();
        }
    }

    openMenu(): void {
        const { addMenu, addButton } = this.elements;
        addMenu.replaceChildren(this.menuContent());
        addMenu.hidden = false;

        // The menu is fixed to the viewport, so a button near an edge would push it off screen
        const anchor = (addButton ?? addMenu.parentElement ?? document.body).getBoundingClientRect();
        const menu = addMenu.getBoundingClientRect();
        const left = Math.max(MENU_MARGIN, Math.min(anchor.left, window.innerWidth - menu.width - MENU_MARGIN));
        const below = anchor.bottom + MENU_OFFSET;
        const top = below + menu.height + MENU_MARGIN <= window.innerHeight ? below : Math.max(MENU_MARGIN, anchor.top - MENU_OFFSET - menu.height);

        addMenu.style.left = `${left}px`;
        addMenu.style.top = `${top}px`;
        addButton?.setAttribute("aria-expanded", "true");
    }

    private closeMenu(): void {
        this.elements.addMenu.hidden = true;
        this.elements.addButton?.setAttribute("aria-expanded", "false");
    }

    private menuContent(): DocumentFragment {
        const { store } = this.context;
        const fragment = document.createDocumentFragment();
        const words = this.context.strings.rail;

        const permissions = this.context.permissions;
        const whatHappened = [
            permissions.mayCreate(RecordType.Step) ? this.menuTile(Icon.Timeline, words.step, () => void this.beginStep()) : null,
            permissions.mayCreate(RecordType.Link) ? this.menuTile(Icon.Link, words.relationship, () => void this.beginLink()) : null
        ].filter((tile): tile is HTMLButtonElement => tile !== null);

        if (whatHappened.length > 0) {
            fragment.append(h("div", "tlg-addmenu-section", {}, [words.whatHappened]));
            fragment.append(h("div", "tlg-addmenu-grid", {}, whatHappened));
        }

        if (!permissions.mayCreate(RecordType.Node)) return fragment;

        [NodeCategory.Actor, NodeCategory.Resource].forEach(category => {
            fragment.append(h("div", "tlg-addmenu-section", {}, [category === NodeCategory.Actor ? words.partiesHint : words.resources]));
            fragment.append(h("div", "tlg-addmenu-grid", {}, store.catalog.nodeKinds
                .filter(kind => kind.category === category)
                .map(kind => this.menuTile(kind.icon, kind.label, () => this.beginNode(kind)))));
        });
        return fragment;
    }

    private menuTile(icon: string, label: string, onClick: () => void): HTMLButtonElement {
        const node = h("button", "tlg-addmenu-item", { type: "button", role: "menuitem" }, [this.context.icons.element(icon), label]);
        node.addEventListener("click", onClick);
        return node;
    }

    private beginNode(kind: NodeKindInfo): void {
        this.closeMenu();
        this.pending = { kind };
        this.render();
    }

    private async beginStep(): Promise<void> {
        this.closeMenu();
        const id = await this.context.actions.create({
            type: RecordType.Step,
            input: { title: this.context.strings.rail.newStep, timestamp: formatWallClock(this.newStepMoment()), side: Side.Attacker }
        });
        if (id !== null) this.context.store.setSelection({ type: RecordType.Step, id });
    }

    /**
     * A step added while another is selected lands right after it, halfway to the one that follows.
     */
    private newStepMoment(): Date {
        const { store } = this.context;
        const selection = store.selection;
        const selected = selection?.type === RecordType.Step ? store.step(selection.id) : null;
        if (!selected?.at) return new Date();

        const next = store.steps.at(store.steps.indexOf(selected) + 1);
        return next?.at
            ? momentBetween(selected.at, next.at)
            : new Date(selected.at.getTime() + millisecondsFromHours(HOURS_AFTER_LAST_STEP));
    }

    private async beginLink(): Promise<void> {
        this.closeMenu();
        const [first, second] = this.context.store.nodes;
        if (!first || !second) {
            this.context.actions.notify(this.context.strings.rail.needTwoRecords);
            return;
        }
        const id = await this.context.actions.create({
            type: RecordType.Link,
            input: { sourceNodeId: first.id, targetNodeId: second.id, kind: LinkKind.ConnectsTo }
        });
        if (id !== null) this.context.store.setSelection({ type: RecordType.Link, id });
    }

    private quickAddRow(pending: PendingRecord): HTMLDivElement {
        const input = h("input", "tlg-input", { type: "text", placeholder: `${pending.kind.label} name`, "aria-label": `${pending.kind.label} name` });
        const cancel = (): void => {
            this.pending = null;
            this.pendingInput = null;
            this.render();
        };

        // Clearing the line first means a blur following an Enter finds nothing left to save twice
        const save = (): boolean => {
            const name = input.value.trim();
            if (!name) return false;
            input.value = "";
            void this.context.actions.create({
                type: RecordType.Node,
                input: { name, kind: pending.kind.kind, side: DEFAULT_SIDES.get(pending.kind.kind) ?? Side.Victim }
            });
            return true;
        };

        input.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                // Removing the line blurs it, and that blur must not save what Escape threw away
                input.value = "";
                cancel();
                return;
            }
            if (event.key !== "Enter") return;
            // One record per trip through the menu. Enter finishes the line rather than opening another,
            // because a reader who wants a second one says so by picking a kind again.
            save();
            cancel();
        });
        input.addEventListener("blur", () => {
            save();
            window.setTimeout(() => {
                if (this.pending && document.activeElement !== input) cancel();
            }, BLUR_GRACE_MS);
        });

        const badge = h("span", "tlg-record-icon tlg-record-icon-pending", {}, [this.context.icons.element(pending.kind.icon)]);
        this.pendingInput = input;
        return h("div", "tlg-quickadd", {}, [badge, input]);
    }
}
