// Pan, zoom and record dragging over a fixed size page. The page never changes size, so a diagram
// always fits the stage whatever the window does, and zooming is only there to read the detail.

import { uniqueId } from "./dom.js";
import { el, glowGradient, haloFilter, SVG_NS } from "./svg.js";

export const PAGE_WIDTH = 1600;
export const PAGE_HEIGHT = 900;

/** The box a representation lays itself out in. The 16:9 slide unless a host asks for another. */
export interface PageSize {
    width: number;
    height: number;
}

export const DEFAULT_PAGE_SIZE: PageSize = { width: PAGE_WIDTH, height: PAGE_HEIGHT };

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;
const WHEEL_THRESHOLD = 2;

export interface Point {
    x: number;
    y: number;
}

interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface Drag {
    element: SVGGraphicsElement;
    id: number;
    start: Point;
    origin: Point;
    last: Point | null;
}

interface Pan {
    clientX: number;
    clientY: number;
    offset: Point;
}

interface Press {
    target: Element | null;
    clientX: number;
    clientY: number;
}

export interface ViewportOptions {
    onNodeMoved: (nodeId: number, position: Point) => void;
    /** A press released where it started, with the element that was pressed. */
    onTap: (target: Element | null) => void;
    signal: AbortSignal;
}

// How far a pointer may wander between press and release and still count as a click rather than a pan
const TAP_TOLERANCE_PX = 4;

/**
 * Where an SVG using xMidYMid meet actually paints inside its box.
 */
function fitBox(bounds: DOMRect, aspect: number): Box {
    if (bounds.width / bounds.height > aspect) {
        const width = bounds.height * aspect;
        return { left: bounds.left + (bounds.width - width) / 2, top: bounds.top, width, height: bounds.height };
    }
    const height = bounds.width / aspect;
    return { left: bounds.left, top: bounds.top + (bounds.height - height) / 2, width: bounds.width, height };
}

export class Viewport {
    readonly svg: SVGSVGElement;
    allowDrag = false;
    private readonly container: HTMLElement;
    private readonly halo: SVGDefsElement;
    private readonly glow: SVGRadialGradientElement;
    private readonly onNodeMoved: (nodeId: number, position: Point) => void;
    private readonly onTap: (target: Element | null) => void;
    private scale = 1;
    private offset: Point = { x: 0, y: 0 };
    private page: PageSize = DEFAULT_PAGE_SIZE;

    constructor(container: HTMLElement, options: ViewportOptions) {
        this.container = container;
        this.onNodeMoved = options.onNodeMoved;
        this.onTap = options.onTap;

        const selectedId = uniqueId("halo");
        const hoveredId = uniqueId("halo");
        const glowId = uniqueId("glow");
        this.glow = glowGradient(glowId);
        this.halo = el("defs", {}, [haloFilter(selectedId, "tlg-halo-selected"), haloFilter(hoveredId, "tlg-halo-hovered"), this.glow]);
        this.svg = document.createElementNS(SVG_NS, "svg");
        this.svg.setAttribute("viewBox", `0 0 ${this.page.width} ${this.page.height}`);
        this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        this.svg.setAttribute("role", "img");
        this.container.appendChild(this.svg);
        // The stylesheet cannot name a filter whose id differs per workspace, so the canvas carries it
        this.container.style.setProperty("--tlg-halo", `url(#${selectedId})`);
        this.container.style.setProperty("--tlg-halo-hover", `url(#${hoveredId})`);
        this.container.style.setProperty("--tlg-glow", `url(#${glowId})`);

        this.bindPointer(options.signal);
        this.bindWheel(options.signal);
    }

    /** Moves the light a selected record casts to where that record sits on the page. */
    glowFrom(point: Point): void {
        this.glow.setAttribute("cx", String(point.x));
        this.glow.setAttribute("cy", String(point.y));
    }

    /** The size the scene is drawn at. Changing it re-frames the stage around the new page. */
    setPageSize(size: PageSize): void {
        this.page = size;
        this.svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
        this.fit();
    }

    setContent(node: SVGElement, label: string): void {
        this.svg.replaceChildren(this.halo, node);
        this.svg.setAttribute("aria-label", label);
    }

    fit(): void {
        this.scale = 1;
        this.offset = { x: 0, y: 0 };
        this.applyViewBox();
    }

    zoomIn(): void {
        this.zoomBy(ZOOM_STEP, null);
    }

    zoomOut(): void {
        this.zoomBy(1 / ZOOM_STEP, null);
    }

    private applyViewBox(): void {
        const width = this.page.width / this.scale;
        const height = this.page.height / this.scale;
        this.offset.x = Math.min(Math.max(this.offset.x, 0), Math.max(this.page.width - width, 0));
        this.offset.y = Math.min(Math.max(this.offset.y, 0), Math.max(this.page.height - height, 0));
        this.svg.setAttribute("viewBox", `${this.offset.x} ${this.offset.y} ${width} ${height}`);
    }

    private zoomBy(factor: number, focus: Point | null): void {
        const previous = this.scale;
        this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
        if (this.scale === previous) return;

        const point = focus ?? { x: this.page.width / 2, y: this.page.height / 2 };
        this.offset.x = point.x - (point.x - this.offset.x) * (previous / this.scale);
        this.offset.y = point.y - (point.y - this.offset.y) * (previous / this.scale);
        this.applyViewBox();
    }

    /**
     * Screen coordinates to page coordinates, which is what layouts and stored placements use.
     */
    private toPagePoint(clientX: number, clientY: number): Point {
        const rendered = fitBox(this.svg.getBoundingClientRect(), this.page.width / this.page.height);
        return {
            x: this.offset.x + ((clientX - rendered.left) / rendered.width) * (this.page.width / this.scale),
            y: this.offset.y + ((clientY - rendered.top) / rendered.height) * (this.page.height / this.scale)
        };
    }

    private bindWheel(signal: AbortSignal): void {
        this.container.addEventListener("wheel", event => {
            if (!event.ctrlKey && Math.abs(event.deltaY) < WHEEL_THRESHOLD) return;
            event.preventDefault();
            this.zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, this.toPagePoint(event.clientX, event.clientY));
        }, { passive: false, signal });
    }

    /**
     * The container captures the pointer so a pan keeps following it outside the stage. Once captured, the
     * browser aims the click at the container instead of the record under the pointer, so clicks are
     * recognised here from the press and release rather than from the click event.
     */
    private bindPointer(signal: AbortSignal): void {
        let pan: Pan | null = null;
        let drag: Drag | null = null;
        let press: Press | null = null;

        this.container.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;

            const target = event.target instanceof Element ? event.target : null;
            press = { target, clientX: event.clientX, clientY: event.clientY };
            const draggable = this.allowDrag ? target?.closest<SVGGraphicsElement>("[data-node-id][data-draggable='true']") ?? null : null;
            if (draggable) {
                drag = {
                    element: draggable,
                    id: Number(draggable.getAttribute("data-node-id")),
                    start: this.toPagePoint(event.clientX, event.clientY),
                    origin: { x: Number(draggable.getAttribute("data-x") ?? 0), y: Number(draggable.getAttribute("data-y") ?? 0) },
                    last: null
                };
            } else {
                pan = { clientX: event.clientX, clientY: event.clientY, offset: { ...this.offset } };
                this.container.classList.add("is-panning");
            }
            this.container.setPointerCapture(event.pointerId);
        }, { signal });

        this.container.addEventListener("pointermove", event => {
            if (pan) {
                const rendered = fitBox(this.svg.getBoundingClientRect(), this.page.width / this.page.height);
                this.offset.x = pan.offset.x - (event.clientX - pan.clientX) * ((this.page.width / this.scale) / rendered.width);
                this.offset.y = pan.offset.y - (event.clientY - pan.clientY) * ((this.page.height / this.scale) / rendered.height);
                this.applyViewBox();
                return;
            }

            if (drag) {
                const current = this.toPagePoint(event.clientX, event.clientY);
                drag.last = {
                    x: drag.origin.x + (current.x - drag.start.x),
                    y: drag.origin.y + (current.y - drag.start.y)
                };
                drag.element.setAttribute("transform", `translate(${drag.last.x}, ${drag.last.y})`);
            }
        }, { signal });

        const finish = (event: PointerEvent, released: boolean): void => {
            const tapped = released && press !== null
                && Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) <= TAP_TOLERANCE_PX;

            if (drag?.last && !tapped) {
                this.onNodeMoved(drag.id, drag.last);
            }
            if (pan || drag) {
                this.container.releasePointerCapture(event.pointerId);
            }
            this.container.classList.remove("is-panning");
            const target = press?.target ?? null;
            pan = null;
            drag = null;
            press = null;

            if (tapped) {
                this.onTap(target);
            }
        };

        this.container.addEventListener("pointerup", event => finish(event, true), { signal });
        this.container.addEventListener("pointercancel", event => finish(event, false), { signal });
    }
}
