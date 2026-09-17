// Turning the drawn pages into files. Everything starts from the same SVG the screen shows, so an
// exported slide is the slide, not a second implementation of it. Icons are paths, so a file needs
// nothing from the application to render.

import { SVG_NS, svgDocument } from "./svg.js";
import { FONT_STACK } from "./theme.js";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./viewport.js";
import { DEFAULT_STRINGS, type DeckStrings } from "./strings.js";

export enum ExportFormat {
    Png = "png",
    Svg = "svg",
    Html = "html",
    Print = "print"
}

const PNG_SCALE = 2;
const SLUG_LENGTH = 60;
const PRINT_CLEANUP_MS = 1000;

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, SLUG_LENGTH) || "diagram";
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * How a page is wrapped into a standalone SVG file. The defaults are the slide as the screen draws it;
 * a server rendering for a dark page or a branded report supplies its own.
 */
export interface SerializeOptions {
    width?: number;
    height?: number;
    /** Painted behind the slide; without it the file is transparent, as it has always been. */
    background?: string | null;
    /** Replaces the font rule, for example to embed a face. */
    styles?: string;
    /** Turns the tree into text. Defaults to XMLSerializer, which every browser has. */
    serializer?: XmlSerializer;
}

/** The one method of XMLSerializer this needs, so a host on the server can hand over its own. */
export interface XmlSerializer {
    serializeToString(node: Node): string;
}

export function serialize(page: SVGGElement, options: SerializeOptions = {}): string {
    const width = options.width ?? PAGE_WIDTH;
    const height = options.height ?? PAGE_HEIGHT;
    const owner = svgDocument();

    const svg = owner.createElementNS(SVG_NS, "svg");
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const style = owner.createElementNS(SVG_NS, "style");
    style.textContent = options.styles ?? `text{font-family:${FONT_STACK};}`;
    svg.appendChild(style);

    if (options.background) {
        const ground = owner.createElementNS(SVG_NS, "rect");
        ground.setAttribute("width", String(width));
        ground.setAttribute("height", String(height));
        ground.setAttribute("fill", options.background);
        svg.appendChild(ground);
    }

    svg.appendChild(page.cloneNode(true));
    return text(svg, options.serializer);
}

/**
 * XMLSerializer is a browser service. A DOM built on the server may have none, and its elements already
 * serialize themselves, which is why outerHTML is the fallback rather than a failure.
 */
function text(svg: SVGSVGElement, serializer: XmlSerializer | undefined): string {
    if (serializer) return serializer.serializeToString(svg);
    if (typeof XMLSerializer === "function") return new XMLSerializer().serializeToString(svg);
    return svg.outerHTML;
}

function download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function filename(name: string, index: number, count: number, extension: string): string {
    const suffix = count > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
    return `${slug(name)}${suffix}.${extension}`;
}

async function toPngBlob(markup: string, background: string): Promise<Blob> {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The diagram could not be rasterized."));
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    });

    const canvas = document.createElement("canvas");
    canvas.width = PAGE_WIDTH * PNG_SCALE;
    canvas.height = PAGE_HEIGHT * PNG_SCALE;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("This browser cannot draw on a canvas.");
    }
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("The PNG could not be encoded."))), "image/png"));
}

export async function exportSvg(pages: readonly SVGGElement[], name: string): Promise<void> {
    pages.forEach((page, index) => download(new Blob([serialize(page)], { type: "image/svg+xml" }), filename(name, index, pages.length, "svg")));
}

export async function exportPng(pages: readonly SVGGElement[], name: string, background: string): Promise<void> {
    for (const [index, page] of pages.entries()) {
        download(await toPngBlob(serialize(page), background), filename(name, index, pages.length, "png"));
    }
}

/**
 * A single file holding every slide, with the keyboard moving between them. Opens anywhere and needs
 * nothing from the application.
 */
export function standaloneHtml(pages: readonly SVGGElement[], title: string, strings: DeckStrings = DEFAULT_STRINGS.deck, locale = "en"): string {
    const slides = pages
        .map((page, index) => `<figure class="slide" id="slide-${index}"${index === 0 ? "" : " hidden"}>${serialize(page)}</figure>`)
        .join("\n");

    return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #f4f5f7; font-family: ${FONT_STACK}; color: #1f2328; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem 1.25rem; background: #fff; border-bottom: 1px solid #dcdfe4; }
  h1 { font-size: 1rem; margin: 0; font-weight: 600; }
  nav { display: flex; align-items: center; gap: .5rem; font-size: .85rem; }
  button { border: 1px solid #dcdfe4; background: #fff; border-radius: 6px; padding: .3rem .7rem; cursor: pointer; font: inherit; }
  button:disabled { opacity: .4; cursor: default; }
  main { padding: 1.25rem; }
  .slide { margin: 0 auto; max-width: ${PAGE_WIDTH}px; background: #fff; border: 1px solid #dcdfe4; border-radius: 10px; overflow: hidden; }
  .slide svg { display: block; width: 100%; height: auto; }
  [hidden] { display: none !important; }
  @media print {
    header { display: none; }
    main { padding: 0; }
    .slide { border: none; border-radius: 0; page-break-after: always; }
    .slide[hidden] { display: block !important; }
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <nav>
    <button type="button" data-step="-1">${escapeHtml(strings.previous)}</button>
    <span id="counter">1 / ${pages.length}</span>
    <button type="button" data-step="1">${escapeHtml(strings.next)}</button>
    <button type="button" id="print">${escapeHtml(strings.print)}</button>
  </nav>
</header>
<main>
${slides}
</main>
<script>
  var current = 0;
  var slides = document.querySelectorAll(".slide");
  var counter = document.getElementById("counter");
  function show(index) {
    current = Math.min(Math.max(index, 0), slides.length - 1);
    slides.forEach(function (slide, position) { slide.hidden = position !== current; });
    counter.textContent = (current + 1) + " / " + slides.length;
    document.querySelectorAll("[data-step]").forEach(function (button) {
      var step = Number(button.dataset.step);
      button.disabled = (step < 0 && current === 0) || (step > 0 && current === slides.length - 1);
    });
  }
  document.querySelectorAll("[data-step]").forEach(function (button) {
    button.addEventListener("click", function () { show(current + Number(button.dataset.step)); });
  });
  document.getElementById("print").addEventListener("click", function () { window.print(); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "ArrowRight") show(current + 1);
    if (event.key === "ArrowLeft") show(current - 1);
  });
  show(0);
</script>
</body>
</html>`;
}

export async function exportHtml(pages: readonly SVGGElement[], name: string, title: string, strings: DeckStrings = DEFAULT_STRINGS.deck, locale = "en"): Promise<void> {
    download(new Blob([standaloneHtml(pages, title, strings, locale)], { type: "text/html" }), `${slug(name)}.html`);
}

/**
 * Hands every page to the print dialog at once, which is how a PDF gets made.
 */
export async function printPages(pages: readonly SVGGElement[], title: string): Promise<void> {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const target = frame.contentDocument;
    const view = frame.contentWindow;
    if (!target || !view) {
        frame.remove();
        throw new Error("The print frame could not be opened.");
    }

    target.title = title;
    const style = target.createElement("style");
    style.textContent = `@page { size: ${PAGE_WIDTH}px ${PAGE_HEIGHT}px; margin: 0; } body { margin: 0; } figure { margin: 0; page-break-after: always; } svg { display: block; width: 100%; height: auto; }`;
    target.head.appendChild(style);
    pages.forEach(page => {
        const figure = target.createElement("figure");
        figure.appendChild(target.importNode(page.ownerSVGElement ?? wrapPage(page), true));
        target.body.appendChild(figure);
    });

    view.focus();
    view.print();
    window.setTimeout(() => frame.remove(), PRINT_CLEANUP_MS);
}

function wrapPage(page: SVGGElement): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`);
    svg.appendChild(page.cloneNode(true));
    return svg;
}
