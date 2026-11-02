import { describe, expect, it } from "vitest";
import { hostRoute, RATE_LIMIT_PER_MINUTE } from "@sentry-ext/contracts";
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
