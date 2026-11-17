// TC-10: the deployed Worker answers C3 as documented, holds the keys, limits at 60/min,
// and logs nothing. Upstreams are stubbed; no test reaches the network.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hostRoute,
  RATE_LIMIT_PER_MINUTE,
  type HostResponse,
  type OpenPhishResponse,
  type SafeBrowsingResponse,
  type WorkerError,
} from "@sentry-ext/contracts";
import worker, { RateLimiter, type Env } from "../src";
import { clearMemoryCache } from "../src/cache";
import {
  OPENPHISH_FEED,
  RDAP_ENDPOINT,
  SB_ENDPOINT,
  URLHAUS_ENDPOINT,
  USER_AGENT,
} from "../src/upstreams";

const SB_KEY = "sb-secret-123";
const AH_KEY = "ah-secret-456";
const KEYS: Env = { SAFE_BROWSING_KEY: SB_KEY, ABUSECH_KEY: AH_KEY };

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
let handlers: Record<string, Handler>;
let fetchMock: ReturnType<typeof vi.fn>;
let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  clearMemoryCache();
  handlers = {};
  fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const prefix = Object.keys(handlers).find((p) => url.startsWith(p));
    if (!prefix) throw new Error(`unexpected fetch to ${url}`);
    return handlers[prefix]!(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

afterEach(() => {
  // Logs must never carry a hostname or a hash, so the Worker logs nothing at all.
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let ip = 0;
const call = (path: string, init: RequestInit = {}, env: Env = KEYS) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      ...init,
      headers: { "cf-connecting-ip": `10.9.0.${++ip}`, ...init.headers },
    }),
    env,
  );
const sb = (prefixes: string[], env?: Env) =>
  call("/v1/sb", { method: "POST", body: JSON.stringify({ prefixes }) }, env);

const HASH_A = "771MOrRPMn6xPKlCrXx/CrR+wmCk0LgFFoSgGy7zUiA=";

describe("POST /v1/sb (Safe Browsing)", () => {
  it("sends the prefixes with the key in a header and maps matches to C3", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    handlers[SB_ENDPOINT] = (url, init) => {
      sent = { url, init };
      return Response.json({
        matches: [
          { threatType: "SOCIAL_ENGINEERING", threat: { hash: HASH_A }, cacheDuration: "300s" },
          { threatType: "MALWARE", threat: { hash: HASH_A }, cacheDuration: "120.5s" },
        ],
      });
    };
    const before = Date.now();
    const res = await sb(["771MOg=="]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SafeBrowsingResponse;
    expect(body.fullHashes).toHaveLength(1);
    expect(body.fullHashes[0]!.hash).toBe(HASH_A);
    expect(body.fullHashes[0]!.threatTypes.sort()).toEqual(["MALWARE", "SOCIAL_ENGINEERING"]);
    // The shorter cacheDuration wins.
    const ttl = Date.parse(body.fullHashes[0]!.expiresAt) - before;
    expect(ttl).toBeGreaterThan(110_000);
    expect(ttl).toBeLessThan(130_000);

    expect(sent!.url).not.toContain(SB_KEY);
    expect(new Headers(sent!.init.headers).get("x-goog-api-key")).toBe(SB_KEY);
    const payload = JSON.parse(String(sent!.init.body));
    expect(payload.threatInfo.threatEntries).toEqual([{ hash: "771MOg==" }]);
  });

  it("answers an empty list when nothing matches", async () => {
    handlers[SB_ENDPOINT] = () => Response.json({ negativeCacheDuration: "300s" });
    expect(await (await sb(["AAAAAA=="])).json()).toEqual({ fullHashes: [] });
  });

  it("answers 503 upstream_down when Google fails, without echoing the key", async () => {
    handlers[SB_ENDPOINT] = () => new Response("quota", { status: 429 });
    const res = await sb(["AAAAAA=="]);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ error: "upstream_down" });
    expect(text).not.toContain(SB_KEY);
  });

  it("answers 503 when the key secret is missing, and never calls Google", async () => {
    const res = await sb(["AAAAAA=="], { ABUSECH_KEY: AH_KEY });
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /v1/host/{hostname} (URLhaus + RDAP)", () => {
  const rdapOk =
    (date = "2024-03-01T12:00:00Z") =>
    () =>
      Response.json({ events: [{ eventAction: "registration", eventDate: date }] });

  it("combines URLhaus and RDAP, looking up RDAP by registrable domain", async () => {
    let urlhausInit: RequestInit | undefined;
    handlers[URLHAUS_ENDPOINT] = (_url, init) => {
      urlhausInit = init;
      return Response.json({
        query_status: "ok",
        url_count: "3",
        urls: [{ threat: "malware_download" }, { threat: "malware_download" }, { threat: "x" }],
      });
    };
    let rdapUrl = "";
    handlers[RDAP_ENDPOINT] = (url) => {
      rdapUrl = url;
      return rdapOk()();
    };
    const res = await call(hostRoute("login.paypa1.com"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      urlhaus: { threat: "malware_download", urlCount: 3 },
      registeredAt: "2024-03-01T12:00:00.000Z",
      rdap: true,
    } satisfies HostResponse);
    expect(rdapUrl).toBe(`${RDAP_ENDPOINT}paypa1.com`);
    // rdap.org answers 403 to a request with no User-Agent.
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(new Headers(init.headers).get("user-agent")).toBe(USER_AGENT);
    }
    expect(new Headers(urlhausInit!.headers).get("auth-key")).toBe(AH_KEY);
    expect(String(urlhausInit!.body)).toBe("host=login.paypa1.com");
  });

  it("caches the answer, so a repeat lookup doesn't hit the upstreams", async () => {
    handlers[URLHAUS_ENDPOINT] = () => Response.json({ query_status: "no_results" });
    handlers[RDAP_ENDPOINT] = rdapOk();
    await call(hostRoute("cached.example.com"));
    await call(hostRoute("CACHED.example.com"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports rdap false when RDAP is down, and rdap true with no date on 404", async () => {
    handlers[URLHAUS_ENDPOINT] = () => Response.json({ query_status: "no_results" });
    handlers[RDAP_ENDPOINT] = () => new Response("down", { status: 500 });
    expect(await (await call(hostRoute("a.example.com"))).json()).toEqual({
      urlhaus: null,
      registeredAt: null,
      rdap: false,
    });
    clearMemoryCache();
    handlers[RDAP_ENDPOINT] = () => new Response(null, { status: 404 });
    expect(await (await call(hostRoute("b.example.org"))).json()).toEqual({
      urlhaus: null,
      registeredAt: null,
      rdap: true,
    });
  });

  it("skips RDAP for an IP address", async () => {
    handlers[URLHAUS_ENDPOINT] = () => Response.json({ query_status: "no_results" });
    const body = (await (await call(hostRoute("192.0.2.7"))).json()) as HostResponse;
    expect(body.rdap).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when URLhaus fails: a failed lookup must never read as clean", async () => {
    handlers[URLHAUS_ENDPOINT] = () => {
      throw new TypeError("network error for login.paypa1.com");
    };
    handlers[RDAP_ENDPOINT] = rdapOk();
    const res = await call(hostRoute("login.paypa1.com"));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect((JSON.parse(text) as WorkerError).error).toBe("upstream_down");
    expect(text).not.toContain("paypa1");
  });

  it("answers 503 when URLhaus refuses the key", async () => {
    handlers[URLHAUS_ENDPOINT] = () => Response.json({ query_status: "unknown_auth_key" });
    handlers[RDAP_ENDPOINT] = rdapOk();
    expect((await call(hostRoute("c.example.com"))).status).toBe(503);
  });

  it("answers 503 when the URLhaus key secret is missing", async () => {
    handlers[RDAP_ENDPOINT] = rdapOk();
    const res = await call(hostRoute("d.example.com"), {}, { SAFE_BROWSING_KEY: SB_KEY });
    expect(res.status).toBe(503);
  });
});

describe("GET /v1/feeds/openphish", () => {
  it("serves the feed as typed text and caches it", async () => {
    handlers[OPENPHISH_FEED] = () =>
      new Response("https://phish.phishclaw.test/a\n\nhttp://paypa1.com/login\nnot a url\n");
    const body = (await (await call("/v1/feeds/openphish")).json()) as OpenPhishResponse;
    expect(body.urls).toEqual(["https://phish.phishclaw.test/a", "http://paypa1.com/login"]);
    expect(Number.isNaN(Date.parse(body.updatedAt))).toBe(false);
    await call("/v1/feeds/openphish");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers 503 when the feed is down or empty", async () => {
    handlers[OPENPHISH_FEED] = () => new Response("", { status: 502 });
    expect((await call("/v1/feeds/openphish")).status).toBe(503);
    handlers[OPENPHISH_FEED] = () => new Response("");
    expect((await call("/v1/feeds/openphish")).status).toBe(503);
  });
});

describe("rate limit (RateLimiter Durable Object)", () => {
  /** A stand-in namespace: one real RateLimiter per name, like Cloudflare's idFromName. */
  function fakeNamespace() {
    const objects = new Map<string, RateLimiter>();
    const names: string[] = [];
    const ns = {
      idFromName: (name: string) => {
        names.push(name);
        return name;
      },
      get: (id: string) => {
        if (!objects.has(id)) objects.set(id, new RateLimiter({} as DurableObjectState, {}));
        const object = objects.get(id)!;
        return { fetch: () => object.fetch() };
      },
    };
    return { ns: ns as unknown as DurableObjectNamespace, names };
  }

  const fromIp = (ip: string, env: Env) =>
    worker.fetch(
      new Request("https://worker.test/nope", { headers: { "cf-connecting-ip": ip } }),
      env,
    );

  it("allows exactly 60 a minute per IP, then answers 429 with Retry-After", async () => {
    const { ns, names } = fakeNamespace();
    const env: Env = { ...KEYS, RATE_LIMITER: ns };
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      expect((await fromIp("203.0.113.9", env)).status).toBe(404);
    }
    const res = await fromIp("203.0.113.9", env);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({ error: "rate_limited" });
    // Another IP has its own count.
    expect((await fromIp("203.0.113.10", env)).status).toBe(404);
    expect(names).toContain("203.0.113.9");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to counting in the isolate when the Durable Object fails", async () => {
    const broken = {
      idFromName: () => "x",
      get: () => ({
        fetch: async () => {
          throw new Error("unavailable");
        },
      }),
    } as unknown as DurableObjectNamespace;
    const env: Env = { ...KEYS, RATE_LIMITER: broken };
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) await fromIp("198.51.100.1", env);
    expect((await fromIp("198.51.100.1", env)).status).toBe(429);
  });
});
