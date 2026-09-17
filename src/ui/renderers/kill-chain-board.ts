// The intrusion sorted into kill chain columns. Empty columns are kept on purpose: a phase with no record
// is either a phase that never happened or one nobody could see, and both are worth showing.

import type { KillChainPhaseInfo } from "../../core/catalog.js";
import { KillChainPhase, Representation, Side, StepOutcome } from "../../core/enums.js";
import { HEADER_STRIP, cardOutline, fitLines, headerStrip, iconTile, microLabels, outcomeColor } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { group, rect, text, truncate, wrap } from "../svg.js";
import { defineRenderer, type RenderContext } from "./registry.js";

const HEADER_HEIGHT = 54;
const CARD_HEIGHT = 96;
const CARD_GAP = 10;
const COLUMN_GAP = 8;

interface Column {
    info: KillChainPhaseInfo;
    steps: TimelineStep[];
    total: number;
}

interface BoardPage {
    columns: Column[];
    unclassified: TimelineStep[];
    hasAnything: boolean;
}

function rowsPerPage(): number {
    return Math.max(1, Math.floor((CONTENT.height - HEADER_HEIGHT) / (CARD_HEIGHT + CARD_GAP)));
}

function boardCard(context: RenderContext, step: TimelineStep, x: number, y: number, width: number): SVGGElement {
    const { palette, store } = context;
    const color = palette.sides[step.side].color;
    const node = group({ class: "tlg-step", "data-step-id": step.id });

    node.appendChild(rect(x, y, width, CARD_HEIGHT, { rx: 8, fill: palette.surface }));
    node.appendChild(headerStrip(context, step, x, y, width, color));

    const title = fitLines(step.title, width - 20, { size: 11, minSize: 7.5, maxLines: 3 });
    title.lines.forEach((lineText, index) => {
        node.appendChild(text(lineText, x + 10, y + HEADER_STRIP + 16 + index * title.lineHeight, {
            "font-size": title.size, "font-weight": 600, fill: palette.ink
        }));
    });

    const target = store.node(step.targetNodeId);
    if (target) {
        node.appendChild(iconTile(context, target, x + 10, y + CARD_HEIGHT - 21, 13));
        node.appendChild(text(truncate(target.name, 9.5, width - 58), x + 27, y + CARD_HEIGHT - 14, {
            "font-size": 9.5, fill: palette.inkMuted, "dominant-baseline": "central"
        }));
    }

    if (step.outcome !== StepOutcome.Unknown) {
        node.appendChild(microLabels(palette, [{ label: store.outcomeInfo(step.outcome).label, color: outcomeColor(palette, step) }], x + width - 62, y + CARD_HEIGHT - 14, 56));
    }

    node.appendChild(cardOutline(palette, x, y, width, CARD_HEIGHT, step.isMilestone ? color : null));
    return node;
}

export const killChainBoard = defineRenderer<BoardPage>({
    representation: Representation.KillChainBoard,

    pages(context) {
        const { store } = context;
        const phases = store.catalog.killChainPhases.filter(phase => phase.phase !== KillChainPhase.None);
        const attacker = store.visibleSteps().filter(step => step.side === Side.Attacker || step.killChainPhase !== KillChainPhase.None);

        const byPhase = new Map<KillChainPhase, TimelineStep[]>(phases.map(phase => [phase.phase, []]));
        const unclassified: TimelineStep[] = [];
        attacker.forEach(step => {
            const bucket = byPhase.get(step.killChainPhase);
            if (bucket) bucket.push(step);
            else unclassified.push(step);
        });

        const depth = Math.max(1, ...phases.map(phase => byPhase.get(phase.phase)?.length ?? 0));
        const perPage = rowsPerPage();
        const pageCount = Math.max(1, Math.ceil(depth / perPage));

        return Array.from({ length: pageCount }, (_, index) => ({
            columns: phases.map(phase => {
                const steps = byPhase.get(phase.phase) ?? [];
                return { info: phase, steps: steps.slice(index * perPage, (index + 1) * perPage), total: steps.length };
            }),
            unclassified: index === 0 ? unclassified : [],
            hasAnything: attacker.length > 0
        }));
    },

    draw(context, page, pageIndex, pageCount) {
        const { palette, icons } = context;
        const covered = page.columns.filter(column => column.total > 0).length;
        const attackerColor = palette.sides[Side.Attacker].color;

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: `${covered} of ${page.columns.length} phases observed`,
            legend: [
                { label: context.strings.scene.observed, color: attackerColor },
                { label: context.strings.scene.nothingRecorded, color: palette.border }
            ]
        });

        if (!page.hasAnything) {
            content.appendChild(placeholder(context, context.strings.scene.emptyKillChainTitle, context.strings.scene.emptyKillChainHint));
            return root;
        }

        const columnWidth = (CONTENT.width - COLUMN_GAP * (page.columns.length - 1)) / page.columns.length;

        page.columns.forEach((column, index) => {
            const x = CONTENT.x + index * (columnWidth + COLUMN_GAP);
            const active = column.total > 0;
            const color = active ? attackerColor : palette.borderStrong;

            content.appendChild(rect(x, CONTENT.y, columnWidth, CONTENT.height, {
                rx: 10,
                fill: active ? palette.tint(color, 0.97) : palette.surfaceAlt,
                stroke: active ? palette.tint(color, 0.82) : palette.border,
                "stroke-width": 1
            }));

            content.appendChild(rect(x + columnWidth / 2 - 13, CONTENT.y + 7, 26, 26, { rx: 5, fill: palette.tint(color, active ? 0.8 : 0.9) }));
            content.appendChild(icons.draw(column.info.icon, x + columnWidth / 2, CONTENT.y + 20, 15, color));

            wrap(column.info.label, 10.5, columnWidth - 12, 2).forEach((lineText, lineIndex) => {
                content.appendChild(text(lineText, x + columnWidth / 2, CONTENT.y + 43 + lineIndex * 12, {
                    "font-size": 10.5, "font-weight": 700, "text-anchor": "middle", fill: active ? palette.ink : palette.inkMuted
                }));
            });

            if (!active) {
                content.appendChild(text("nothing recorded", x + columnWidth / 2, CONTENT.y + CONTENT.height / 2, {
                    "font-size": 10, "text-anchor": "middle", fill: palette.borderStrong
                }));
            }

            column.steps.forEach((step, stepIndex) => {
                const y = CONTENT.y + HEADER_HEIGHT + stepIndex * (CARD_HEIGHT + CARD_GAP);
                content.appendChild(boardCard(context, step, x + 6, y, columnWidth - 12));
            });
        });

        if (page.unclassified.length > 0) {
            content.appendChild(text(`${page.unclassified.length} step(s) without a tactic are not shown here`, CONTENT.x, CONTENT.bottom + 14, {
                "font-size": 10.5, fill: palette.inkMuted
            }));
        }
        return root;
    }
});
