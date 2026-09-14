// The Diamond Model of Intrusion Analysis: adversary, capability, infrastructure and victim, with the
// records of the incident sorted onto the vertex each one belongs to.

import { DiamondVertex, Representation, Side } from "../../core/enums.js";
import { Icon } from "../../core/icon.js";
import type { DiagramNode } from "../../core/models.js";
import { fitText, nodeColor } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import { circle, group, line, measure, path, rect, text, truncate } from "../svg.js";
import type { Palette } from "../theme.js";
import { defineRenderer, type RenderContext } from "./registry.js";

enum Corner {
    Top = "top",
    Left = "left",
    Right = "right",
    Bottom = "bottom"
}

interface VertexDefinition {
    vertex: DiamondVertex;
    label: string;
    icon: Icon;
    side: Side;
    corner: Corner;
}

interface VertexPage extends VertexDefinition {
    members: DiagramNode[];
    total: number;
}

const VERTICES: readonly VertexDefinition[] = [
    { vertex: DiamondVertex.Adversary, label: "Adversary", icon: Icon.ThreatActor, side: Side.Attacker, corner: Corner.Top },
    { vertex: DiamondVertex.Capability, label: "Capability", icon: Icon.Tool, side: Side.Attacker, corner: Corner.Left },
    { vertex: DiamondVertex.Infrastructure, label: "Infrastructure", icon: Icon.Server, side: Side.ThirdParty, corner: Corner.Right },
    { vertex: DiamondVertex.Victim, label: "Victim", icon: Icon.Target, side: Side.Victim, corner: Corner.Bottom }
];

const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 236;
const ROW_HEIGHT = 24;
const MAX_ROWS = 8;
const HUB_RADIUS = 62;

// How far the side panels sit from the middle. Their inner edges have to clear the top and bottom
// panels, otherwise the four cards read as scattered boxes instead of the points of a diamond.
const SIDE_INSET = 26;

type Anchors = Readonly<Record<Corner, { x: number; y: number }>>;

function spine(palette: Palette, anchors: Anchors, centerX: number, centerY: number): SVGGElement {
    // The four points are the edges the panels face the middle with, so the shape between them is the
    // diamond itself rather than a box drawn near it
    const top = { x: centerX, y: anchors[Corner.Top].y + PANEL_HEIGHT };
    const right = { x: anchors[Corner.Right].x, y: centerY };
    const bottom = { x: centerX, y: anchors[Corner.Bottom].y };
    const left = { x: anchors[Corner.Left].x + PANEL_WIDTH, y: centerY };

    return group({}, [
        path(`M${top.x},${top.y} L${right.x},${right.y} L${bottom.x},${bottom.y} L${left.x},${left.y} Z`, {
            fill: palette.tint(palette.accent, 0.97), stroke: palette.border, "stroke-width": 1.5, "stroke-dasharray": "6 5"
        }),
        line(top.x, top.y, bottom.x, bottom.y, { stroke: palette.border, "stroke-width": 1, "stroke-dasharray": "3 5" }),
        line(right.x, right.y, left.x, left.y, { stroke: palette.border, "stroke-width": 1, "stroke-dasharray": "3 5" })
    ]);
}

function hub(context: RenderContext, centerX: number, centerY: number): SVGGElement {
    const { palette, store } = context;
    const incident = store.incident;
    return group({}, [
        circle(centerX, centerY, HUB_RADIUS, { fill: palette.surface, stroke: palette.accent, "stroke-width": 2 }),
        text("INCIDENT", centerX, centerY - 22, { "font-size": 9.5, "font-weight": 700, "letter-spacing": 1, "text-anchor": "middle", fill: palette.inkMuted }),
        text(truncate(incident.referenceId ?? `#${incident.id}`, 13, 116), centerX, centerY - 2, { "font-size": 13, "font-weight": 700, "text-anchor": "middle", fill: palette.ink }),
        text((store.impactLevel(incident.impact)?.label ?? incident.impact).toUpperCase(), centerX, centerY + 20, {
            "font-size": 10, "font-weight": 700, "letter-spacing": 0.8, "text-anchor": "middle",
            fill: palette.impactColor(incident.impact)
        })
    ]);
}

function panel(context: RenderContext, vertex: VertexPage, x: number, y: number): SVGGElement {
    const { palette, icons, store } = context;
    const color = palette.sides[vertex.side].color;
    const node = group();

    node.appendChild(rect(x, y, PANEL_WIDTH, PANEL_HEIGHT, { rx: 12, fill: palette.surface, stroke: palette.tint(color, 0.6), "stroke-width": 1.5 }));
    node.appendChild(rect(x, y, PANEL_WIDTH, 34, { rx: 12, fill: palette.tint(color, 0.9) }));
    node.appendChild(rect(x, y + 22, PANEL_WIDTH, 12, { fill: palette.tint(color, 0.9) }));

    node.appendChild(icons.draw(vertex.icon, x + 20, y + 17, 14, color));
    node.appendChild(text(vertex.label.toUpperCase(), x + 36, y + 17, {
        "font-size": 11, "font-weight": 700, "letter-spacing": 0.8, fill: color, "dominant-baseline": "central"
    }));
    const shown = vertex.members.length === vertex.total ? String(vertex.total) : `${vertex.members.length} of ${vertex.total}`;
    node.appendChild(text(shown, x + PANEL_WIDTH - 16, y + 17, {
        "font-size": 12, "font-weight": 700, "text-anchor": "end", fill: color, "dominant-baseline": "central"
    }));

    if (vertex.members.length === 0) {
        node.appendChild(text("nothing recorded", x + PANEL_WIDTH / 2, y + PANEL_HEIGHT / 2 + 8, {
            "font-size": 10.5, "text-anchor": "middle", fill: palette.borderStrong
        }));
        return node;
    }

    vertex.members.forEach((member, index) => {
        const rowY = y + 48 + index * ROW_HEIGHT;
        const memberColor = nodeColor(palette, member);
        const row = group({ class: "tlg-node", "data-node-id": member.id });

        row.appendChild(circle(x + 22, rowY, 8, { fill: palette.tint(memberColor, 0.85) }));
        row.appendChild(icons.draw(store.nodeIcon(member), x + 22, rowY, 10, memberColor));
        // The identifier gets whatever the name leaves, rather than a fixed slice that cuts it while half
        // the row sits empty
        const name = fitText(member.name, PANEL_WIDTH - 190, { size: 11.5, minSize: 7.5 });
        const detailRoom = PANEL_WIDTH - 50 - measure(name.text, name.size) - 14;
        row.appendChild(text(name.text, x + 36, rowY, { "font-size": name.size, "font-weight": 600, fill: palette.ink, "dominant-baseline": "central" }));
        const detail = fitText(member.identifier ?? store.kindInfo(member.kind).label, detailRoom, { size: 10, minSize: 7 });
        row.appendChild(text(detail.text, x + PANEL_WIDTH - 14, rowY, {
            "font-size": detail.size, "text-anchor": "end", fill: palette.inkMuted, "dominant-baseline": "central"
        }));
        node.appendChild(row);
    });
    return node;
}

export const diamondModel = defineRenderer<VertexPage[]>({
    representation: Representation.DiamondModel,

    pages(context) {
        const nodes = context.store.visibleNodes();
        const grouped = VERTICES.map(vertex => ({ vertex, members: nodes.filter(node => node.diamondVertex === vertex.vertex) }));
        const depth = Math.max(1, ...grouped.map(entry => entry.members.length));
        const pageCount = Math.max(1, Math.ceil(depth / MAX_ROWS));

        return Array.from({ length: pageCount }, (_, index) => grouped.map(entry => ({
            ...entry.vertex,
            members: entry.members.slice(index * MAX_ROWS, (index + 1) * MAX_ROWS),
            total: entry.members.length
        })));
    },

    draw(context, vertices, pageIndex, pageCount) {
        const { palette } = context;
        const total = vertices.reduce((sum, vertex) => sum + vertex.total, 0);

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: `${total} record(s) placed on the four vertices`,
            legend: vertices.filter(vertex => vertex.total > 0).map(vertex => ({
                label: vertex.label, color: palette.sides[vertex.side].color, icon: vertex.icon
            }))
        });

        if (total === 0) {
            content.appendChild(placeholder(context, "Nothing to place yet", "Add the parties and the tooling, and each one lands on its vertex."));
            return root;
        }

        const centerX = CONTENT.x + CONTENT.width / 2;
        const centerY = CONTENT.y + CONTENT.height / 2;
        const reach = PANEL_WIDTH / 2 + SIDE_INSET;
        const anchors: Anchors = {
            [Corner.Top]: { x: centerX - PANEL_WIDTH / 2, y: CONTENT.y },
            [Corner.Bottom]: { x: centerX - PANEL_WIDTH / 2, y: CONTENT.bottom - PANEL_HEIGHT },
            [Corner.Left]: { x: Math.max(CONTENT.x, centerX - reach - PANEL_WIDTH), y: centerY - PANEL_HEIGHT / 2 },
            [Corner.Right]: { x: Math.min(CONTENT.right - PANEL_WIDTH, centerX + reach), y: centerY - PANEL_HEIGHT / 2 }
        };

        content.appendChild(spine(palette, anchors, centerX, centerY));
        content.appendChild(hub(context, centerX, centerY));
        vertices.forEach(vertex => {
            const at = anchors[vertex.corner];
            content.appendChild(panel(context, vertex, at.x, at.y));
        });
        return root;
    }
});
