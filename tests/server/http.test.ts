import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { NodeKind, Permission } from "../../src/core/enums.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../src/core/errors.js";
import { buildCatalog } from "../../src/core/catalog.js";
import { emptyCatalogSettings, type CatalogSettings } from "../../src/core/catalog-settings.js";
import { MemoryCatalogStore } from "../../src/storage/catalog-stores.js";
import { seedSampleData } from "../../src/core/sample.js";
import { TimelineService } from "../../src/core/service.js";
import { HttpStatus, createTimelineServer, type TimelineServerOptions } from "../../src/server/index.js";
import { HttpTimelineApi } from "../../src/storage/http-api.js";
import { MemoryTimelineStore } from "../../src/storage/memory-store.js";
import { CUSTOM_SCALE, SAMPLE_START } from "../support/fixtures.js";

const LOCALHOST = "127.0.0.1";
const SMALL_BODY_LIMIT = 64;
const READ_ONLY_HEADER = "x-read-only";
const NO_CONFIGURE_HEADER = "x-no-configure";
const LEGAL = { value: "legal", label: "Legal" };

function withLegal(): CatalogSettings {
    return { ...emptyCatalogSettings(), vocabulary: { audiences: [...buildCatalog().audiences, LEGAL] } };
}

async function listen(options: TimelineServerOptions): Promise<{ server: Server; origin: string }> {
    const server = createTimelineServer(options);
    await new Promise<void>(resolve => server.listen(0, LOCALHOST, resolve));
    const address: AddressInfo | string | null = server.address();
    if (address === null || typeof address === "string") {
        throw new Error("The test server has no port.");
    }
    return { server, origin: `http://${LOCALHOST}:${address.port}` };
}

async function close(server: Server): Promise<void> {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

describe("catalog settings over HTTP", () => {
    it("reads, checks and saves the catalog settings, behind the configure permission", async () => {
        const service = new TimelineService(new MemoryTimelineStore(), { catalogStore: new MemoryCatalogStore() });
        await seedSampleData(service, SAMPLE_START);
        const { server, origin } = await listen({
            api: service,
            authorize: (request, permission) => !(request.headers[NO_CONFIGURE_HEADER] && permission === Permission.Configure),
            onError: () => undefined
        });
        const api = new HttpTimelineApi({ baseUrl: `${origin}/api` });
        const limited = new HttpTimelineApi({ baseUrl: `${origin}/api`, headers: () => ({ [NO_CONFIGURE_HEADER]: "1" }) });
        try {
            assert.deepEqual(await api.getCatalogSettings(), emptyCatalogSettings());
            const catalog = await api.saveCatalogSettings(withLegal());
            assert.ok(catalog.audiences.some(entry => entry.value === LEGAL.value));
            assert.deepEqual(await limited.getCatalogSettings(), withLegal());
            await assert.rejects(limited.saveCatalogSettings(emptyCatalogSettings()), ForbiddenError);
            await assert.rejects(limited.catalogUsage(emptyCatalogSettings()), ForbiddenError);
            const withoutSides = { ...emptyCatalogSettings(), vocabulary: { sides: buildCatalog().sides.slice(0, 1) } };
            assert.ok((await api.catalogUsage(withoutSides)).length > 0);
        } finally {
            await close(server);
        }
    });

    it("answers conflict where the catalog is kept in code", async () => {
        const { server, origin } = await listen({ api: new TimelineService(new MemoryTimelineStore()), onError: () => undefined });
        try {
            await assert.rejects(new HttpTimelineApi({ baseUrl: `${origin}/api` }).saveCatalogSettings(withLegal()), ConflictError);
        } finally {
            await close(server);
        }
    });
});

describe("REST contract end to end", () => {
    const service = new TimelineService(new MemoryTimelineStore());
    let server: Server;
    let origin: string;
    let api: HttpTimelineApi;
    let staticRoot: string;

    before(async () => {
        staticRoot = await mkdtemp(join(tmpdir(), "tlg-static-"));
        await mkdir(join(staticRoot, ".hidden"));
        await writeFile(join(staticRoot, "index.html"), "<p>demo</p>");
        await writeFile(join(staticRoot, ".hidden", "secret.html"), "secret");

        const started = await listen({
            api: service,
            maxBodyBytes: 100_000,
            authorize: (request, permission) => !(request.headers[READ_ONLY_HEADER] && permission !== Permission.Read),
            staticMounts: [{ prefix: "/", directory: staticRoot }],
            onError: () => undefined
        });
        server = started.server;
        origin = started.origin;
        api = new HttpTimelineApi({ baseUrl: `${origin}/api` });
    });

    after(async () => {
        await close(server);
        await rm(staticRoot, { recursive: true, force: true });
    });

    it("serves the same diagram over HTTP as in process", async () => {
        const incident = await seedSampleData(api, SAMPLE_START);
        assert.deepEqual(await api.getDiagram(incident.id), await service.getDiagram(incident.id));
        assert.equal((await api.listIncidents()).length, (await service.listIncidents()).length);
        assert.ok((await api.getCatalog()).sides.length > 0);
    });

    it("carries a whole timeline over the wire, out and back in", async () => {
        const incident = await seedSampleData(api, SAMPLE_START);
        const document = await api.exportDocument(incident.id);
        assert.ok(document.nodes.length > 0);

        const report = await api.importDocument(document, { title: "Copied over the wire" });
        assert.notEqual(report.incidentId, incident.id);
        assert.equal((await api.getIncident(report.incidentId)).title, "Copied over the wire");

        const before = await api.getSummary(incident.id);
        const after = await api.getSummary(report.incidentId);
        assert.equal(after.nodes.total, before.nodes.total);
        assert.equal(after.steps.total, before.steps.total);
    });

    it("reads a document into an incident that already exists", async () => {
        const incident = await seedSampleData(api, SAMPLE_START);
        const empty = await api.createIncident({ title: "Empty" });
        const report = await api.importDocument(await api.exportDocument(incident.id), { into: empty.id });

        assert.equal(report.incidentId, empty.id);
        assert.ok((await api.getSummary(empty.id)).steps.total > 0);
    });

    it("refuses a document that is not one of ours", async () => {
        await assert.rejects(api.importDocument({ format: "something-else", version: 1, incident: { title: "x" } }), ValidationError);
    });

    it("updates and deletes through the client", async () => {
        const incident = await api.createIncident({ title: "Over the wire" });
        const node = await api.createNode(incident.id, { name: "Host", kind: NodeKind.Server });
        await api.updateNode(incident.id, node.id, { role: "Mail relay" });
        assert.equal((await api.getDiagram(incident.id)).nodes[0]?.role, "Mail relay");

        await api.deleteIncident(incident.id);
        await assert.rejects(api.getIncident(incident.id), NotFoundError);
    });

    it("turns validation failures into issues the client can read", async () => {
        await assert.rejects(api.createIncident({ title: "" }), (error: unknown) => error instanceof ValidationError && error.issues.some(issue => issue.field === "title"));
    });

    it("refuses what the authorizer refuses", async () => {
        const readOnly = new HttpTimelineApi({ baseUrl: `${origin}/api`, headers: () => ({ [READ_ONLY_HEADER]: "1" }) });
        await assert.rejects(readOnly.createIncident({ title: "Denied" }), ForbiddenError);
        assert.ok(Array.isArray(await readOnly.listIncidents()));
    });

    it("answers malformed requests with the right status", async () => {
        const plain = await fetch(`${origin}/api/incidents`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
        assert.equal(plain.status, HttpStatus.UnsupportedMediaType);

        const broken = await fetch(`${origin}/api/incidents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
        assert.equal(broken.status, HttpStatus.BadRequest);

        const wrongMethod = await fetch(`${origin}/api/catalog`, { method: "DELETE" });
        assert.equal(wrongMethod.status, HttpStatus.MethodNotAllowed);

        const unknown = await fetch(`${origin}/api/nowhere`);
        assert.equal(unknown.status, HttpStatus.NotFound);

        const badId = await fetch(`${origin}/api/incidents/abc`);
        assert.equal(badId.status, HttpStatus.NotFound);
    });

    it("serves static files without leaving the mount or showing hidden ones", async () => {
        assert.equal((await fetch(`${origin}/`)).status, HttpStatus.Ok);
        assert.equal((await fetch(`${origin}/.hidden/secret.html`)).status, HttpStatus.NotFound);
        assert.equal((await fetch(`${origin}/..%2f..%2fetc%2fpasswd`)).status, HttpStatus.NotFound);
    });
});

describe("REST contract with a configured impact scale", () => {
    it("validates ratings against the scale of the service it serves", async () => {
        const { server, origin } = await listen({ api: new TimelineService(new MemoryTimelineStore(), { impactScale: CUSTOM_SCALE }) });
        try {
            const api = new HttpTimelineApi({ baseUrl: `${origin}/api` });
            assert.equal((await api.createIncident({ title: "Rated", impact: "P1" })).impact, "P1");
            await assert.rejects(api.createIncident({ title: "Default key", impact: "High" }), ValidationError);
        } finally {
            await close(server);
        }
    });
});

describe("REST contract limits", () => {
    it("refuses a body over the limit", async () => {
        const { server, origin } = await listen({ api: new TimelineService(new MemoryTimelineStore()), maxBodyBytes: SMALL_BODY_LIMIT });
        try {
            const response = await fetch(`${origin}/api/incidents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "x".repeat(SMALL_BODY_LIMIT * 2) })
            });
            assert.equal(response.status, HttpStatus.PayloadTooLarge);
        } finally {
            await close(server);
        }
    });
});
