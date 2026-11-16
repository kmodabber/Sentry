// Two-tier cache for upstream answers: a small in-isolate map, then the Cloudflare Cache API.
// Only successful answers are cached. Nothing here logs, so keys never reach a log line.

const MEMORY_MAX = 500;
const memory = new Map<string, { expires: number; value: unknown }>();

/** Cache API keys need a URL; this host is never fetched. */
const CACHE_ORIGIN = "https://cache.phishclaw.invalid";

/** For tests: forget everything held in memory. */
export function clearMemoryCache(): void {
  memory.clear();
}

function edgeCache(): Cache | undefined {
  // Missing under Node (tests); a no-op on *.workers.dev, real on a custom domain.
  return typeof caches === "undefined" ? undefined : caches.default;
}

/**
 * Returns the cached value for `key`, or runs `load` and caches its value for the
 * `ttlSeconds` it returns. A ttl of 0 skips caching that answer.
 */
export async function cached<T>(
  key: string,
  load: () => Promise<{ value: T; ttlSeconds: number }>,
  now = Date.now(),
): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  memory.delete(key);

  const edge = edgeCache();
  const request = new Request(`${CACHE_ORIGIN}/${encodeURIComponent(key)}`);
  const stored = await edge?.match(request).catch(() => undefined);
  if (stored) {
    const { value, expires } = (await stored.json()) as { value: T; expires: number };
    remember(key, value, expires);
    return value;
  }

  const { value, ttlSeconds: ttl } = await load();
  if (ttl <= 0) return value;

  const expires = now + ttl * 1000;
  remember(key, value, expires);
  await edge
    ?.put(
      request,
      new Response(JSON.stringify({ value, expires }), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` },
      }),
    )
    .catch(() => undefined);
  return value;
}

function remember(key: string, value: unknown, expires: number): void {
  if (memory.size >= MEMORY_MAX) {
    // Maps iterate in insertion order, so the first key is the oldest.
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { expires, value });
}
