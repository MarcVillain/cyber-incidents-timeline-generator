// How far the compromise travelled. Rings are hops away from the first thing that fell, so the picture
// answers the question everyone asks first: how much of the estate did they reach.

import { Representation, Side } from "../../core/enums.js";
import type { DiagramNode, RecordId } from "../../core/models.js";
import { fitText } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import type { DiagramStore } from "../diagram-store.js";
import { circle, group, line, rect, text, truncate } from "../svg.js";
import type { Palette } from "../theme.js";
import { defineRenderer, type RenderContext } from "./registry.js";

const NODE_RADIUS = 21;
// The ring that marks the orb under the pointer, or the one selected. It sits outside the disc so the
// name below it is left alone.
const RING_GAP = 4;
const MAX_RINGS = 4;
const ORIGIN_RADIUS = 40;
const INNER_RADIUS = 60;

interface BlastPage {
    origin: DiagramNode | null;
    rings: DiagramNode[][];
    compromised: number;
    total: number;
}

interface Spot {
    x: number;
    y: number;
    member: DiagramNode;
    unreached: boolean;
    labelAbove: boolean;
}

function patientZero(store: DiagramStore, nodes: readonly DiagramNode[]): DiagramNode | null {
    const firstAttack = store.steps.find(step => step.side === Side.Attacker && step.targetNodeId !== null);
    const target = firstAttack ? nodes.find(node => node.id === firstAttack.targetNodeId) : undefined;
    return target
        ?? nodes.find(node => node.compromised)
        ?? nodes.find(node => node.side === Side.Victim)
        ?? nodes[0]
        ?? null;
}

/**
 * Breadth first walk from patient zero over both the standing relationships and the moves the attacker
 * made, because a compromise spreads along either.
 */
function computeHops(store: DiagramStore, nodes: readonly DiagramNode[]): { origin: DiagramNode | null; hops: Map<RecordId, number> } {
    const adjacency = new Map<RecordId, Set<RecordId>>(nodes.map(node => [node.id, new Set<RecordId>()]));
    const connect = (a: RecordId | null, b: RecordId | null): void => {
        if (a === null || b === null) return;
        const fromA = adjacency.get(a);
        const fromB = adjacency.get(b);
        if (!fromA || !fromB) return;
        fromA.add(b);
        fromB.add(a);
    };

    store.links.forEach(link => connect(link.sourceNodeId, link.targetNodeId));
    store.steps.forEach(step => connect(step.sourceNodeId, step.targetNodeId));
    nodes.forEach(node => connect(node.id, node.parentId));

    const origin = patientZero(store, nodes);
    const hops = new Map<RecordId, number>();
    if (!origin) return { origin: null, hops };

    hops.set(origin.id, 0);
    let frontier = [origin.id];
    for (let depth = 1; depth <= MAX_RINGS && frontier.length > 0; depth += 1) {
        const next: RecordId[] = [];
        frontier.forEach(id => {
            adjacency.get(id)?.forEach(neighbour => {
                if (hops.has(neighbour)) return;
                hops.set(neighbour, depth);
                next.push(neighbour);
            });
        });
        frontier = next;
    }

    nodes.forEach(node => {
        if (!hops.has(node.id)) hops.set(node.id, MAX_RINGS);
    });
    return { origin, hops };
}

/**
 * The links and the moves the attacker made, drawn only between records that are both on the page. One
 * line, one meaning: telling a link from a step apart here would need a key nobody reads.
 */
function connections(store: DiagramStore, palette: Palette, placed: ReadonlyMap<RecordId, Spot>): SVGGElement {
    const node = group();
    const drawn = new Set<string>();

    const edge = (fromId: RecordId | null, toId: RecordId | null): void => {
        if (fromId === null || toId === null) return;
        const from = placed.get(fromId);
        const to = placed.get(toId);
        const key = fromId < toId ? `${fromId}-${toId}` : `${toId}-${fromId}`;
        if (!from || !to || drawn.has(key)) return;
        drawn.add(key);
        node.appendChild(line(from.x, from.y, to.x, to.y, { stroke: palette.borderStrong, "stroke-width": 1.2, opacity: 0.4 }));
    };

    store.links.forEach(link => edge(link.sourceNodeId, link.targetNodeId));
    store.steps.forEach(step => edge(step.sourceNodeId, step.targetNodeId));
    return node;
}

/**
 * Drawn invisible and lit by the stylesheet, so the mark travels with the orb and an exported drawing
 * carries no selection of its own.
 */
function selectionRing(palette: Palette, x: number, y: number, radius: number): SVGCircleElement {
    return circle(x, y, radius, { class: "tlg-orb-ring", fill: "none", stroke: palette.accent, "stroke-width": 2, opacity: 0 });
}

function orb(context: RenderContext, spot: Spot): SVGGElement {
    const { palette, icons, store } = context;
    const { member, x, y } = spot;
    const color = spot.unreached
        ? palette.borderStrong
        : (member.compromised ? palette.sides[Side.Attacker].color : palette.sides[Side.Victim].color);
    const name = fitText(member.name, 116, { size: 9.5, minSize: 7 });

    return group({ class: "tlg-node tlg-orb", "data-node-id": member.id }, [
        selectionRing(palette, x, y, NODE_RADIUS + RING_GAP),
        circle(x, y, NODE_RADIUS, { fill: palette.surface, stroke: color, "stroke-width": member.compromised ? 2.5 : 1.5 }),
        icons.draw(store.nodeIcon(member), x, y, 16, color),
        text(name.text, x, spot.labelAbove ? y - NODE_RADIUS - 6 : y + NODE_RADIUS + 11, { "font-size": name.size, "text-anchor": "middle", fill: palette.ink })
    ]);
}

export const blastRadius = defineRenderer<BlastPage>({
    representation: Representation.BlastRadius,

    pages(context) {
        const nodes = context.store.visibleNodes();
        const { origin, hops } = computeHops(context.store, nodes);
        if (!origin) return [{ origin: null, rings: [], compromised: 0, total: 0 }];

        const rings = Array.from({ length: MAX_RINGS + 1 }, (_, depth) => nodes.filter(node => hops.get(node.id) === depth && node.id !== origin.id));
        return [{ origin, rings, compromised: nodes.filter(node => node.compromised).length, total: nodes.length }];
    },

    draw(context, page, pageIndex, pageCount) {
        const { store, palette, icons } = context;
        const words = context.strings.scene;
        const attacker = palette.sides[Side.Attacker].color;

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: page.origin ? `${page.compromised} of ${page.total} records marked compromised` : null,
            legend: [
                { label: words.compromised, color: attacker },
                { label: words.reachedNotCompromised, color: palette.sides[Side.Victim].color },
                { label: words.untouched, color: palette.borderStrong },
                { label: words.recordedRelationship, color: palette.border }
            ]
        });

        const origin = page.origin;
        if (!origin) {
            content.appendChild(placeholder(context, words.emptyBlastRadiusTitle, words.emptyBlastRadiusHint));
            return root;
        }

        const centerX = CONTENT.x + CONTENT.width / 2;
        const centerY = CONTENT.y + CONTENT.height / 2;
        const placed = new Map<RecordId, Spot>();
        const usedRings = page.rings.map((members, depth) => ({ depth, members })).filter(ring => ring.depth > 0 && ring.members.length > 0);
        const maxRadius = Math.min(CONTENT.height / 2 - 26, CONTENT.width / 2 - 120);
        const ringStep = usedRings.length > 0 ? (maxRadius - INNER_RADIUS) / usedRings.length : 0;

        usedRings.forEach((ring, index) => {
            const radius = INNER_RADIUS + (index + 1) * ringStep;
            content.appendChild(circle(centerX, centerY, radius, { fill: "none", stroke: palette.border, "stroke-width": 1, "stroke-dasharray": "4 6" }));
            // Set beside the ring rather than on top of it, where a record would sit on the label
            content.appendChild(rect(centerX - radius - 34, centerY - 9, 30, 18, { rx: 4, fill: palette.surfaceAlt }));
            content.appendChild(text(ring.depth === MAX_RINGS ? "far" : `${ring.depth} hop${ring.depth > 1 ? "s" : ""}`, centerX - radius - 19, centerY, {
                "font-size": 9.5, "font-weight": 700, "text-anchor": "middle", "dominant-baseline": "central", fill: palette.inkMuted
            }));

            ring.members.forEach((member, memberIndex) => {
                const angle = (memberIndex / ring.members.length) * Math.PI * 2 - Math.PI / 2;
                placed.set(member.id, {
                    x: centerX + Math.cos(angle) * radius,
                    y: centerY + Math.sin(angle) * radius,
                    member,
                    unreached: ring.depth === MAX_RINGS,
                    // Names alternate above and below their orb, so neighbours on a crowded ring do not
                    // write over each other
                    labelAbove: memberIndex % 2 === 1
                });
            });
        });

        // Only real relationships are drawn. Spokes to the centre would claim a connection the records
        // never described, which is exactly the wrong thing for a spread diagram to imply.
        placed.set(origin.id, { x: centerX, y: centerY, member: origin, unreached: false, labelAbove: false });
        content.appendChild(connections(store, palette, placed));

        placed.forEach(spot => {
            if (spot.member.id !== origin.id) content.appendChild(orb(context, spot));
        });

        content.appendChild(group({ class: "tlg-node tlg-orb", "data-node-id": origin.id }, [
            selectionRing(palette, centerX, centerY, ORIGIN_RADIUS + RING_GAP),
            circle(centerX, centerY, ORIGIN_RADIUS, { fill: palette.tint(attacker, 0.86), stroke: attacker, "stroke-width": 2 }),
            icons.draw(store.nodeIcon(origin), centerX, centerY - 6, 20, attacker),
            text(truncate(origin.name, 10, 74), centerX, centerY + 16, { "font-size": 10, "font-weight": 700, "text-anchor": "middle", fill: palette.ink })
        ]));
        content.appendChild(text("PATIENT ZERO", centerX, centerY + 56, {
            "font-size": 9.5, "font-weight": 700, "letter-spacing": 1, "text-anchor": "middle", fill: attacker
        }));
        return root;
    }
});
