// 60 requests a minute per client IP (C3 RATE_LIMIT_PER_MINUTE), fixed one-minute window.
//
// Deployed, each IP gets its own Durable Object (RateLimiter), so every Cloudflare machine
// counts against the same window and request 61 always gets 429. Locally, in tests, or if the
// Durable Object can't be reached, a per-isolate map counts instead.
// Counts only: nothing here stores a path, a hostname or a hash.

import { RATE_LIMIT_PER_MINUTE } from "@sentry-ext/contracts";

const WINDOW_MS = 60_000;

interface Window {
  start: number;
  count: number;
}

/** Counts one request. Returns the updated window and, when over the limit, seconds to wait. */
function countHit(
  window: Window | undefined,
  now: number,
): { window: Window; retryAfter: number | null } {
  if (!window || now - window.start >= WINDOW_MS) {
    return { window: { start: now, count: 1 }, retryAfter: null };
  }
  const next = { start: window.start, count: window.count + 1 };
  const over = next.count > RATE_LIMIT_PER_MINUTE;
  return {
    window: next,
    retryAfter: over ? Math.ceil((window.start + WINDOW_MS - now) / 1000) : null,
  };
}

/**
 * One instance per client IP (idFromName(ip)). A Durable Object runs one request at a time,
 * so the count is exact. The window lives in memory: if Cloudflare evicts an idle object,
 * the window has long expired anyway.
 */
export class RateLimiter {
  private window: Window | undefined;

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(): Promise<Response> {
    const { window, retryAfter } = countHit(this.window, Date.now());
    this.window = window;
    return Response.json({ retryAfter });
  }
}

const isolateWindows = new Map<string, Window>();

/** Per-isolate fallback. Exact for one isolate only. */
export function rateLimited(ip: string, now = Date.now()): number | null {
  const { window, retryAfter } = countHit(isolateWindows.get(ip), now);
  isolateWindows.set(ip, window);
  return retryAfter;
}

/** Seconds to wait when `ip` is over the limit, else null. */
export async function checkRateLimit(
  ip: string,
  limiter: DurableObjectNamespace | undefined,
): Promise<number | null> {
  if (limiter) {
    try {
      const res = await limiter.get(limiter.idFromName(ip)).fetch("https://rate-limiter/hit");
      const { retryAfter } = (await res.json()) as { retryAfter: number | null };
      return retryAfter;
    } catch {
      // Fall back to counting in this isolate rather than letting everything through.
    }
  }
  return rateLimited(ip);
}
