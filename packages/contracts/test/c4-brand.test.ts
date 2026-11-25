import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchesBrandKeyword, type Brand } from "../src";
import brandsJson from "../../../brands/brands.json";

const brands = brandsJson as Brand[];

/**
 * Ordinary words chosen because they contain a brand keyword as a run of letters inside a
 * longer word (STY-67 review): chase/purchase, irs/shirts, cra/craigslist, citi/citizen,
 * bell/doorbell, meta/metadata, ups/backups. A keyword must never whole-word match any of
 * these, however it's spelled.
 */
const BENIGN_WORDS = [
  "purchase",
  "repurchase",
  "shirts",
  "first",
  "affairs",
  "craigslist",
  "crafts",
  "aircraft",
  "citizen",
  "doorbell",
  "bluebell",
  "metadata",
  "metaverse",
  "backups",
  "startups",
  "makeups",
];

/**
 * Keywords that are ordinary standalone English words, not just substrings of other words
 * (visa, zoom, uber, tangerine, intuit). Whole-word matching can't save these: a completely
 * unrelated site can legitimately use the word itself (a travel agency's "student-visa.com",
 * a tutoring site's "zoomtutoring.com"). The brand list drops them rather than matching
 * more strictly, per STY-67's "drop them or match them more strictly".
 */
const DROPPED_WHOLE_WORD_KEYWORDS = ["visa", "zoom", "uber", "tangerine", "intuit"];

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

  it("has no domain whose main label is a single character (e.g. x.com), which makes almost anything a 1-edit lookalike", () => {
    for (const b of brands) {
      for (const domain of b.domains) {
        expect((domain.split(".")[0] ?? "").length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("never carries a keyword that's just an everyday word (visa, zoom, uber, tangerine, intuit)", () => {
    const allKeywords = brands.flatMap((b) => b.keywords);
    for (const word of DROPPED_WHOLE_WORD_KEYWORDS) {
      expect(allKeywords).not.toContain(word);
    }
  });

  it("keywords never whole-word match an ordinary word that merely contains them as a substring", () => {
    for (const b of brands) {
      for (const keyword of b.keywords) {
        for (const word of BENIGN_WORDS) {
          expect(matchesBrandKeyword(word, keyword)).toBe(false);
        }
      }
    }
  });

  it("matchesBrandKeyword still catches the keyword as its own hostname/path segment", () => {
    expect(matchesBrandKeyword("chase-secure-login.com", "chase")).toBe(true);
    expect(matchesBrandKeyword("login.chase.com.verify.net", "chase")).toBe(true);
    expect(matchesBrandKeyword("purchase.example.com", "chase")).toBe(false);
  });
});

describe("brands/safe-domains.txt (lookalike collisions, STY-67 review)", () => {
  const safeDomainsPath = fileURLToPath(
    new URL("../../../brands/safe-domains.txt", import.meta.url),
  );
  const raw = readFileSync(safeDomainsPath, "utf8");
  const safeDomains = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",")[0] ?? "");

  it("lists the known real-domain collisions from the review", () => {
    expect(safeDomains).toEqual(expect.arrayContaining(["cbc.ca", "ubs.com", "bmw.com"]));
  });

  it("never lists a domain that is also a protected brand domain", () => {
    const brandDomains = new Set(brands.flatMap((b) => b.domains));
    for (const d of safeDomains) {
      expect(brandDomains.has(d)).toBe(false);
    }
  });
});
