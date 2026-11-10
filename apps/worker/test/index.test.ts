import { describe, expect, it } from "vitest";
import {
  hostRoute,
  RATE_LIMIT_PER_MINUTE,
  type HostResponse,
  type OpenPhishResponse,
  type SafeBrowsingResponse,
} from "@sentry-ext/contracts";
import worker, { rateLimited } from "../src";

let ip = 0;
// A fresh IP per call so the rate limiter doesn't leak between tests.
const call = (path: string, init: RequestInit = {}) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      ...init,
      headers: { "cf-connecting-ip": `10.0.0.${++ip}`, ...init.headers },
    }),
    {},
  );

const postPrefixes = (prefixes: unknown) =>
  call("/v1/sb", { method: "POST", body: JSON.stringify({ prefixes }) });

describe("worker", () => {
  it("returns a C3 error for unknown paths", async () => {
    const res = await call("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });

  it("accepts up to 30 base64 prefixes on /v1/sb", async () => {
    expect((await postPrefixes(Array(30).fill("AAAAAA=="))).status).toBe(501);
    expect((await postPrefixes(Array(31).fill("AAAAAA=="))).status).toBe(400);
    expect((await postPrefixes(["not base64!"])).status).toBe(400);
    expect((await postPrefixes([])).status).toBe(400);
  });

  it("rejects the wrong method", async () => {
    expect((await call("/v1/sb")).status).toBe(405);
    expect((await call("/v1/feeds/openphish", { method: "POST" })).status).toBe(405);
  });

  it("takes a hostname but never a full URL on /v1/host", async () => {
    expect((await call(hostRoute("login.paypa1.com"))).status).toBe(501);
    expect((await call(hostRoute("https://paypa1.com/login"))).status).toBe(400);
    expect((await call(hostRoute("paypa1.com/login"))).status).toBe(400);
  });

  it("serves the OpenPhish route", async () => {
    expect((await call("/v1/feeds/openphish")).status).toBe(501);
  });
});

describe("rateLimited", () => {
  it("allows 60 a minute from one IP, then gives a retryAfter", () => {
    const t = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) expect(rateLimited("ip-a", t)).toBeNull();
    expect(rateLimited("ip-a", t + 15_000)).toBe(45);
    expect(rateLimited("ip-a", t + 60_000)).toBeNull();
  });

  it("returns 429 with a Retry-After header", async () => {
    const req = () =>
      worker.fetch(
        new Request("https://worker.test/v1/feeds/openphish", {
          headers: { "cf-connecting-ip": "ip-b" },
        }),
        {},
      );
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) await req();
    const res = await req();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await res.json()).toMatchObject({ error: "rate_limited" });
  });
});

describe("fake mode (STY-108)", () => {
  // Computed outside the Worker with `shasum -a 256`, so a wrong expression can't pass.
  const PHISHING_HASH = "771MOrRPMn6xPKlCrXx/CrR+wmCk0LgFFoSgGy7zUiA=";
  const PHISHING_PREFIX = "771MOg==";
  const MALWARE_PREFIX = "WwuJdQ==";

  const fake = (path: string, init: RequestInit = {}) =>
    worker.fetch(
      new Request(`https://worker.test${path}`, {
        ...init,
        headers: { "cf-connecting-ip": `10.1.0.${++ip}`, ...init.headers },
      }),
      { FAKE_UPSTREAMS: "true" },
    );
  const fakeSb = (prefixes: unknown) =>
    fake("/v1/sb", { method: "POST", body: JSON.stringify({ prefixes }) });

  it("is off unless FAKE_UPSTREAMS is exactly 'true'", async () => {
    const res = await worker.fetch(
      new Request("https://worker.test/v1/feeds/openphish", {
        headers: { "cf-connecting-ip": "10.2.0.1" },
      }),
      { FAKE_UPSTREAMS: "1" },
    );
    expect(res.status).toBe(501);
    expect(res.headers.get("x-phishclaw-fake")).toBeNull();
  });

  it("returns the full hash for Google's phishing test page", async () => {
    const res = await fakeSb([PHISHING_PREFIX]);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-phishclaw-fake")).toBe("1");
    const body = (await res.json()) as SafeBrowsingResponse;
    expect(body.fullHashes).toHaveLength(1);
    expect(body.fullHashes[0]).toMatchObject({
      hash: PHISHING_HASH,
      threatTypes: ["SOCIAL_ENGINEERING"],
    });
    expect(Date.parse(body.fullHashes[0]!.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("returns only hashes matching the prefixes sent", async () => {
    const both = (await (
      await fakeSb([PHISHING_PREFIX, MALWARE_PREFIX])
    ).json()) as SafeBrowsingResponse;
    expect(both.fullHashes.map((h) => h.threatTypes[0]).sort()).toEqual([
      "MALWARE",
      "SOCIAL_ENGINEERING",
    ]);
    const none = (await (await fakeSb(["AAAAAA=="])).json()) as SafeBrowsingResponse;
    expect(none).toEqual({ fullHashes: [] });
  });

  it("still validates the request", async () => {
    expect((await fakeSb([])).status).toBe(400);
    expect((await fakeSb(["not base64!"])).status).toBe(400);
  });

  it("answers each fake host case", async () => {
    const get = async (h: string) => (await fake(hostRoute(h))).json() as Promise<HostResponse>;
    expect((await get("urlhaus.phishclaw.test")).urlhaus).not.toBeNull();
    expect((await get("rdap-down.phishclaw.test")).rdap).toBe(false);
    const fresh = await get("NEW.phishclaw.test");
    expect(Date.now() - Date.parse(fresh.registeredAt!)).toBeLessThan(7 * 24 * 60 * 60 * 1000);
    expect(await get("example.com")).toEqual({
      urlhaus: null,
      registeredAt: "2010-01-01T00:00:00Z",
      rdap: true,
    } satisfies HostResponse);
  });

  it("returns 503 upstream_down for down.phishclaw.test", async () => {
    const res = await fake(hostRoute("down.phishclaw.test"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "upstream_down" });
  });

  it("serves a fixed OpenPhish list", async () => {
    const body = (await (await fake("/v1/feeds/openphish")).json()) as OpenPhishResponse;
    expect(body.urls.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(body.updatedAt))).toBe(false);
  });
});
