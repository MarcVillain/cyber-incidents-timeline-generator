// Horizontal time axis with ticks and gridlines, shared by the lane based representations.

import { TimeFormats } from "../core/time.js";

const DEFAULT_TIME = new TimeFormats();
import { timeTicks, type TimeScale } from "./geometry.js";
import { group, line, rect, text } from "./svg.js";
import type { Palette } from "./theme.js";

export interface AxisLayout {
    x: number;
    width: number;
    top: number;
    bottom: number;
    ticks?: number;
    showGrid?: boolean;
}

const DEFAULT_TICKS = 7;

export function timeAxis(palette: Palette, scale: TimeScale, { x, width, top, bottom, ticks = DEFAULT_TICKS, showGrid = true }: AxisLayout, time: TimeFormats = DEFAULT_TIME): SVGGElement {
    const node = group();

    if (scale.collapsed) {
        const label = scale.start ? `${time.formatDate(scale.start)} ${time.formatTime(scale.start)}` : "";
        node.appendChild(text(label, x + width / 2, top - 10, { "font-size": 11, "text-anchor": "middle", fill: palette.inkMuted }));
        return node;
    }

    const marks = timeTicks(scale, ticks);
    let previousDay: string | null = null;

    marks.forEach((moment, index) => {
        const position = scale.at(moment);

        if (showGrid && index > 0) {
            node.appendChild(line(position, top, position, bottom, { stroke: palette.border, "stroke-width": 1, "stroke-dasharray": "2 5" }));
        }

        const day = time.formatDate(moment);
        node.appendChild(text(time.formatTime(moment), position, top - 10, { "font-size": 10.5, "text-anchor": "middle", fill: palette.inkMuted }));
        if (day !== previousDay) {
            node.appendChild(text(day, position, top - 24, { "font-size": 10.5, "font-weight": 700, "text-anchor": "middle", fill: palette.ink }));
            previousDay = day;
        }
    });

    node.appendChild(line(x, top, x + width, top, { stroke: palette.border, "stroke-width": 1 }));
    return node;
}

export interface SpanLayout {
    top: number;
    height: number;
    color: string;
    label: string | null;
}

/**
 * Shaded band calling out a duration on the axis, such as the time an intruder went unnoticed.
 */
export function span(scale: TimeScale, from: Date | null, to: Date | null, { top, height, color, label }: SpanLayout): SVGGElement {
    const node = group();
    if (!from || !to || scale.collapsed) return node;

    const left = scale.at(from);
    const right = scale.at(to);
    if (right - left < 2) return node;

    node.appendChild(rect(left, top, right - left, height, { fill: color, opacity: 0.08 }));
    node.appendChild(line(left, top, left, top + height, { stroke: color, "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
    node.appendChild(line(right, top, right, top + height, { stroke: color, "stroke-width": 1.5, "stroke-dasharray": "4 3" }));

    if (label) {
        node.appendChild(text(label, (left + right) / 2, top + 14, { "font-size": 11, "font-weight": 700, "text-anchor": "middle", fill: color }));
    }
    return node;
}
