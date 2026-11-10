import {
  RATE_LIMIT_PER_MINUTE,
  SB_MAX_PREFIXES,
  WORKER_ROUTES,
  type WorkerError,
  type WorkerErrorCode,
} from "@sentry-ext/contracts";
import { FAKE_OPENPHISH, fakeHost, fakeSafeBrowsing } from "./fake";

export interface Env {
  SAFE_BROWSING_KEY?: string;
  ABUSECH_KEY?: string;
  /** "true" serves fixed answers instead of calling upstreams (STY-108). Local dev only. */
  FAKE_UPSTREAMS?: string;
}

const isFake = (env: Env) => env.FAKE_UPSTREAMS === "true";

const JSON_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function error(
  code: WorkerErrorCode,
  message: string,
  status: number,
  retryAfter?: number,
): Response {
  const body: WorkerError = { error: code, message, ...(retryAfter && { retryAfter }) };
  return json(body, status, retryAfter ? { "retry-after": String(retryAfter) } : {});
}

// Per-isolate limiter: good enough for one demo Worker. Counts only, never stores paths.
const WINDOW_MS = 60_000;
const hits = new Map<string, { start: number; count: number }>();

export function rateLimited(ip: string, now = Date.now()): number | null {
  const entry = hits.get(ip);
  if (!entry || now - entry.start >= WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return null;
  }
  entry.count += 1;
  if (entry.count <= RATE_LIMIT_PER_MINUTE) return null;
  return Math.ceil((entry.start + WINDOW_MS - now) / 1000);
}

// A hostname, not a URL: letters, digits, dots, hyphens, or a bracketed IPv6.
const HOSTNAME = /^(?:[a-z0-9-]{1,63}\.)*[a-z0-9-]{1,63}$|^\[[0-9a-f:.]+\]$/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

async function safeBrowsing(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { prefixes?: unknown } | null;
  const prefixes = body?.prefixes;
  if (
    !Array.isArray(prefixes) ||
    prefixes.length === 0 ||
    prefixes.length > SB_MAX_PREFIXES ||
    !prefixes.every((p) => typeof p === "string" && BASE64.test(p))
  ) {
    return error("bad_request", `Send 1 to ${SB_MAX_PREFIXES} base64 hash prefixes.`, 400);
  }
  if (isFake(env)) return json(await fakeSafeBrowsing(prefixes as string[]));
  return error("not_implemented", "Safe Browsing arrives in Stage 2 (STY-FR-09).", 501);
}

function host(hostname: string, env: Env): Response {
  if (!HOSTNAME.test(hostname)) {
    return error("bad_request", "Send a hostname only, never a full URL.", 400);
  }
  if (isFake(env)) {
    const answer = fakeHost(hostname);
    return answer === "upstream_down"
      ? error("upstream_down", "URLhaus and RDAP are down (fake).", 503)
      : json(answer);
  }
  return error("not_implemented", "URLhaus and RDAP arrive in Stage 2 (STY-FR-10, 11).", 501);
}

function openPhish(env: Env): Response {
  if (isFake(env)) return json(FAKE_OPENPHISH);
  return error("not_implemented", "The OpenPhish list arrives in Stage 2.", 501);
}

// C3 v0 Worker. Routes and validation are real; upstream calls are stubs until Stage 2.
// With FAKE_UPSTREAMS=true (pnpm worker:fake) the upstreams answer from ./fake instead.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await route(request, env);
    // Mark every fake answer, errors included, so nobody mistakes it for a real one.
    if (isFake(env)) res.headers.set("x-phishclaw-fake", "1");
    return res;
  },
};

async function route(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });

  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const retryAfter = rateLimited(ip);
  if (retryAfter !== null) {
    return error("rate_limited", "Too many requests. Try again shortly.", 429, retryAfter);
  }

  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === WORKER_ROUTES.safeBrowsing) {
    return method === "POST" ? safeBrowsing(request, env) : notAllowed();
  }
  if (pathname === WORKER_ROUTES.openPhish) {
    return method === "GET" ? openPhish(env) : notAllowed();
  }
  if (pathname.startsWith(WORKER_ROUTES.hostPrefix)) {
    if (method !== "GET") return notAllowed();
    let hostname: string;
    try {
      hostname = decodeURIComponent(pathname.slice(WORKER_ROUTES.hostPrefix.length));
    } catch {
      return error("bad_request", "Send a hostname only, never a full URL.", 400);
    }
    return host(hostname, env);
  }
  return error("not_found", "No such endpoint.", 404);
}

function notAllowed(): Response {
  return error("method_not_allowed", "Wrong method for this endpoint.", 405);
}
