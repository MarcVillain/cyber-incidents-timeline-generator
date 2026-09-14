// Actions chained by cause, with the assets each one touched hanging underneath, following the shape of
// the MITRE Attack Flow model. The chain runs back and forth across the slide so long incidents still fit.

import { Representation, Side } from "../../core/enums.js";
import type { DiagramNode, RecordId } from "../../core/models.js";
import { fitLines, nodeColor } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { paginate } from "../geometry.js";
import { arrowMarker, el, group, path, rect, text, topRoundedPath, truncate } from "../svg.js";
import type { Palette } from "../theme.js";
import { defineRenderer, type RenderContext } from "./registry.js";

const ACTION_WIDTH = 214;
const ACTION_HEIGHT = 76;
const ACTION_STRIP = 22;
const ASSET_HEIGHT = 22;
const ASSET_GAP = 5;
const COLUMN_GAP = 44;
const ROW_GAP = 34;
const MAX_ASSETS = 3;
const FLOW_ARROW = "tlg-flow-arrow";

// A lane kept clear down each side of the slide. The chain reverses direction at the end of every row
// and the link that carries it down has to run somewhere the boxes never reach.
const CORRIDOR = 26;

interface Placed {
    x: number;
    y: number;
    leftToRight: boolean;
}

function rowHeight(): number {
    return ACTION_HEIGHT + MAX_ASSETS * (ASSET_HEIGHT + ASSET_GAP) + ROW_GAP;
}

function usableWidth(): number {
    return CONTENT.width - CORRIDOR * 2;
}

function columnsPerRow(): number {
    return Math.max(1, Math.floor((usableWidth() + COLUMN_GAP) / (ACTION_WIDTH + COLUMN_GAP)));
}

/**
 * Whatever width the columns do not use is shared between them, so a row reaches both corridors instead
 * of packing left and leaving a hole on the right.
 */
function columnPitch(columns: number): number {
    return columns < 2 ? 0 : (usableWidth() - ACTION_WIDTH) / (columns - 1);
}

function rowsPerPage(): number {
    return Math.max(1, Math.floor(CONTENT.height / rowHeight()));
}

function assetsOf(context: RenderContext, step: TimelineStep): DiagramNode[] {
    const ids = new Set<RecordId>();
    if (step.targetNodeId !== null) ids.add(step.targetNodeId);
    step.involvements.forEach(involvement => ids.add(involvement.nodeId));
    return [...ids].map(id => context.store.node(id)).filter((node): node is DiagramNode => node !== null);
}

function actionBox(context: RenderContext, step: TimelineStep, x: number, y: number): SVGGElement {
    const { palette, icons, store } = context;
    const color = palette.sides[step.side].color;
    const node = group({ class: "tlg-step", "data-step-id": step.id });
    const label = step.side === Side.Defender ? store.responseInfo(step.responsePhase).label : store.tacticInfo(step.attackTactic).label;

    node.appendChild(rect(x, y, ACTION_WIDTH, ACTION_HEIGHT, { rx: 9, fill: palette.surface }));

    // The classification sits in its own strip across the top rather than floating beside the icon
    node.appendChild(path(topRoundedPath(x, y, ACTION_WIDTH, ACTION_STRIP, 9), { fill: palette.tint(color, 0.88) }));
    node.appendChild(text(truncate(label.toUpperCase(), 9, ACTION_WIDTH - 24), x + 12, y + ACTION_STRIP / 2 + 1, {
        "font-size": 9, "font-weight": 700, "letter-spacing": 0.6, fill: color, "dominant-baseline": "central"
    }));

    // Icon and title share one centre line down the body, so a one line title does not sit high of the
    // badge beside it
    const bodyMiddle = y + (ACTION_STRIP + ACTION_HEIGHT) / 2;
    node.appendChild(rect(x + 12, bodyMiddle - 13, 26, 26, { rx: 6, fill: color }));
    node.appendChild(icons.draw(store.stepIcon(step), x + 25, bodyMiddle, 15, palette.onColor));

    const title = fitLines(step.title, ACTION_WIDTH - 62, { size: 11.5, minSize: 7.5, maxLines: 3 });
    title.lines.forEach((lineText, index) => {
        node.appendChild(text(lineText, x + 46, bodyMiddle - (title.lines.length - 1) * title.lineHeight / 2 + index * title.lineHeight, {
            "font-size": title.size, "font-weight": 600, fill: palette.ink, "dominant-baseline": "central"
        }));
    });

    node.appendChild(rect(x, y, ACTION_WIDTH, ACTION_HEIGHT, { rx: 9, fill: "none", stroke: color, "stroke-width": step.isMilestone ? 1.8 : 1 }));
    return node;
}

function assetPill(context: RenderContext, asset: DiagramNode, x: number, y: number, width: number): SVGGElement {
    const { palette, icons, store } = context;
    const color = nodeColor(palette, asset);
    return group({ class: "tlg-node", "data-node-id": asset.id }, [
        rect(x, y, width, ASSET_HEIGHT, { rx: ASSET_HEIGHT / 2, fill: palette.surface, stroke: palette.border, "stroke-width": 1 }),
        rect(x + 4, y + 4, 14, 14, { rx: 4, fill: palette.tint(color, 0.85) }),
        icons.draw(store.nodeIcon(asset), x + 11, y + ASSET_HEIGHT / 2, 10, color),
        text(truncate(asset.name, 10, width - 30), x + 24, y + ASSET_HEIGHT / 2, { "font-size": 10, fill: palette.ink, "dominant-baseline": "central" })
    ]);
}

function connector(palette: Palette, from: Placed, to: Placed): SVGPathElement {
    const attrs = { fill: "none", stroke: palette.borderStrong, "stroke-width": 1.6, "marker-end": `url(#${FLOW_ARROW})` };

    if (from.y === to.y) {
        const startX = from.leftToRight ? from.x + ACTION_WIDTH : from.x;
        const endX = from.leftToRight ? to.x : to.x + ACTION_WIDTH;
        const y = from.y + ACTION_HEIGHT / 2;
        return path(`M${startX},${y} H${endX}`, attrs);
    }

    // The next action sits in the same column one row down, so the link leaves the outer edge, runs down
    // the corridor kept clear beside it and comes back in on that same edge
    const edgeX = from.leftToRight ? from.x + ACTION_WIDTH : from.x;
    const turnX = from.leftToRight ? CONTENT.right - CORRIDOR / 2 : CONTENT.x + CORRIDOR / 2;
    return path(`M${edgeX},${from.y + ACTION_HEIGHT / 2} H${turnX} V${to.y + ACTION_HEIGHT / 2} H${edgeX}`, attrs);
}

export const attackFlow = defineRenderer<TimelineStep[]>({
    representation: Representation.AttackFlow,

    pages(context) {
        return paginate(context.store.visibleSteps(), columnsPerRow() * rowsPerPage());
    },

    draw(context, pageSteps, pageIndex, pageCount) {
        const { palette } = context;

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: `${pageSteps.length} action(s) in causal order`,
            legend: [
                { label: "Action", color: palette.accent },
                { label: "Asset touched", color: palette.inkMuted }
            ]
        });

        if (pageSteps.length === 0) {
            content.appendChild(placeholder(context, "No actions recorded yet", "Each step becomes an action, and the assets it touched hang below it."));
            return root;
        }

        content.appendChild(el("defs", {}, [arrowMarker(FLOW_ARROW, palette.borderStrong, { size: 5 })]));

        const perRow = columnsPerRow();
        const pitch = columnPitch(perRow);
        const height = rowHeight();
        const placed: Placed[] = [];

        pageSteps.forEach((step, index) => {
            const row = Math.floor(index / perRow);
            const leftToRight = row % 2 === 0;
            const column = leftToRight ? index % perRow : perRow - 1 - (index % perRow);
            const x = CONTENT.x + CORRIDOR + column * pitch;
            const y = CONTENT.y + row * height;

            content.appendChild(actionBox(context, step, x, y));
            placed.push({ x, y, leftToRight });

            assetsOf(context, step).slice(0, MAX_ASSETS).forEach((asset, assetIndex) => {
                content.appendChild(assetPill(context, asset, x + 12, y + ACTION_HEIGHT + 8 + assetIndex * (ASSET_HEIGHT + ASSET_GAP), ACTION_WIDTH - 24));
            });
        });

        placed.forEach((from, index) => {
            const to = placed[index + 1];
            if (to) content.appendChild(connector(palette, from, to));
        });
        return root;
    }
});
