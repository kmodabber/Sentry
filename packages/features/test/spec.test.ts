import { describe, expect, it } from "vitest";
import {
  FEATURES,
  FEATURE_NAMES,
  SPEC_HASH,
  assertModelMatchesSpec,
  canonicalSpec,
  computeSpecHash,
} from "../src/spec";

describe("C5 feature spec", () => {
  it("has the 20 baseline features in a fixed order", () => {
    expect(FEATURES).toHaveLength(20);
    expect(FEATURE_NAMES[0]).toBe("url_length");
    expect(FEATURE_NAMES.at(-1)).toBe("risky_file_type");
  });

  it("has unique snake_case names", () => {
    expect(new Set(FEATURE_NAMES).size).toBe(FEATURES.length);
    for (const name of FEATURE_NAMES) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("gives every feature a definition and a plain popup reason", () => {
    for (const f of FEATURES) {
      expect(f.definition.length).toBeGreaterThan(10);
      expect(f.reason.length).toBeGreaterThan(10);
      expect(f.reason.toLowerCase()).not.toContain("safe");
    }
  });

  it("caps url_length at 1,000 (STY-100)", () => {
    expect(FEATURES.find((f) => f.name === "url_length")?.cap).toBe(1000);
  });

  it("SPEC_HASH matches the feature list", async () => {
    // If this fails you changed FEATURES: log the change in docs/decisions.md and set
    // SPEC_HASH to the value printed here. Any trained model must be retrained.
    expect(await computeSpecHash()).toBe(SPEC_HASH);
  });

  it("the hash changes when the order changes but not when wording changes", async () => {
    const swapped = [...FEATURES.slice(1, 2), ...FEATURES.slice(0, 1), ...FEATURES.slice(2)];
    expect(await computeSpecHash(swapped)).not.toBe(SPEC_HASH);

    const reworded = FEATURES.map((f) => ({
      ...f,
      reason: "Different wording.",
    }));
    expect(await computeSpecHash(reworded)).toBe(SPEC_HASH);
  });

  it("canonical text is one JSON array per line (Python can reproduce it)", () => {
    expect(canonicalSpec().split("\n")[0]).toBe('["url_length","length",1000]');
  });

  it("rejects a model trained on a different spec", () => {
    expect(() => assertModelMatchesSpec({ specHash: SPEC_HASH })).not.toThrow();
    expect(() => assertModelMatchesSpec({ specHash: "abc" })).toThrow(/does not match/);
  });
});
