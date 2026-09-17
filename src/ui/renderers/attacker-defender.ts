// The debrief slide: what the intruder did above the clock, what the response did below it, and the
// stretch of time in between where nobody was watching.

import { Representation, Side, StepOutcome } from "../../core/enums.js";
import { Icon } from "../../core/icon.js";
import { longestUnseen } from "../../core/response.js";
import { formatDate, formatDuration } from "../../core/time.js";
import { span, timeAxis } from "../axis.js";
import { HEADER_STRIP, cardOutline, fitLines, headerStrip, microLabels, outcomeColor } from "../cards.js";
import { CONTENT, frame, placeholder } from "../chrome.js";
import type { TimelineStep } from "../diagram-store.js";
import { paginate, spread, timeScale } from "../geometry.js";
import { circle, group, path, rect, text } from "../svg.js";
import { defineRenderer, type RenderContext } from "./registry.js";

const CARD_WIDTH = 208;
const CARD_HEIGHT = 82;
const CARD_GAP = 10;
const AXIS_OFFSET = 96;
const METRICS_HEIGHT = 78;
const AXIS_HEADROOM = 34;
const STEPS_PER_PAGE = 16;
const TRACK_INSET = 40;
const MAX_ROWS = 2;
const TILE_GAP = 12;

interface MetricTile {
    label: string;
    value: string | null;
    icon: Icon;
    color: string;
}

function compactCard(context: RenderContext, step: TimelineStep, x: number, y: number): SVGGElement {
    const { palette, store } = context;
    const color = palette.sides[step.side].color;
    const node = group({ class: "tlg-step", "data-step-id": step.id });

    node.appendChild(rect(x, y, CARD_WIDTH, CARD_HEIGHT, { rx: 8, fill: palette.surface }));
    node.appendChild(headerStrip(context, step, x, y, CARD_WIDTH, color));

    const title = fitLines(step.title, CARD_WIDTH - 24, { size: 11.5, minSize: 7.5, maxLines: 3 });
    title.lines.forEach((lineText, index) => {
        node.appendChild(text(lineText, x + 12, y + HEADER_STRIP + 16 + index * title.lineHeight, {
            "font-size": title.size, "font-weight": 600, fill: palette.ink
        }));
    });

    if (step.outcome !== StepOutcome.Unknown) {
        node.appendChild(microLabels(palette, [{ label: store.outcomeInfo(step.outcome).label, color: outcomeColor(palette, step) }], x + 12, y + CARD_HEIGHT - 12, CARD_WIDTH - 24));
    }

    node.appendChild(cardOutline(palette, x, y, CARD_WIDTH, CARD_HEIGHT, step.isMilestone ? color : null));
    return node;
}

function marker(context: RenderContext, step: TimelineStep, x: number, axisY: number): SVGGElement {
    const { palette } = context;
    const color = palette.sides[step.side].color;
    return group({}, [
        circle(x, axisY, 7, { fill: palette.surface, stroke: color, "stroke-width": 2.5 }),
        step.isMilestone ? circle(x, axisY, 3, { fill: color }) : null
    ]);
}

function metricsStrip(context: RenderContext, x: number, y: number): SVGGElement {
    const { palette, icons, store } = context;
    const metrics = store.metrics;
    const words = context.strings.scene;
    const node = group();

    const entries: MetricTile[] = [
        { label: words.dwellTime, value: context.time.formatDuration(metrics.dwellHours), icon: Icon.ThreatActor, color: palette.sides[Side.Attacker].color },
        { label: words.timeToDetect, value: context.time.formatDuration(metrics.timeToDetectHours), icon: Icon.Search, color: palette.sides[Side.Defender].color },
        { label: words.timeToContain, value: context.time.formatDuration(metrics.timeToContainHours), icon: Icon.Shield, color: palette.sides[Side.Defender].color },
        { label: words.timeToRecover, value: context.time.formatDuration(metrics.timeToRecoverHours), icon: Icon.Recover, color: palette.good }
    ];

    const width = (CONTENT.width - (entries.length - 1) * TILE_GAP) / entries.length;

    entries.forEach((entry, index) => {
        const cardX = x + index * (width + TILE_GAP);
        node.appendChild(rect(cardX, y, width, METRICS_HEIGHT - 18, {
            rx: 8, fill: palette.tint(entry.color, 0.93), stroke: palette.tint(entry.color, 0.75), "stroke-width": 1
        }));
        node.appendChild(circle(cardX + 26, y + 30, 15, { fill: palette.tint(entry.color, 0.8) }));
        node.appendChild(icons.draw(entry.icon, cardX + 26, y + 30, 16, entry.color));
        node.appendChild(text(entry.label.toUpperCase(), cardX + 50, y + 22, {
            "font-size": 9.5, "font-weight": 700, "letter-spacing": 0.7, fill: palette.inkMuted
        }));
        node.appendChild(text(entry.value ?? "not known", cardX + 50, y + 43, {
            "font-size": entry.value ? 19 : 13, "font-weight": 700, fill: entry.value ? palette.ink : palette.inkMuted
        }));
    });
    return node;
}

export const attackerDefender = defineRenderer<TimelineStep[]>({
    representation: Representation.AttackerDefender,

    pages(context) {
        const steps = context.store.visibleSteps().filter(step => step.side === Side.Attacker || step.side === Side.Defender);
        return paginate(steps, STEPS_PER_PAGE);
    },

    draw(context, pageSteps, pageIndex, pageCount) {
        const { store, palette } = context;
        const first = pageSteps[0];
        const last = pageSteps.at(-1);
        const attacker = palette.sides[Side.Attacker];
        const defender = palette.sides[Side.Defender];

        const { root, content } = frame(context, {
            page: pageIndex,
            pageCount,
            subtitle: first && last ? `${formatDate(first.at)} to ${formatDate(last.at)}` : null,
            legend: [
                { label: attacker.label, color: attacker.color, icon: attacker.icon },
                { label: defender.label, color: defender.color, icon: defender.icon }
            ]
        });

        if (pageSteps.length === 0) {
            content.appendChild(placeholder(context, context.strings.scene.emptyDuelTitle, context.strings.scene.emptyDuelHint));
            return root;
        }

        // The axis labels sit above the track, so the track has to start clear of the metric tiles
        const trackTop = CONTENT.y + METRICS_HEIGHT + AXIS_HEADROOM;
        const trackHeight = CONTENT.height - METRICS_HEIGHT - AXIS_HEADROOM;
        const axisY = trackTop + trackHeight / 2;
        const left = CONTENT.x + TRACK_INSET;
        const right = CONTENT.right - TRACK_INSET;
        const visible = store.visibleSteps();
        const scale = timeScale(visible.map(step => step.at), left + CARD_WIDTH / 2, right - CARD_WIDTH / 2);

        content.appendChild(metricsStrip(context, CONTENT.x, CONTENT.y));

        const unseen = longestUnseen(visible);
        if (unseen) {
            content.appendChild(span(scale, unseen.from, unseen.to, {
                top: trackTop,
                height: trackHeight,
                color: attacker.color,
                label: `Ran unseen for ${formatDuration(unseen.hours) ?? "an unknown time"}`
            }));
        }

        content.appendChild(timeAxis(palette, scale, { x: left, width: right - left, top: trackTop, bottom: trackTop + trackHeight, showGrid: false }, context.time));
        content.appendChild(rect(left, axisY - 3, right - left, 6, { rx: 3, fill: palette.borderStrong, opacity: 0.35 }));
        content.appendChild(text(attacker.label.toUpperCase(), CONTENT.x + 4, trackTop + 16, {
            "font-size": 10.5, "font-weight": 700, "letter-spacing": 1, fill: attacker.color
        }));
        content.appendChild(text("RESPONSE", CONTENT.x + 4, trackTop + trackHeight - 8, {
            "font-size": 10.5, "font-weight": 700, "letter-spacing": 1, fill: defender.color
        }));

        [Side.Attacker, Side.Defender].forEach(side => {
            const sideSteps = pageSteps.filter(step => step.side === side);
            if (sideSteps.length === 0) return;

            const above = side === Side.Attacker;
            const placed = spread(sideSteps.map(step => scale.at(step.at) - CARD_WIDTH / 2), CARD_WIDTH + CARD_GAP, left, right - CARD_WIDTH);
            const perRow = Math.max(1, Math.floor((right - left) / (CARD_WIDTH + CARD_GAP)));
            const rowCount = Math.min(MAX_ROWS, Math.ceil(sideSteps.length / perRow));
            const color = palette.sides[side].color;

            sideSteps.forEach((step, index) => {
                const row = rowCount > 1 ? index % rowCount : 0;
                const cardX = placed[index] ?? left;
                const cardY = above
                    ? axisY - AXIS_OFFSET - row * (CARD_HEIGHT + 12) - CARD_HEIGHT
                    : axisY + AXIS_OFFSET + row * (CARD_HEIGHT + 12);
                const anchorX = scale.at(step.at);

                // Each leader bends at its own height, so two of them crossing can still be told apart
                const cardEdgeY = above ? cardY + CARD_HEIGHT : cardY;
                const stagger = 14 + (index % 4) * 11;
                const bendY = above ? axisY - stagger : axisY + stagger;
                content.appendChild(path(`M${cardX + CARD_WIDTH / 2},${cardEdgeY} V${bendY} H${anchorX} V${above ? axisY - 9 : axisY + 9}`, {
                    fill: "none", stroke: color, "stroke-width": 1.2, opacity: 0.75
                }));
                content.appendChild(compactCard(context, step, cardX, cardY));
                content.appendChild(marker(context, step, anchorX, axisY));
            });
        });
        return root;
    }
});
