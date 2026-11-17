import { describe, expect, it } from "vitest";
import type { CheckResult } from "@sentry-ext/contracts";
import { scoreResults } from "../src";

function result(points: number, over: Partial<CheckResult> = {}): CheckResult {
  return { check: "red_flags", signal: "warn", points, reason: "test", ms: 1, ...over };
}

describe("scoreResults thresholds (STY-67: suspicious moved from 40 to 35)", () => {
  it("is likely_safe just under the suspicious threshold", () => {
    const { verdict, score } = scoreResults([result(34)]);
    expect(score).toBe(34);
    expect(verdict).toBe("likely_safe");
  });

  it("is suspicious at the threshold", () => {
    const { verdict, score } = scoreResults([result(35)]);
    expect(score).toBe(35);
    expect(verdict).toBe("suspicious");
  });

  it("is dangerous at the dangerous threshold", () => {
    const { verdict } = scoreResults([result(70)]);
    expect(verdict).toBe("dangerous");
  });

  it("is dangerous on any feed hit, regardless of points", () => {
    const { verdict, score } = scoreResults([result(0, { feedHit: true })]);
    expect(verdict).toBe("dangerous");
    expect(score).toBe(100);
  });
});
