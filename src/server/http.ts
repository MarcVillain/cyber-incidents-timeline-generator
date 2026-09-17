import type { IncomingMessage, ServerResponse } from "node:http";
import { Permission } from "../core/enums.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../core/errors.js";
import type { RecordId } from "../core/models.js";
import type { TimelineApi } from "../core/service.js";
import {
    readIncidentCreate,
    readIncidentUpdate,
    readLayouts,
    readLinkCreate,
    readLinkUpdate,
    readNodeCreate,
    readNodeUpdate,
    readStepCreate,
    readStepUpdate,
    ValidationRules
} from "../core/validation.js";
import { HttpMethod } from "../storage/http-api.js";

export enum HttpStatus {
    Ok = 200,
    Created = 201,
    NoContent = 204,
    BadRequest = 400,
    Forbidden = 403,
    NotFound = 404,
    MethodNotAllowed = 405,
    PayloadTooLarge = 413,
    UnsupportedMediaType = 415,
    InternalServerError = 500
}

/**
 * Decides whether the caller behind a request may do what it asks. The incident is null for requests
 * that are not about one incident, such as listing them or reading the catalog.
 */
export type Authorizer = (request: IncomingMessage, permission: Permission, incidentId: RecordId | null) => boolean | Promise<boolean>;

export interface TimelineHttpOptions {
    api: TimelineApi;
    /** Path the REST contract is served under. */
    basePath?: string;
    /** Every request is refused unless this says yes. Omit it only for a local, single user tool. */
    authorize?: Authorizer;
    maxBodyBytes?: number;
    onError?: (error: unknown) => void;
}

export const DEFAULT_MAX_BODY_BYTES = 1_000_000;

class PayloadTooLargeError extends Error {}
class UnsupportedMediaTypeError extends Error {}
class MalformedBodyError extends Error {}

interface RouteParams {
    incidentId: RecordId | null;
    recordId: RecordId | null;
}

interface RouteResult {
    status: HttpStatus;
    body?: unknown;
}

interface RouteContext {
    params: RouteParams;
    body(): Promise<unknown>;
    rules(): Promise<ValidationRules>;
}

enum Segment {
    Incident = ":incident",
    Record = ":record"
}

interface Route {
    method: HttpMethod;
    pattern: readonly string[];
    permission: Permission;
    handle(context: RouteContext): Promise<RouteResult>;
}

function ok(body: unknown): RouteResult {
    return { status: HttpStatus.Ok, body };
}

function created(body: unknown): RouteResult {
    return { status: HttpStatus.Created, body };
}

const NO_CONTENT: RouteResult = { status: HttpStatus.NoContent };

function required(value: RecordId | null): RecordId {
    if (value === null) {
        throw new Error("The route matched without the identifier its pattern declares.");
    }
    return value;
}

function buildRoutes(api: TimelineApi): Route[] {
    const incident = (context: RouteContext): RecordId => required(context.params.incidentId);
    const record = (context: RouteContext): RecordId => required(context.params.recordId);
    const incidentPath = ["incidents", Segment.Incident];

    return [
        { method: HttpMethod.Get, pattern: ["catalog"], permission: Permission.Read, handle: async () => ok(await api.getCatalog()) },
        { method: HttpMethod.Get, pattern: ["incidents"], permission: Permission.Read, handle: async () => ok(await api.listIncidents()) },
        { method: HttpMethod.Post, pattern: ["incidents"], permission: Permission.Create, handle: async context => created(await api.createIncident(readIncidentCreate(await context.body(), await context.rules()))) },
        { method: HttpMethod.Get, pattern: incidentPath, permission: Permission.Read, handle: async context => ok(await api.getIncident(incident(context))) },
        { method: HttpMethod.Put, pattern: incidentPath, permission: Permission.Update, handle: async context => { await api.updateIncident(incident(context), readIncidentUpdate(await context.body(), await context.rules())); return NO_CONTENT; } },
        { method: HttpMethod.Delete, pattern: incidentPath, permission: Permission.Delete, handle: async context => { await api.deleteIncident(incident(context)); return NO_CONTENT; } },
        { method: HttpMethod.Get, pattern: [...incidentPath, "diagram"], permission: Permission.Read, handle: async context => ok(await api.getDiagram(incident(context))) },
        { method: HttpMethod.Get, pattern: [...incidentPath, "summary"], permission: Permission.Read, handle: async context => ok(await api.getSummary(incident(context))) },

        { method: HttpMethod.Post, pattern: [...incidentPath, "nodes"], permission: Permission.Create, handle: async context => created(await api.createNode(incident(context), readNodeCreate(await context.body(), await context.rules()))) },
        { method: HttpMethod.Put, pattern: [...incidentPath, "nodes", Segment.Record], permission: Permission.Update, handle: async context => { await api.updateNode(incident(context), record(context), readNodeUpdate(await context.body(), await context.rules())); return NO_CONTENT; } },
        { method: HttpMethod.Delete, pattern: [...incidentPath, "nodes", Segment.Record], permission: Permission.Delete, handle: async context => { await api.deleteNode(incident(context), record(context)); return NO_CONTENT; } },

        { method: HttpMethod.Post, pattern: [...incidentPath, "steps"], permission: Permission.Create, handle: async context => created(await api.createStep(incident(context), readStepCreate(await context.body(), await context.rules()))) },
        { method: HttpMethod.Put, pattern: [...incidentPath, "steps", Segment.Record], permission: Permission.Update, handle: async context => { await api.updateStep(incident(context), record(context), readStepUpdate(await context.body(), await context.rules())); return NO_CONTENT; } },
        { method: HttpMethod.Delete, pattern: [...incidentPath, "steps", Segment.Record], permission: Permission.Delete, handle: async context => { await api.deleteStep(incident(context), record(context)); return NO_CONTENT; } },

        { method: HttpMethod.Post, pattern: [...incidentPath, "links"], permission: Permission.Create, handle: async context => created(await api.createLink(incident(context), readLinkCreate(await context.body()))) },
        { method: HttpMethod.Put, pattern: [...incidentPath, "links", Segment.Record], permission: Permission.Update, handle: async context => { await api.updateLink(incident(context), record(context), readLinkUpdate(await context.body())); return NO_CONTENT; } },
        { method: HttpMethod.Delete, pattern: [...incidentPath, "links", Segment.Record], permission: Permission.Delete, handle: async context => { await api.deleteLink(incident(context), record(context)); return NO_CONTENT; } },

        { method: HttpMethod.Put, pattern: [...incidentPath, "layout"], permission: Permission.Update, handle: async context => { await api.saveLayout(incident(context), readLayouts(await context.body())); return NO_CONTENT; } }
    ];
}

function parseId(segment: string): RecordId | null {
    return /^[1-9]\d{0,15}$/.test(segment) ? Number(segment) : null;
}

/**
 * The identifiers a path carries when it has the shape of the pattern, or null when it does not.
 */
function match(pattern: readonly string[], segments: readonly string[]): RouteParams | null {
    if (pattern.length !== segments.length) return null;

    const params: RouteParams = { incidentId: null, recordId: null };
    for (const [index, expected] of pattern.entries()) {
        const actual = segments[index] ?? "";
        if (expected === Segment.Incident || expected === Segment.Record) {
            const id = parseId(actual);
            if (id === null) return null;
            if (expected === Segment.Incident) params.incidentId = id;
            else params.recordId = id;
        } else if (expected !== actual) {
            return null;
        }
    }
    return params;
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
    const contentType = request.headers["content-type"] ?? "";
    if (!/^application\/json\b/i.test(contentType)) {
        throw new UnsupportedMediaTypeError("Send the body as application/json.");
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        size += buffer.length;
        if (size > maxBytes) {
            throw new PayloadTooLargeError(`The body is larger than ${maxBytes} bytes.`);
        }
        chunks.push(buffer);
    }

    try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        return parsed;
    } catch {
        throw new MalformedBodyError("The body is not valid JSON.");
    }
}

function send(response: ServerResponse, status: HttpStatus, body?: unknown): void {
    response.statusCode = status;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (body === undefined) {
        response.end();
        return;
    }
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
}

function statusOf(error: unknown): HttpStatus {
    if (error instanceof ValidationError || error instanceof MalformedBodyError) return HttpStatus.BadRequest;
    if (error instanceof NotFoundError) return HttpStatus.NotFound;
    if (error instanceof ForbiddenError) return HttpStatus.Forbidden;
    if (error instanceof PayloadTooLargeError) return HttpStatus.PayloadTooLarge;
    if (error instanceof UnsupportedMediaTypeError) return HttpStatus.UnsupportedMediaType;
    return HttpStatus.InternalServerError;
}

function errorBody(error: unknown, status: HttpStatus): unknown {
    if (status === HttpStatus.InternalServerError || !(error instanceof Error)) {
        // Internal details stay on the server; the caller only learns that it failed
        return { message: "The request could not be completed." };
    }
    if (error instanceof ValidationError) {
        return { message: error.message, issues: error.issues };
    }
    return { message: error.message };
}

export type TimelineRequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

/**
 * Serves the REST contract. Resolves to false when the request is not for this contract, so a host can
 * chain it in front of its own routing or mount it inside an existing server.
 */
export function createTimelineHandler(options: TimelineHttpOptions): TimelineRequestHandler {
    const basePath = (options.basePath ?? "/api").replace(/\/+$/, "");
    const routes = buildRoutes(options.api);
    const authorize: Authorizer = options.authorize ?? (() => true);
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const onError = options.onError ?? (error => console.error(error));

    // The impact scale comes from the catalog of the api, read once and read again only if reading failed
    let rules: Promise<ValidationRules> | null = null;
    const currentRules = (): Promise<ValidationRules> => {
        rules ??= options.api.getCatalog().then(catalog => new ValidationRules(catalog)).catch(error => {
            rules = null;
            throw error;
        });
        return rules;
    };

    return async (request, response) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
            return false;
        }

        const segments = url.pathname.slice(basePath.length).split("/").filter(Boolean);
        const candidates = routes
            .map(route => ({ route, params: match(route.pattern, segments) }))
            .filter((entry): entry is { route: Route; params: RouteParams } => entry.params !== null);

        if (candidates.length === 0) {
            send(response, HttpStatus.NotFound, { message: "No such endpoint." });
            return true;
        }

        const chosen = candidates.find(entry => entry.route.method === request.method);
        if (!chosen) {
            response.setHeader("Allow", candidates.map(entry => entry.route.method).join(", "));
            send(response, HttpStatus.MethodNotAllowed, { message: "Method not allowed." });
            return true;
        }

        try {
            if (!(await authorize(request, chosen.route.permission, chosen.params.incidentId))) {
                throw new ForbiddenError("You may not do this.");
            }
            const result = await chosen.route.handle({
                params: chosen.params,
                body: () => readBody(request, maxBodyBytes),
                rules: currentRules
            });
            send(response, result.status, result.body);
        } catch (error) {
            const status = statusOf(error);
            if (status === HttpStatus.InternalServerError) {
                onError(error);
            }
            send(response, status, errorBody(error, status));
        }
        return true;
    };
}
