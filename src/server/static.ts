import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { HttpMethod } from "../storage/http-api.js";
import { HttpStatus, type TimelineRequestHandler } from "./http.js";

/**
 * A folder served under a URL prefix, such as dist/ under /dist/.
 */
export interface StaticMount {
    prefix: string;
    directory: string;
}

const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".map", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".png", "image/png"],
    [".ico", "image/x-icon"]
]);

const INDEX_FILE = "index.html";

// Inline styles are needed because the workspace positions menus and panels from script
const CONTENT_SECURITY_POLICY = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";

function send(response: ServerResponse, status: HttpStatus): void {
    response.statusCode = status;
    response.end();
}

/**
 * Where on disk a request points, or null when it points outside the mount, at a hidden file, or at a
 * type this server does not hand out.
 */
function locate(mount: StaticMount, pathname: string): string | null {
    if (!pathname.startsWith(mount.prefix)) return null;

    let relative: string;
    try {
        relative = decodeURIComponent(pathname.slice(mount.prefix.length));
    } catch {
        return null;
    }

    if (relative.split("/").some(segment => segment.startsWith("."))) return null;

    const root = resolve(mount.directory);
    const target = resolve(root, relative.endsWith("/") || relative === "" ? `${relative}${INDEX_FILE}` : relative);
    if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
    if (!CONTENT_TYPES.has(extname(target).toLowerCase())) return null;
    return target;
}

/**
 * A small read only file server for the demo pages. Meant for local use; a real deployment serves the
 * built files from whatever already serves the host application.
 */
export function createStaticHandler(mounts: readonly StaticMount[]): TimelineRequestHandler {
    return async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== HttpMethod.Get && request.method !== "HEAD") return false;

        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const mount = mounts.find(candidate => pathname.startsWith(candidate.prefix));
        if (!mount) return false;

        const target = locate(mount, pathname);
        if (!target) {
            send(response, HttpStatus.NotFound);
            return true;
        }

        try {
            const info = await stat(target);
            if (!info.isFile()) {
                send(response, HttpStatus.NotFound);
                return true;
            }
            response.statusCode = HttpStatus.Ok;
            response.setHeader("Content-Type", CONTENT_TYPES.get(extname(target).toLowerCase()) ?? "application/octet-stream");
            response.setHeader("Content-Length", info.size);
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
            if (request.method === "HEAD") {
                response.end();
                return true;
            }
            createReadStream(target).pipe(response);
        } catch {
            send(response, HttpStatus.NotFound);
        }
        return true;
    };
}
