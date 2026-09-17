// The build runs TypeScript 7, whose bin is an extensionless file inside a "type":"module" package.
// Only Node 22.13 and later can load one, and an older Node fails deep inside tsc with an error that
// never mentions the Node version. Said here instead, before the build starts.

import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const required = manifest.engines.node.replace(/^[^\d]*/, "");

function parts(version) {
    return version.replace(/^v/, "").split(".").map(Number);
}

function olderThan(version, minimum) {
    const left = parts(version);
    const right = parts(minimum);
    for (let index = 0; index < right.length; index += 1) {
        const a = left[index] ?? 0;
        const b = right[index] ?? 0;
        if (a !== b) return a < b;
    }
    return false;
}

if (olderThan(process.versions.node, required)) {
    process.stderr.write(
        `\nThis package needs Node ${required} or later to build, and this is Node ${process.versions.node}.\n` +
        `TypeScript 7 ships its compiler as an extensionless ES module, which older versions cannot load.\n\n` +
        `  nvm use            (the version is in .nvmrc)\n\n`
    );
    process.exit(1);
}

