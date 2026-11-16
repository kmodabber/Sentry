import { describe, expect, it } from "vitest";
import type { CheckResult } from "@sentry-ext/contracts";
import { findBrandEvidence, highlightDomain, splitHost } from "./domain-diff";

describe("highlightDomain", () => {
  it("highlights a single swapped character", () => {
    expect(highlightDomain("paypa1.com", "paypal.com")).toEqual([
      { type: "same", text: "paypa" },
      { type: "changed", text: "1" },
      { type: "same", text: ".com" },
    ]);
  });

  it("highlights a swapped-in pair of characters", () => {
    expect(highlightDomain("rnicrosoft.com", "microsoft.com")).toEqual([
      { type: "changed", text: "rn" },
      { type: "same", text: "icrosoft.com" },
    ]);
  });

  it("highlights nothing for an exact match", () => {
    expect(highlightDomain("paypal.com", "paypal.com")).toEqual([
      { type: "same", text: "paypal.com" },
    ]);
  });

  it("marks a missing letter in the middle", () => {
    expect(highlightDomain("microsft.com", "microsoft.com")).toEqual([
      { type: "same", text: "micros" },
      { type: "missing", letter: "o" },
      { type: "same", text: "ft.com" },
    ]);
  });

  it("marks a missing letter for linkdin.com vs linkedin.com", () => {
    expect(highlightDomain("linkdin.com", "linkedin.com")).toEqual([
      { type: "same", text: "link" },
      { type: "missing", letter: "e" },
      { type: "same", text: "din.com" },
    ]);
  });

  it("marks a missing letter for scotiabnk.com vs scotiabank.com", () => {
    expect(highlightDomain("scotiabnk.com", "scotiabank.com")).toEqual([
      { type: "same", text: "scotiab" },
      { type: "missing", letter: "a" },
      { type: "same", text: "nk.com" },
    ]);
  });
});

describe("splitHost", () => {
  it("has no subdomain when host is the registrable domain", () => {
    expect(splitHost("paypa1.com", "paypa1.com")).toEqual({ subdomain: "", rest: "paypa1.com" });
  });

  it("splits off a www. subdomain", () => {
    expect(splitHost("www.paypa1.com", "paypa1.com")).toEqual({
      subdomain: "www.",
      rest: "paypa1.com",
    });
  });

  it("splits off a login. subdomain", () => {
    expect(splitHost("login.paypa1.com", "paypa1.com")).toEqual({
      subdomain: "login.",
      rest: "paypa1.com",
    });
  });

  it("returns null for an empty registrable domain", () => {
    expect(splitHost("paypa1.com", "")).toBeNull();
  });

  it("returns null when the registrable domain isn't a suffix of host", () => {
    expect(splitHost("evil.com", "paypa1.com")).toBeNull();
  });
});

function checkResult(over: Partial<CheckResult>): CheckResult {
  return { check: "lookalike", signal: "ok", points: 0, reason: null, ms: 1, ...over };
}

describe("findBrandEvidence", () => {
  it("ignores a passing check even if it carries brand evidence", () => {
    const checks = [checkResult({ signal: "ok", evidence: { brand: "paypal.com" } })];
    expect(findBrandEvidence(checks)).toBeUndefined();
  });

  it("uses evidence from a warn signal", () => {
    const checks = [checkResult({ signal: "warn", evidence: { brand: "paypal.com" } })];
    expect(findBrandEvidence(checks)).toBe("paypal.com");
  });

  it("uses evidence from a danger signal", () => {
    const checks = [checkResult({ signal: "danger", evidence: { brand: "paypal.com" } })];
    expect(findBrandEvidence(checks)).toBe("paypal.com");
  });
});

describe("splitHost + highlightDomain together", () => {
  it("highlights only the 1 for www.paypa1.com", () => {
    const split = splitHost("www.paypa1.com", "paypa1.com");
    expect(split).not.toBeNull();
    const { subdomain, rest } = split!;
    expect(subdomain).toBe("www.");
    expect(highlightDomain(rest, "paypal.com")).toEqual([
      { type: "same", text: "paypa" },
      { type: "changed", text: "1" },
      { type: "same", text: ".com" },
    ]);
  });

  it("highlights only the 1 for login.paypa1.com", () => {
    const split = splitHost("login.paypa1.com", "paypa1.com");
    expect(split).not.toBeNull();
    const { subdomain, rest } = split!;
    expect(subdomain).toBe("login.");
    expect(highlightDomain(rest, "paypal.com")).toEqual([
      { type: "same", text: "paypa" },
      { type: "changed", text: "1" },
      { type: "same", text: ".com" },
    ]);
  });
});
