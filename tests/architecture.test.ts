import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const BROWSER_FOLDERS = ["src/core", "src/storage", "src/ui", "src/render"];
const NODE_IMPORT = /from\s+["']node:/;
const SERVER_IMPORT = /from\s+["'][./]*server\//;

function sources(folder: string): string[] {
    return readdirSync(folder).flatMap(entry => {
        const path = join(folder, entry);
        return statSync(path).isDirectory() ? sources(path) : path.endsWith(".ts") ? [path] : [];
    });
}

describe("architecture", () => {
    it("keeps everything a browser loads free of Node modules and server code", () => {
        const offenders = BROWSER_FOLDERS
            .flatMap(folder => sources(join(PROJECT_ROOT, folder)))
            .filter(file => {
                const content = readFileSync(file, "utf8");
                return NODE_IMPORT.test(content) || SERVER_IMPORT.test(content);
            })
            .map(file => relative(PROJECT_ROOT, file));
        assert.deepEqual(offenders, []);
    });

    it("never builds markup from strings in the workspace", () => {
        const offenders = sources(join(PROJECT_ROOT, "src/ui"))
            .filter(file => /\.innerHTML\s*=/.test(readFileSync(file, "utf8")))
            .map(file => relative(PROJECT_ROOT, file));
        assert.deepEqual(offenders, []);
    });
});
