import { Icon } from "../../core/icon.js";
import { SVG_NS } from "../svg.js";
import { ICON_SHAPES } from "./shapes.js";

const ICON_BOX = 24;
const STROKE_WIDTH = 2.25;

/**
 * Stroke drawn icons addressed by key. Built in keys come from the Icon enum; a host can add keys of its
 * own or replace any drawing, and the catalog can then name them.
 */
export class IconSet {
    private readonly shapes: ReadonlyMap<string, readonly string[]>;

    constructor(overrides: ReadonlyMap<string, readonly string[]> = new Map()) {
        const merged = new Map<string, readonly string[]>();
        for (const icon of Object.values(Icon)) {
            merged.set(icon, ICON_SHAPES[icon]);
        }
        overrides.forEach((paths, name) => merged.set(name, paths));
        this.shapes = merged;
    }

    has(name: string): boolean {
        return this.shapes.has(name);
    }

    /** An unknown key draws the question mark rather than nothing, so a typo shows on the slide. */
    paths(name: string): readonly string[] {
        return this.shapes.get(name) ?? ICON_SHAPES[Icon.Unknown];
    }

    /**
     * The icon centred on a point of a diagram, sized like a glyph of that font size.
     */
    draw(name: string, centerX: number, centerY: number, size: number, color: string): SVGGElement {
        const scale = size / ICON_BOX;
        const group = document.createElementNS(SVG_NS, "g");
        group.setAttribute("class", "tlg-glyph");
        group.setAttribute("transform", `translate(${centerX - size / 2} ${centerY - size / 2}) scale(${scale})`);
        group.setAttribute("fill", "none");
        group.setAttribute("stroke", color);
        group.setAttribute("stroke-width", String(STROKE_WIDTH));
        group.setAttribute("stroke-linecap", "round");
        group.setAttribute("stroke-linejoin", "round");
        this.paths(name).forEach(d => {
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", d);
            group.appendChild(path);
        });
        return group;
    }

    /**
     * The icon as an inline element for buttons and lists, taking the colour and size of its text.
     */
    element(name: string): SVGSVGElement {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "tlg-icon");
        svg.setAttribute("viewBox", `0 0 ${ICON_BOX} ${ICON_BOX}`);
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        this.paths(name).forEach(d => {
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", d);
            svg.appendChild(path);
        });
        return svg;
    }
}
