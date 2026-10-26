import { describe, expect, it } from "vitest";
import type { Check, ParsedUrl } from "@sentry-ext/contracts";
import { runPipeline, STANDIN_CHECKS } from "../src";

function parsed(hostname: string, domain: string | null, isIp = false): ParsedUrl {
  return {
    href: `https://${hostname}/`,
    protocol: "https:",
    hostname,
    domain,
    publicSuffix: domain ? "com" : null,
    subdomain: null,
    isIp,
    path: "/",
  };
}

describe("runPipeline with stand-ins", () => {
  it("flags a known-bad lookalike as dangerous", async () => {
    const v = await runPipeline({
      url: "https://paypa1.com/",
      parsed: parsed("paypa1.com", "paypa1.com"),
      checks: STANDIN_CHECKS,
    });
    expect(v.label).toBe("dangerous");
    expect(v.reasons[0]?.text).toContain("paypal.com");
    expect(v.partial).toBe(false);
  });

  it("leaves a known-good domain likely safe", async () => {
    const v = await runPipeline({
      url: "https://example.com/",
      parsed: parsed("example.com", "example.com"),
      checks: STANDIN_CHECKS,
    });
    expect(v.label).toBe("likely_safe");
    expect(v.reasons).toHaveLength(0);
  });

  it("marks the verdict partial when a check times out", async () => {
    const slow: Check = {
      id: "slow",
      timeoutMs: 10,
      run: () => new Promise(() => {}),
    };
    const v = await runPipeline({
      url: "https://example.com/",
      parsed: parsed("example.com", "example.com"),
      checks: [slow],
    });
    expect(v.partial).toBe(true);
    expect(v.checks[0]?.status).toBe("timeout");
  });

  it("marks the verdict partial when a check throws", async () => {
    const broken: Check = {
      id: "broken",
      timeoutMs: 100,
      run: async () => {
        throw new Error("boom");
      },
    };
    const v = await runPipeline({
      url: "https://example.com/",
      parsed: parsed("example.com", "example.com"),
      checks: [broken],
    });
    expect(v.checks[0]?.status).toBe("error");
    expect(v.partial).toBe(true);
  });
});
