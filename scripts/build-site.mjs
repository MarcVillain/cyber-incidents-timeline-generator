// Assembles the browser only incident desk into site/, a folder any static host can serve as it is, such as
// GitHub Pages. Incidents stay in the local storage of each visitor's browser; nothing is sent anywhere.

import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = resolve(ROOT, "site");
const DIST = resolve(ROOT, "dist");
const PAGE = "local.html";
const PAGE_FILES = ["local.js", "presets.js", "app.css", "favicon.svg"];
// Node only code and type declarations are of no use to a browser
const SERVER_FOLDER = "server";
const DECLARATION = ".d.ts";

function browserFile(source) {
    return relative(DIST, source).split(sep)[0] !== SERVER_FOLDER && !source.endsWith(DECLARATION);
}

await rm(SITE, { recursive: true, force: true });
await mkdir(SITE, { recursive: true });

await cp(resolve(ROOT, "app", PAGE), resolve(SITE, "index.html"));
for (const file of PAGE_FILES) {
    await cp(resolve(ROOT, "app", file), resolve(SITE, file));
}
await cp(DIST, resolve(SITE, "dist"), { recursive: true, filter: browserFile });
await cp(resolve(ROOT, "styles"), resolve(SITE, "styles"), { recursive: true });

console.log(`Browser only desk assembled in ${relative(ROOT, SITE)}${sep}`);
