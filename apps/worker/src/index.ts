import {
  C3_VERSION,
  WORKER_ROUTES,
  type HealthResponse,
  type WorkerError,
} from "@sentry-ext/contracts";

export interface Env {
  SAFE_BROWSING_KEY?: string;
  ABUSECH_KEY?: string;
}

const JSON_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function error(code: string, message: string, status: number): Response {
  const body: WorkerError = { error: { code, message } };
  return json(body, status);
}

// "Hello" Worker for Stage 1. Feed endpoints are stubs until Stage 2 (STY-FR-09, 10, 11).
export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
    const { pathname } = new URL(request.url);

    if (pathname === WORKER_ROUTES.health) {
      const body: HealthResponse = { ok: true, version: C3_VERSION };
      return json(body);
    }
    if ((Object.values(WORKER_ROUTES) as string[]).includes(pathname)) {
      return error("not_implemented", "This endpoint arrives in Stage 2.", 501);
    }
    return error("not_found", "No such endpoint.", 404);
  },
};
