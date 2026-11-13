import { describe, expect, it } from "vitest";
import {
  FEATURES,
  FEATURE_NAMES,
  MAX_URL_LENGTH,
  SPEC_HASH,
  SPEC_LISTS,
  assertModelMatchesSpec,
  canonicalSpec,
  computeSpecHash,
  prepareUrl,
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

  it("cuts every URL to 1,000 characters before features (STY-100)", () => {
    expect(MAX_URL_LENGTH).toBe(1000);
    const long = "https://example.com/" + "a".repeat(2000);
    expect(Array.from(prepareUrl(long))).toHaveLength(1000);
    expect(prepareUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("counts characters as code points, not UTF-16 units", () => {
    const emoji = "😀".repeat(1200); // 2 UTF-16 units each
    expect(Array.from(prepareUrl(emoji))).toHaveLength(1000);
  });

  it("SPEC_HASH matches the feature list", async () => {
    // If this fails you changed FEATURES or SPEC_LISTS: log the change in docs/decisions.md
    // and set SPEC_HASH to the value printed here. Any trained model must be retrained.
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

  it("the hash changes when any list or the length limit changes", async () => {
    const variants = [
      { ...SPEC_LISTS, maxUrlLength: 2000 },
      { ...SPEC_LISTS, phishingWords: [...SPEC_LISTS.phishingWords, "bank"] },
      { ...SPEC_LISTS, riskyFileTypes: [...SPEC_LISTS.riskyFileTypes, "iso"] },
      { ...SPEC_LISTS, specialChars: SPEC_LISTS.specialChars + "#" },
    ];
    for (const lists of variants) {
      expect(await computeSpecHash(FEATURES, lists)).not.toBe(SPEC_HASH);
    }
  });

  it("canonical text is compact JSON, one row per line (Python can reproduce it)", () => {
    const lines = canonicalSpec().split("\n");
    expect(lines[0]).toBe('["max_url_length",1000]');
    expect(lines[4]).toBe('["url_length","length",null]');
    expect(lines).toHaveLength(4 + FEATURES.length);
  });

  it("rejects a model trained on a different spec", () => {
    expect(() => assertModelMatchesSpec({ specHash: SPEC_HASH })).not.toThrow();
    expect(() => assertModelMatchesSpec({ specHash: "abc" })).toThrow(/does not match/);
  });
});
