import { describe, expect, it } from "vitest";
import type { Brand } from "../src";
import brandsJson from "../../../brands/brands.json";

const brands = brandsJson as Brand[];

describe("brands/brands.json matches the C4 Brand type (STY-FR-14)", () => {
  it("has at least 60 brands", () => {
    expect(brands.length).toBeGreaterThanOrEqual(60);
  });

  it("every entry has a unique id, a name, at least one domain, and the right shape", () => {
    const ids = new Set<string>();
    for (const b of brands) {
      expect(typeof b.id).toBe("string");
      expect(ids.has(b.id)).toBe(false);
      ids.add(b.id);
      expect(typeof b.name).toBe("string");
      expect(Array.isArray(b.domains)).toBe(true);
      expect(b.domains.length).toBeGreaterThan(0);
      expect(Array.isArray(b.keywords)).toBe(true);
      expect(typeof b.country).toBe("string");
    }
  });

  it("includes the Canadian brands named in doc 02 section 4", () => {
    const ids = brands.map((b) => b.id);
    const expected = [
      "interac",
      "cra",
      "canadapost",
      "servicecanada",
      "rbc",
      "td",
      "scotiabank",
      "bmo",
      "cibc",
      "desjardins",
      "rogers",
      "bell",
      "telus",
      "serviceontario",
      "western",
    ];
    for (const id of expected) {
      expect(ids).toContain(id);
    }
  });

  it("drops short, common-word keywords that would false-alarm FR-17 (td, bell, meta)", () => {
    const risky = ["td", "bell", "meta"];
    for (const b of brands) {
      for (const k of b.keywords) {
        expect(risky).not.toContain(k);
      }
    }
  });
});
