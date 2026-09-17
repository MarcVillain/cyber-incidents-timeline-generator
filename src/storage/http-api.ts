import type { Catalog } from "../core/catalog.js";
import { ForbiddenError, NotFoundError, ValidationError, type ValidationIssue } from "../core/errors.js";
import type {
    Diagram,
    DiagramLink,
    DiagramNode,
    DiagramStep,
    Incident,
    IncidentCreateInput,
    IncidentUpdateInput,
    LayoutInput,
    LinkCreateInput,
    LinkUpdateInput,
    NodeCreateInput,
    NodeUpdateInput,
    RecordId,
    StepCreateInput,
    StepUpdateInput
} from "../core/models.js";
import type { TimelineApi } from "../core/service.js";
import type { DiagramSummary } from "../core/summary.js";
import type { ImportOptions, ImportReport, TimelineDocument } from "../core/document.js";

export enum HttpMethod {
    Get = "GET",
    Post = "POST",
    Put = "PUT",
    Delete = "DELETE"
}

export interface HttpTimelineApiOptions {
    /** Where the REST contract of docs/rest-api.md is served. */
    baseUrl?: string;
    /**
     * Extra headers for every request, read again each time, which is where a host puts its CSRF or
     * bearer token.
     */
    headers?: () => Record<string, string> | Promise<Record<string, string>>;
    credentials?: RequestCredentials;
    fetch?: typeof fetch;
}

export class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

const STATUS_NO_CONTENT = 204;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_NOT_FOUND = 404;

interface ErrorBody {
    message?: unknown;
    issues?: unknown;
}

function isIssue(value: unknown): value is ValidationIssue {
    if (typeof value !== "object" || value === null) return false;
    const candidate: Partial<Record<keyof ValidationIssue, unknown>> = value;
    return typeof candidate.field === "string" && typeof candidate.message === "string";
}

async function failure(response: Response, method: HttpMethod, url: string): Promise<Error> {
    let body: ErrorBody = {};
    try {
        const parsed: unknown = await response.json();
        if (typeof parsed === "object" && parsed !== null) {
            body = parsed;
        }
    } catch {
        body = {};
    }

    const message = typeof body.message === "string" ? body.message : `${method} ${url} failed with status ${response.status}`;
    if (response.status === STATUS_BAD_REQUEST && Array.isArray(body.issues)) {
        return new ValidationError(body.issues.filter(isIssue));
    }
    if (response.status === STATUS_NOT_FOUND) {
        return new NotFoundError(message);
    }
    if (response.status === STATUS_FORBIDDEN || response.status === STATUS_UNAUTHORIZED) {
        return new ForbiddenError(message);
    }
    return new HttpError(response.status, message);
}

/**
 * The workspace talking to a server over the REST contract. Any backend implementing that contract,
 * in any language and on any database, works with it.
 */
export class HttpTimelineApi implements TimelineApi {
    private readonly baseUrl: string;
    private readonly headers: () => Record<string, string> | Promise<Record<string, string>>;
    private readonly credentials: RequestCredentials;
    private readonly fetcher: typeof fetch;

    constructor(options: HttpTimelineApiOptions = {}) {
        this.baseUrl = (options.baseUrl ?? "/api").replace(/\/+$/, "");
        this.headers = options.headers ?? (() => ({}));
        this.credentials = options.credentials ?? "same-origin";
        this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    }

    private async send(method: HttpMethod, path: string, body?: unknown): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = { Accept: "application/json", ...(await this.headers()) };
        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await this.fetcher(url, {
            method,
            headers,
            credentials: this.credentials,
            // The diagram changes as soon as anyone edits it, so a cached copy is always the wrong answer
            cache: "no-store",
            body: body === undefined ? null : JSON.stringify(body)
        });

        if (!response.ok) {
            throw await failure(response, method, url);
        }
        return response;
    }

    private async read<TResult>(method: HttpMethod, path: string, body?: unknown): Promise<TResult> {
        const response = await this.send(method, path, body);
        return response.json();
    }

    private async write(method: HttpMethod, path: string, body?: unknown): Promise<void> {
        const response = await this.send(method, path, body);
        if (response.status !== STATUS_NO_CONTENT) {
            await response.body?.cancel();
        }
    }

    private incident(incidentId: RecordId): string {
        return `/incidents/${encodeURIComponent(incidentId)}`;
    }

    listIncidents(): Promise<Incident[]> {
        return this.read(HttpMethod.Get, "/incidents");
    }

    getIncident(incidentId: RecordId): Promise<Incident> {
        return this.read(HttpMethod.Get, this.incident(incidentId));
    }

    getSummary(incidentId: RecordId): Promise<DiagramSummary> {
        return this.read(HttpMethod.Get, `${this.incident(incidentId)}/summary`);
    }

    exportDocument(incidentId: RecordId): Promise<TimelineDocument> {
        return this.read(HttpMethod.Get, `${this.incident(incidentId)}/document`);
    }

    importDocument(document: unknown, options: ImportOptions & { into?: RecordId } = {}): Promise<ImportReport> {
        const { into, ...rest } = options;
        const path = into === undefined ? "/documents" : `${this.incident(into)}/document`;
        return this.read(HttpMethod.Post, path, { document, ...rest });
    }

    createIncident(input: IncidentCreateInput): Promise<Incident> {
        return this.read(HttpMethod.Post, "/incidents", input);
    }

    updateIncident(incidentId: RecordId, input: IncidentUpdateInput): Promise<void> {
        return this.write(HttpMethod.Put, this.incident(incidentId), input);
    }

    deleteIncident(incidentId: RecordId): Promise<void> {
        return this.write(HttpMethod.Delete, this.incident(incidentId));
    }

    getDiagram(incidentId: RecordId): Promise<Diagram> {
        return this.read(HttpMethod.Get, `${this.incident(incidentId)}/diagram`);
    }

    getCatalog(): Promise<Catalog> {
        return this.read(HttpMethod.Get, "/catalog");
    }

    createNode(incidentId: RecordId, input: NodeCreateInput): Promise<DiagramNode> {
        return this.read(HttpMethod.Post, `${this.incident(incidentId)}/nodes`, input);
    }

    updateNode(incidentId: RecordId, nodeId: RecordId, input: NodeUpdateInput): Promise<void> {
        return this.write(HttpMethod.Put, `${this.incident(incidentId)}/nodes/${encodeURIComponent(nodeId)}`, input);
    }

    deleteNode(incidentId: RecordId, nodeId: RecordId): Promise<void> {
        return this.write(HttpMethod.Delete, `${this.incident(incidentId)}/nodes/${encodeURIComponent(nodeId)}`);
    }

    createStep(incidentId: RecordId, input: StepCreateInput): Promise<DiagramStep> {
        return this.read(HttpMethod.Post, `${this.incident(incidentId)}/steps`, input);
    }

    updateStep(incidentId: RecordId, stepId: RecordId, input: StepUpdateInput): Promise<void> {
        return this.write(HttpMethod.Put, `${this.incident(incidentId)}/steps/${encodeURIComponent(stepId)}`, input);
    }

    deleteStep(incidentId: RecordId, stepId: RecordId): Promise<void> {
        return this.write(HttpMethod.Delete, `${this.incident(incidentId)}/steps/${encodeURIComponent(stepId)}`);
    }

    createLink(incidentId: RecordId, input: LinkCreateInput): Promise<DiagramLink> {
        return this.read(HttpMethod.Post, `${this.incident(incidentId)}/links`, input);
    }

    updateLink(incidentId: RecordId, linkId: RecordId, input: LinkUpdateInput): Promise<void> {
        return this.write(HttpMethod.Put, `${this.incident(incidentId)}/links/${encodeURIComponent(linkId)}`, input);
    }

    deleteLink(incidentId: RecordId, linkId: RecordId): Promise<void> {
        return this.write(HttpMethod.Delete, `${this.incident(incidentId)}/links/${encodeURIComponent(linkId)}`);
    }

    saveLayout(incidentId: RecordId, layouts: LayoutInput[]): Promise<void> {
        return this.write(HttpMethod.Put, `${this.incident(incidentId)}/layout`, layouts);
    }
}
