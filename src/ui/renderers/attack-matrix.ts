// The ATT&CK matrix with the observed cells lit up. Reading it sideways shows how much of the enterprise
// matrix this single incident actually walked through.

import type { AttackTacticInfo } from "../../core/catalog.js";
import { AttackTactic, Representation, Side } from "../../core/enums.js";
import { formatDate } from "../../core/time.js";
import { fitLines, type FittedLines } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { group, line, rect, text, truncate, wrap } from "../svg.js";
import type { Palette } from "../theme.js";
import { defineRenderer, optionValue, type RenderContext, type RendererOption } from "./registry.js";

const HEADER_HEIGHT = 62;
const CELL_GAP = 5;
const COLUMN_GAP = 5;
const CELL_PADDING = 7;
const TECHNIQUE_LINE = 14;
const FOOT_LINE = 12;

enum Detail {
    Compact = "compact",
    Detailed = "detailed"
}

interface DetailLayout {
    minHeight: number;
    showWhen: boolean;
    showWho: boolean;
}

const DETAILS: Readonly<Record<Detail, DetailLayout>> = {
    [Detail.Compact]: { minHeight: 40, showWhen: false, showWho: false },
    [Detail.Detailed]: { minHeight: 76, showWhen: true, showWho: true }
};

const DETAIL_OPTION: RendererOption<Detail> = {
    id: "detail",
    label: "Detail",
    fallback: Detail.Compact,
    choices: [
        { value: Detail.Compact, label: "Compact" },
        { value: Detail.Detailed, label: "Detailed" }
    ]
};


interface Cell {
    technique: string | null;
    label: string;
    count: number;
    severity: string;
    at: Date | null;
    target: string | null;
}

interface MatrixColumn {
    info: AttackTacticInfo;
    total: number;
    cells: Cell[];
}

interface MatrixPage {
    hasAnything: boolean;
    observed: number;
    total: number;
    columns: MatrixColumn[];
}

function detailOf(context: RenderContext): DetailLayout {
    return DETAILS[optionValue(context, DETAIL_OPTION)];
}

/**
 * How tall a cell has to be to say everything it holds. The label is never cut, so the cell grows to the
 * text rather than the text shrinking out of the cell.
 */
function cellLayout(cell: Cell, width: number, detail: DetailLayout): { title: FittedLines; height: number } {
    const inner = width - CELL_PADDING * 2;
    const title = cell.technique
        ? fitLines(cell.label, inner, { size: 8.5, minSize: 7, maxLines: 3 })
        : fitLines(cell.label, inner, { size: 9, minSize: 7, maxLines: 4 });

    let height = CELL_PADDING * 2 + title.lines.length * title.lineHeight;
    if (cell.technique) height += TECHNIQUE_LINE;
    if (detail.showWhen && cell.at) height += FOOT_LINE;
    if (detail.showWho && cell.target) height += FOOT_LINE;
    return { title, height: Math.max(detail.minHeight, height) };
}

/**
 * Every cell on a page takes the height of the fullest, so the columns still read as rows across.
 */
function rowHeight(page: MatrixPage, columnWidth: number, detail: DetailLayout): number {
    const heights = page.columns.flatMap(column => column.cells.map(cell => cellLayout(cell, columnWidth - 10, detail).height));
    return Math.max(detail.minHeight, ...heights);
}

function rowsPerPage(detail: DetailLayout): number {
    return Math.max(1, Math.floor((CONTENT.height - HEADER_HEIGHT) / (detail.minHeight + CELL_GAP)));
}

/**
 * One cell per technique, or per step title when no technique was recorded, so nothing gets lost.
 */
function buildCells(context: RenderContext, steps: readonly TimelineStep[]): Cell[] {
    const cells = new Map<string, Cell>();
    steps.forEach(step => {
        const key = step.mitreTechniqueId ?? step.title;
        let cell = cells.get(key);
        if (!cell) {
            cell = {
                technique: step.mitreTechniqueId,
                label: step.title,
                count: 0,
                severity: step.severity,
                at: step.at,
                target: context.store.node(step.targetNodeId)?.name ?? null
            };
            cells.set(key, cell);
        }
        cell.count += 1;
        if (context.store.impactRank(step.severity) > context.store.impactRank(cell.severity)) {
            cell.severity = step.severity;
        }
    });
    return [...cells.values()];
}

function matrixCell(palette: Palette, cell: Cell, x: number, y: number, width: number, detail: DetailLayout, height: number): SVGGElement {
    const color = palette.impactColor(cell.severity);
    const node = group();
    const { title } = cellLayout(cell, width, detail);

    node.appendChild(rect(x, y, width, height, { rx: 6, fill: palette.tint(color, 0.86), stroke: palette.tint(color, 0.62), "stroke-width": 1 }));

    let cursor = y + CELL_PADDING + 8;
    if (cell.technique) {
        node.appendChild(text(cell.technique, x + CELL_PADDING, cursor, { "font-size": 10, "font-weight": 700, fill: color }));
        cursor += TECHNIQUE_LINE;
    }

    title.lines.forEach(lineText => {
        node.appendChild(text(lineText, x + CELL_PADDING, cursor, {
            "font-size": title.size, "font-weight": cell.technique ? 400 : 600, fill: cell.technique ? palette.inkMuted : palette.ink
        }));
        cursor += title.lineHeight;
    });

    if (detail.showWhen && cell.at) {
        node.appendChild(text(formatDate(cell.at).toUpperCase(), x + CELL_PADDING, y + height - (detail.showWho && cell.target ? FOOT_LINE + 8 : 8), {
            "font-size": 8, "font-weight": 700, "letter-spacing": 0.4, fill: color
        }));
    }
    if (detail.showWho && cell.target) {
        node.appendChild(text(truncate(cell.target, 8.5, width - 16), x + CELL_PADDING, y + height - 8, { "font-size": 8.5, fill: palette.inkMuted }));
    }
    if (cell.count > 1) {
        node.appendChild(text(`x${cell.count}`, x + width - CELL_PADDING, y + CELL_PADDING + 8, { "font-size": 9, "font-weight": 700, "text-anchor": "end", fill: color }));
    }
    return node;
}

export const attackMatrix = defineRenderer<MatrixPage>({
    representation: Representation.AttackMatrix,
    options: [DETAIL_OPTION],

    pages(context) {
        const { store } = context;
        const detail = detailOf(context);
        const tactics = store.catalog.attackTactics.filter(tactic => tactic.tactic !== AttackTactic.None);
        const steps = store.visibleSteps().filter(step => step.attackTactic !== AttackTactic.None);

        const columns = tactics.map(tactic => ({ info: tactic, cells: buildCells(context, steps.filter(step => step.attackTactic === tactic.tactic)) }));
        const depth = Math.max(1, ...columns.map(column => column.cells.length));
        const perPage = rowsPerPage(detail);
        const pageCount = Math.max(1, Math.ceil(depth / perPage));

        return Array.from({ length: pageCount }, (_, index) => ({
            hasAnything: steps.length > 0,
            observed: columns.filter(column => column.cells.length > 0).length,
            total: columns.length,
            columns: columns.map(column => ({ info: column.info, total: column.cells.length, cells: column.cells.slice(index * perPage, (index + 1) * perPage) }))
        }));
    },

    draw(context, page, pageIndex, pageCount) {
        const { store, palette, icons } = context;
        const detail = detailOf(context);

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: `${page.observed} of ${page.total} tactics observed`,
            legend: store.catalog.impactScale.levels.map(level => ({ label: level.label, color: palette.impactColor(level.level) }))
        });

        if (!page.hasAnything) {
            content.appendChild(placeholder(context, "No techniques recorded yet", "Give a step an ATT&CK tactic and a technique to fill the matrix."));
            return root;
        }

        const columnWidth = (CONTENT.width - COLUMN_GAP * (page.columns.length - 1)) / page.columns.length;
        const cellHeight = rowHeight(page, columnWidth, detail);

        page.columns.forEach((column, index) => {
            const x = CONTENT.x + index * (columnWidth + COLUMN_GAP);
            const active = column.total > 0;
            const headerColor = active ? palette.sides[Side.Attacker].color : palette.borderStrong;

            content.appendChild(rect(x, CONTENT.y, columnWidth, CONTENT.height, {
                rx: 8, fill: active ? palette.tint(headerColor, 0.985) : palette.surfaceAlt, stroke: palette.border, "stroke-width": 1
            }));
            content.appendChild(rect(x, CONTENT.y, columnWidth, HEADER_HEIGHT - 8, { rx: 8, fill: active ? palette.tint(headerColor, 0.9) : palette.surfaceAlt }));
            content.appendChild(line(x, CONTENT.y + HEADER_HEIGHT - 8, x + columnWidth, CONTENT.y + HEADER_HEIGHT - 8, {
                stroke: active ? palette.tint(headerColor, 0.75) : palette.border, "stroke-width": 1
            }));
            content.appendChild(icons.draw(column.info.icon, x + columnWidth / 2, CONTENT.y + 14, 13, headerColor));

            wrap(column.info.label, 9, columnWidth - 8, 2).forEach((lineText, lineIndex) => {
                content.appendChild(text(lineText, x + columnWidth / 2, CONTENT.y + 32 + lineIndex * 10.5, {
                    "font-size": 9, "font-weight": 700, "text-anchor": "middle", fill: active ? palette.ink : palette.inkMuted
                }));
            });

            content.appendChild(text(column.info.attackId ?? "", x + columnWidth / 2, CONTENT.y + HEADER_HEIGHT - 16, {
                "font-size": 8, "text-anchor": "middle", fill: palette.inkMuted
            }));

            column.cells.forEach((cell, cellIndex) => {
                const y = CONTENT.y + HEADER_HEIGHT + cellIndex * (cellHeight + CELL_GAP);
                content.appendChild(matrixCell(palette, cell, x + 5, y, columnWidth - 10, detail, cellHeight));
            });
        });
        return root;
    }
});
