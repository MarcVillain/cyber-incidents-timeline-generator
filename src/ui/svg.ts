// Minimal SVG construction helpers. Renderers describe what they draw, not how elements are created.

export const SVG_NS = "http://www.w3.org/2000/svg";

let target: Document | null = null;

/**
 * The document elements are created in. The page the workspace runs in, unless a headless renderer put
 * one here for the length of a render.
 */
export function svgDocument(): Document {
    return target ?? document;
}

/**
 * Draws with the given document for the length of the work, and puts back whatever was there before, so
 * a server can render a slide with no page of its own. Nothing else in the package calls this.
 */
export function withDocument<TResult>(value: Document, work: () => TResult): TResult {
    const previous = target;
    target = value;
    try {
        return work();
    } finally {
        target = previous;
    }
}

export type SvgAttributeValue = string | number | boolean | null | undefined;
export type SvgAttributes = Readonly<Record<string, SvgAttributeValue>>;
export type SvgChild = SVGElement | null | false;

export function el<TName extends keyof SVGElementTagNameMap>(name: TName, attrs: SvgAttributes = {}, children: readonly SvgChild[] = []): SVGElementTagNameMap[TName] {
    const node = svgDocument().createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        node.setAttribute(key, String(value));
    }
    children.forEach(child => {
        if (child) node.appendChild(child);
    });
    return node;
}

export function group(attrs: SvgAttributes = {}, children: readonly SvgChild[] = []): SVGGElement {
    return el("g", attrs, children);
}

export function rect(x: number, y: number, width: number, height: number, attrs: SvgAttributes = {}): SVGRectElement {
    return el("rect", { x, y, width, height, ...attrs });
}

export function line(x1: number, y1: number, x2: number, y2: number, attrs: SvgAttributes = {}): SVGLineElement {
    return el("line", { x1, y1, x2, y2, ...attrs });
}

export function circle(cx: number, cy: number, r: number, attrs: SvgAttributes = {}): SVGCircleElement {
    return el("circle", { cx, cy, r, ...attrs });
}

export function path(d: string, attrs: SvgAttributes = {}): SVGPathElement {
    return el("path", { d, ...attrs });
}

export function text(content: string | number | null, x: number, y: number, attrs: SvgAttributes = {}): SVGTextElement {
    const node = el("text", { x, y, ...attrs });
    node.textContent = content === null ? "" : String(content);
    return node;
}

/**
 * Average glyph width of the interface font relative to its size, so wrapping does not force a reflow
 * per label.
 */
const AVERAGE_GLYPH_RATIO = 0.52;

export function measure(content: string | null, fontSize: number): number {
    return (content ?? "").length * fontSize * AVERAGE_GLYPH_RATIO;
}

export function truncate(content: string | null, fontSize: number, maxWidth: number): string {
    const value = content ?? "";
    if (measure(value, fontSize) <= maxWidth) return value;
    const budget = Math.max(1, Math.floor(maxWidth / (fontSize * AVERAGE_GLYPH_RATIO)) - 1);
    return `${value.slice(0, budget).trimEnd()}...`;
}

export function wrap(content: string | null, fontSize: number, maxWidth: number, maxLines: number): string[] {
    const source = (content ?? "").trim();
    const words = source.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (measure(candidate, fontSize) <= maxWidth || !current) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;
            if (lines.length === maxLines) break;
        }
    }
    if (lines.length < maxLines && current) {
        lines.push(current);
    }

    const last = lines[maxLines - 1];
    if (lines.length === maxLines && last !== undefined && lines.join(" ").length < source.length) {
        lines[maxLines - 1] = truncate(last, fontSize, maxWidth);
    }
    return lines;
}

/**
 * Rounded rectangle path, used where a shape has to be clipped to the corners of a card.
 */
export function roundedPath(x: number, y: number, width: number, height: number, radius: number): string {
    const r = Math.min(radius, width / 2, height / 2);
    return [
        `M${x + r},${y}`,
        `H${x + width - r}`,
        `A${r},${r} 0 0 1 ${x + width},${y + r}`,
        `V${y + height - r}`,
        `A${r},${r} 0 0 1 ${x + width - r},${y + height}`,
        `H${x + r}`,
        `A${r},${r} 0 0 1 ${x},${y + height - r}`,
        `V${y + r}`,
        `A${r},${r} 0 0 1 ${x + r},${y}`,
        "Z"
    ].join(" ");
}

/**
 * The top of a rounded box, used for a tinted strip that has to follow the corners it sits in.
 */
export function topRoundedPath(x: number, y: number, width: number, height: number, radius: number): string {
    const r = Math.min(radius, width / 2, height);
    return [
        `M${x},${y + height}`,
        `V${y + r}`,
        `A${r},${r} 0 0 1 ${x + r},${y}`,
        `H${x + width - r}`,
        `A${r},${r} 0 0 1 ${x + width},${y + r}`,
        `V${y + height}`,
        "Z"
    ].join(" ");
}

export function arrowMarker(id: string, color: string, { refX = 9, size = 6 }: { refX?: number; size?: number } = {}): SVGMarkerElement {
    return el("marker", {
        id,
        viewBox: "0 0 10 10",
        refX,
        refY: 5,
        markerWidth: size,
        markerHeight: size,
        orient: "auto-start-reverse"
    }, [path("M0,0 L10,5 L0,10 Z", { fill: color })]);
}

/**
 * An arrow head per colour. One shared marker would paint every arrow the same, so the head stops
 * matching the line it sits on the moment two colours share a diagram.
 */
export function markerId(prefix: string, color: string): string {
    return `${prefix}-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function arrowMarkers(prefix: string, colors: readonly string[], { refX = 8, size = 5 }: { refX?: number; size?: number } = {}): SVGDefsElement {
    return el("defs", {}, [...new Set(colors)].map(color => arrowMarker(markerId(prefix, color), color, { refX, size })));
}

const HALO_SPREAD = 1;
const HALO_BLUR = 2;

/**
 * A glow around a record of the canvas, written as an SVG filter rather than a CSS drop shadow. Safari
 * ignores the CSS shorthand on a group, and every record on the canvas is a group. The colour is left to
 * the stylesheet, which paints the flood through the class given.
 */
export function haloFilter(id: string, floodClass: string): SVGFilterElement {
    return el("filter", { id, x: "-20%", y: "-20%", width: "140%", height: "140%" }, [
        el("feMorphology", { in: "SourceAlpha", operator: "dilate", radius: HALO_SPREAD, result: "spread" }),
        el("feGaussianBlur", { in: "spread", stdDeviation: HALO_BLUR, result: "blurred" }),
        el("feFlood", { class: floodClass, result: "colour" }),
        el("feComposite", { in: "colour", in2: "blurred", operator: "in", result: "halo" }),
        el("feMerge", {}, [el("feMergeNode", { in: "halo" }), el("feMergeNode", { in: "SourceGraphic" })])
    ]);
}

export function stripTags(value: string | null): string {
    return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
