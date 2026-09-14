// Generates src/ui/icons/shapes.ts from lucide-static, a development dependency only.
//
// Every icon is flattened to plain path data at build time, so the runtime draws each one with a
// single element type and ships nothing but the handful of icons the diagrams actually use.
// Each entry lists lucide names in order of preference, because lucide renames icons between majors.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const ICONS = {
    User: ["user"],
    Users: ["users"],
    Company: ["building-2", "building"],
    ThreatActor: ["venetian-mask", "user-x"],
    Vendor: ["handshake"],
    Authority: ["landmark"],
    Workstation: ["monitor"],
    Server: ["server"],
    Account: ["id-card", "contact"],
    Mailbox: ["mail"],
    File: ["file"],
    Application: ["app-window"],
    Network: ["network"],
    Cloud: ["cloud"],
    Credential: ["key-round", "key"],
    Database: ["database"],
    Device: ["smartphone"],
    Malware: ["biohazard", "bug"],
    Tool: ["wrench"],
    Exploit: ["bug"],
    Beacon: ["radio-tower"],
    Domain: ["globe"],
    Address: ["crosshair"],
    Infrastructure: ["layers", "layers-3"],
    Unknown: ["circle-question-mark", "circle-help"],
    Target: ["target"],
    Shield: ["shield-half", "shield"],
    Helper: ["hand-helping", "handshake"],
    Binoculars: ["binoculars"],
    Flask: ["flask-conical"],
    Door: ["door-open"],
    Bolt: ["zap"],
    Anchor: ["anchor"],
    Escalation: ["trending-up"],
    Evasion: ["eye-off"],
    Search: ["search"],
    Lateral: ["arrow-left-right"],
    Archive: ["archive"],
    Upload: ["cloud-upload"],
    Blast: ["bomb", "flame"],
    Send: ["send"],
    Download: ["download"],
    Microscope: ["microscope"],
    Trash: ["trash-2"],
    Recover: ["refresh-cw"],
    Review: ["clipboard-check"],
    Success: ["circle-check"],
    Failure: ["circle-x"],
    Blocked: ["ban"],
    Eye: ["eye"],
    Timeline: ["git-commit-horizontal"],
    Lanes: ["rows-3"],
    Scale: ["scale"],
    Graph: ["share-2"],
    Columns: ["columns-3"],
    Branch: ["git-branch"],
    Gem: ["gem"],
    Grid: ["grid-3x3", "grid-3-x-3"],
    Radius: ["circle-dot"],
    Timer: ["timer"],
    Evidence: ["file-search"],
    Text: ["text-align-start", "align-left"],
    ArrowRight: ["arrow-right"],
    Link: ["link"],
    Check: ["check"],
    Close: ["x"],
    Plus: ["plus"],
    Undo: ["undo-2"],
    Redo: ["redo-2"],
    ZoomIn: ["zoom-in"],
    ZoomOut: ["zoom-out"],
    Fit: ["minimize-2"],
    Image: ["image"],
    Vector: ["pen-tool"],
    Code: ["code"],
    Print: ["printer"],
    ChevronLeft: ["chevron-left"],
    ChevronRight: ["chevron-right"],
    Warning: ["triangle-alert", "alert-triangle"],
    Compromised: ["flame"],
    Sun: ["sun"],
    Moon: ["moon"],
    Auto: ["sun-moon", "contrast"]
};

const require = createRequire(import.meta.url);
const iconFolder = join(dirname(require.resolve("lucide-static/package.json")), "icons");

function attributes(source) {
    const found = {};
    for (const match of source.matchAll(/([a-zA-Z0-9:-]+)="([^"]*)"/g)) {
        found[match[1]] = match[2];
    }
    return found;
}

function number(value) {
    return Number.parseFloat(value || "0");
}

function round(value) {
    return Number(value.toFixed(3));
}

function circlePath(cx, cy, rx, ry) {
    return `M${round(cx - rx)} ${round(cy)}a${round(rx)} ${round(ry)} 0 1 0 ${round(rx * 2)} 0a${round(rx)} ${round(ry)} 0 1 0 ${round(-rx * 2)} 0`;
}

function rectPath(x, y, width, height, rx, ry) {
    if (!rx && !ry) {
        return `M${x} ${y}h${width}v${height}h${-width}z`;
    }
    const cornerX = Math.min(rx || ry, width / 2);
    const cornerY = Math.min(ry || rx, height / 2);
    return [
        `M${round(x + cornerX)} ${y}`,
        `h${round(width - cornerX * 2)}`,
        `a${cornerX} ${cornerY} 0 0 1 ${cornerX} ${cornerY}`,
        `v${round(height - cornerY * 2)}`,
        `a${cornerX} ${cornerY} 0 0 1 ${-cornerX} ${cornerY}`,
        `h${round(-(width - cornerX * 2))}`,
        `a${cornerX} ${cornerY} 0 0 1 ${-cornerX} ${-cornerY}`,
        `v${round(-(height - cornerY * 2))}`,
        `a${cornerX} ${cornerY} 0 0 1 ${cornerX} ${-cornerY}`,
        "z"
    ].join("");
}

function pointsPath(points, closed) {
    const pairs = points.trim().split(/[\s,]+/).map(Number);
    const commands = [];
    for (let index = 0; index < pairs.length; index += 2) {
        commands.push(`${index === 0 ? "M" : "L"}${pairs[index]} ${pairs[index + 1]}`);
    }
    return commands.join("") + (closed ? "z" : "");
}

function toPaths(svg) {
    const paths = [];
    for (const match of svg.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)\/?>/g)) {
        const [, tag, raw] = match;
        const a = attributes(raw);
        switch (tag) {
            case "path":
                paths.push(a.d);
                break;
            case "circle":
                paths.push(circlePath(number(a.cx), number(a.cy), number(a.r), number(a.r)));
                break;
            case "ellipse":
                paths.push(circlePath(number(a.cx), number(a.cy), number(a.rx), number(a.ry)));
                break;
            case "rect":
                paths.push(rectPath(number(a.x), number(a.y), number(a.width), number(a.height), number(a.rx), number(a.ry)));
                break;
            case "line":
                paths.push(`M${a.x1} ${a.y1}L${a.x2} ${a.y2}`);
                break;
            case "polyline":
                paths.push(pointsPath(a.points, false));
                break;
            case "polygon":
                paths.push(pointsPath(a.points, true));
                break;
        }
    }
    return paths;
}

const entries = Object.entries(ICONS).map(([member, candidates]) => {
    const chosen = candidates.find(name => existsSync(join(iconFolder, `${name}.svg`)));
    if (!chosen) {
        throw new Error(`None of ${candidates.join(", ")} exists in lucide-static for Icon.${member}`);
    }
    const paths = toPaths(readFileSync(join(iconFolder, `${chosen}.svg`), "utf8"));
    return `    [Icon.${member}]: ${JSON.stringify(paths)}`;
});

const output = `// Generated by scripts/build-icons.mjs from lucide-static (ISC licence). Do not edit by hand.

import { Icon } from "../../core/icon.js";

export const ICON_SHAPES: Readonly<Record<Icon, readonly string[]>> = {
${entries.join(",\n")}
};
`;

writeFileSync(new URL("../src/ui/icons/shapes.ts", import.meta.url), output);
console.log(`Wrote ${entries.length} icons.`);
