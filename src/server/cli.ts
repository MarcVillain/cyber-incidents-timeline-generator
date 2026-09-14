#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { seedSampleData } from "../core/sample.js";
import { TimelineService } from "../core/service.js";
import { createTimelineServer, openSqliteStore } from "./index.js";

const COMMAND = "cyber-incidents-timeline-generator";
const DEFAULT_PORT = "8080";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_DATABASE = "timeline.sqlite";
const HIGHEST_PORT = 65535;

// The incident app ships inside the package, two folders above this file once compiled
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const { values } = parseArgs({
    options: {
        db: { type: "string", default: DEFAULT_DATABASE },
        port: { type: "string", default: DEFAULT_PORT },
        host: { type: "string", default: DEFAULT_HOST },
        "api-only": { type: "boolean", default: false },
        seed: { type: "boolean", default: false },
        help: { type: "boolean", default: false }
    }
});

if (values.help) {
    console.log(`Usage: ${COMMAND} [options]

  --db <file>    SQLite file to use (default ${DEFAULT_DATABASE}, ":memory:" for a throwaway one)
  --port <port>  Port to listen on (default ${DEFAULT_PORT})
  --host <host>  Interface to bind (default ${DEFAULT_HOST}, local only)
  --api-only     Serve the REST API alone, without the incident app
  --seed         Add the sample incident when the database holds none
`);
    process.exit(0);
}

const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > HIGHEST_PORT) {
    console.error(`--port must be a number between 1 and ${HIGHEST_PORT}, not ${values.port}.`);
    process.exit(1);
}

const { store } = await openSqliteStore(values.db);
const service = new TimelineService(store);

if (values.seed && (await service.listIncidents()).length === 0) {
    const incident = await seedSampleData(service);
    console.log(`Seeded "${incident.title}" as incident ${incident.id}.`);
}

const server = createTimelineServer({
    api: service,
    staticMounts: values["api-only"] ? [] : [
        { prefix: "/dist/", directory: resolve(PACKAGE_ROOT, "dist") },
        { prefix: "/styles/", directory: resolve(PACKAGE_ROOT, "styles") },
        { prefix: "/", directory: resolve(PACKAGE_ROOT, "app") }
    ]
});

server.listen(port, values.host, () => {
    const origin = `http://${values.host}:${port}`;
    console.log(`Timeline generator listening on ${origin}`);
    console.log(`REST API under ${origin}/api`);
    if (!values["api-only"]) {
        console.log(`Incident app at ${origin}/, or ${origin}/local.html to keep incidents in the browser only`);
    }
});
