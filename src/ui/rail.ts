// The list of records and the way new ones get in. Adding is meant to cost one click and one line of
// typing: pick a kind, type a name, press Enter, and the next empty line is already waiting.

import type { NodeKindInfo } from "../core/catalog.js";
import { LinkKind, NodeCategory, NodeKind, RecordType, Side } from "../core/enums.js";
import { Icon } from "../core/icon.js";
import type { DiagramLink, DiagramNode, RecordId } from "../core/models.js";
import { formatDateTime, formatWallClock, millisecondsFromHours, momentBetween } from "../core/time.js";
import type { TimelineStep } from "./diagram-store.js";
import { h } from "./dom.js";
import type { PanelContext, PendingRecord } from "./panels.js";

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
        const nodes = store.nodes;
        const containers = nodes.filter(node => nodes.some(candidate => candidate.parentId === node.id));
        const containerIds = new Set(containers.map(node => node.id));
        const loose = (category: NodeCategory): DiagramNode[] => nodes.filter(node => node.category === category && !containerIds.has(node.id) && node.parentId === null);

        this.appendGroup(fragment, "Groups", containers.filter(node => this.nodeMatches(node)), container => [
            this.nodeRow(container, false),
            ...nodes.filter(node => node.parentId === container.id).map(member => this.nodeRow(member, true))
        ]);
        this.appendGroup(fragment, "Parties", loose(NodeCategory.Actor).filter(node => this.nodeMatches(node)), node => [this.nodeRow(node, false)]);
        this.appendGroup(fragment, "Resources", loose(NodeCategory.Resource).filter(node => this.nodeMatches(node)), node => [this.nodeRow(node, false)]);
        this.appendGroup(fragment, "Steps", store.steps.filter(step => this.matches(step.title) || this.matches(step.description)), step => [this.stepRow(step)]);
        this.appendGroup(fragment, "Relationships", store.links.filter(link => this.linkMatches(link)), link => [this.linkRow(link)]);

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

    private appendGroup<TRecord>(fragment: DocumentFragment, label: string, records: readonly TRecord[], rowsFor: (record: TRecord) => HTMLElement[]): void {
        if (records.length === 0) return;
        fragment.append(h("div", "tlg-group-title", {}, [label, h("span", "tlg-count", {}, [String(records.length)])]));
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
        if (permissions.canDelete) {
            node.append(this.deleteControl(type, id, description.name));
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
        return node;
    }

    /**
     * A bin that shows up when the pointer is over the row and asks again once clicked. The way out appears
     * right under the cursor and the confirmation beside it, so a double click cannot delete.
     */
    private deleteControl(type: RecordType, id: RecordId, name: string): HTMLSpanElement {
        const { icons, actions } = this.context;
        const holder = h("span", "tlg-record-delete");
        const control = (className: string, label: string, icon: Icon): HTMLButtonElement =>
            h("button", className, { type: "button", title: label, "aria-label": label }, [icons.element(icon)]);

        const bin = control("tlg-record-delete-trigger", `Delete ${name}`, Icon.Trash);
        const confirm = control("tlg-record-delete-confirm", `Confirm deleting ${name}`, Icon.Check);
        const cancel = control("tlg-record-delete-cancel", "Keep it", Icon.Close);
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
        holder.addEventListener("mouseleave", reset);

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
        const meta = [formatDateTime(step.at), store.node(step.sourceNodeId)?.name ?? null].filter(Boolean).join(" - ");
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

        fragment.append(h("div", "tlg-addmenu-section", {}, ["What happened"]));
        fragment.append(h("div", "tlg-addmenu-grid", {}, [
            this.menuTile(Icon.Timeline, "Step", () => void this.beginStep()),
            this.menuTile(Icon.Link, "Relationship", () => void this.beginLink())
        ]));

        [NodeCategory.Actor, NodeCategory.Resource].forEach(category => {
            fragment.append(h("div", "tlg-addmenu-section", {}, [category === NodeCategory.Actor ? "People and organisations" : "Resources"]));
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
            input: { title: "New step", timestamp: formatWallClock(this.newStepMoment()), side: Side.Attacker }
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
            this.context.actions.notify("Add at least two records before linking them.");
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
            if (!save()) cancel();
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
