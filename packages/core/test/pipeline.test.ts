import { describe, expect, it } from "vitest";
import type { Check, CheckResult } from "@sentry-ext/contracts";
import { runPipeline, scoreResults, STANDIN_CHECKS } from "../src";

const run = (url: string, checks: Check[] = STANDIN_CHECKS) =>
  runPipeline({ url, checks, version: "0.0.1/standin" });

function result(over: Partial<CheckResult>): CheckResult {
  return { check: "red_flags", signal: "ok", points: 0, reason: null, ms: 1, ...over };
}

describe("runPipeline with stand-ins", () => {
  it("flags a known-bad lookalike as dangerous", async () => {
    const v = await run("https://login.paypa1.com/");
    expect(v.verdict).toBe("dangerous");
    expect(v.host).toBe("login.paypa1.com");
    expect(v.registrableDomain).toBe("paypa1.com");
    expect(v.reasons[0]).toEqual({
      text: "This domain looks like paypal.com but isn't.",
      check: "lookalike",
    });
    expect(v.partial).toBe(false);
    expect(v.missing).toEqual([]);
    expect(v.version).toBe("0.0.1/standin");
  });

  it("leaves a known-good domain likely safe", async () => {
    const v = await run("https://example.com/");
    expect(v.verdict).toBe("likely_safe");
    expect(v.score).toBe(0);
    expect(v.reasons).toHaveLength(0);
  });

  it("falls back to the host as registrable domain for IPs", async () => {
    const v = await run("http://192.0.2.10/login");
    expect(v.registrableDomain).toBe("192.0.2.10");
    expect(v.verdict).toBe("suspicious");
  });

  it("marks a timed-out check as an error and the verdict partial", async () => {
    const slow: Check = { id: "ml", timeoutMs: 10, check: () => new Promise(() => {}) };
    const v = await run("https://example.com/", [slow]);
    expect(v.checks[0]).toMatchObject({ check: "ml", signal: "error", points: 0 });
    expect(v.partial).toBe(true);
    expect(v.missing).toEqual(["ml"]);
  });

  it("marks a throwing check as an error and the verdict partial", async () => {
    const broken: Check = {
      id: "page",
      timeoutMs: 100,
      check: async () => {
        throw new Error("boom");
      },
    };
    const v = await run("https://example.com/", [broken]);
    expect(v.checks[0]?.signal).toBe("error");
    expect(v.missing).toEqual(["page"]);
  });

  it("trusts the plugin's id and clamps points to 0..100", async () => {
    const liar: Check = {
      id: "homograph",
      timeoutMs: 100,
      check: async () => result({ check: "known_site", signal: "danger", points: 250 }),
    };
    const v = await run("https://example.com/", [liar]);
    expect(v.checks[0]).toMatchObject({ check: "homograph", points: 100 });
  });
});

describe("scoreResults", () => {
  it("makes any feed hit dangerous and keeps the source", () => {
    const s = scoreResults([
      result({
        check: "safebrowsing",
        signal: "danger",
        points: 10,
        feedHit: true,
        reason: "Google lists this page as phishing.",
        source: "google",
      }),
    ]);
    expect(s).toMatchObject({ verdict: "dangerous", score: 100 });
    expect(s.reasons[0]?.source).toBe("google");
  });

  it("ignores points from failed checks", () => {
    const s = scoreResults([result({ signal: "error", points: 90 })]);
    expect(s.verdict).toBe("likely_safe");
  });

  it("orders reasons by signal and caps them at 4", () => {
    const s = scoreResults([
      result({ check: "known_site", signal: "ok", reason: "ok" }),
      result({ check: "red_flags", signal: "warn", points: 10, reason: "warn low" }),
      result({ check: "lookalike", signal: "danger", points: 50, reason: "danger" }),
      result({ check: "domain_age", signal: "warn", points: 20, reason: "warn high" }),
      result({ check: "page", signal: "info", reason: "info" }),
    ]);
    expect(s.reasons.map((r) => r.text)).toEqual(["danger", "warn high", "warn low", "info"]);
  });
});
