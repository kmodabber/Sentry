import { describe, expect, it } from "vitest";
import type { Brand } from "@sentry-ext/contracts";
import {
  createLookalikeCheck,
  editDistance,
  findLookalike,
  SAFE_DOMAINS,
} from "../../src/checks/lookalike";
import brandsJson from "../../../../brands/brands.json";
import lookalikesRaw from "../../../../brands/lookalikes.txt?raw";
import knownGoodRaw from "../../../../fixtures/urls/known_good.csv?raw";
import knownBadRaw from "../../../../fixtures/urls/known_bad.csv?raw";

const brands = brandsJson as Brand[];

// brands/lookalikes.txt covers three different checks (STY-67 review, doc 03): FR-15 (this
// check, a pure edit-distance comparison on the domain itself), FR-16 (disguised/Cyrillic
// characters) and FR-17 (brand name in a subdomain or path). Only the FR-15 rows are this
// check's job; FR-16 and FR-17 are Brandon's separate future tickets (STY-69, STY-70).
const FR17_TRICKS = new Set(["brand plus word", "brand in subdomain"]);
const rows = lookalikesRaw
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split(",") as [string, string, string]);
const fr15Rows = rows.filter(
  ([, , trick]) => !FR17_TRICKS.has(trick) && !trick.includes("disguised letter"),
);

function rowsFromCsv(csv: string): [string, string][] {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => line.split(",") as [string, string]);
}

// known_bad.csv also covers the red-flags stand-in (a bare IP address) — not this check's job.
const knownBadLookalikes = rowsFromCsv(knownBadRaw)
  .filter(([, reason]) => reason.includes("lookalike"))
  .map(([url]) => url);

describe("editDistance", () => {
  it("is 0 for identical strings", () => {
    expect(editDistance("paypal.com", "paypal.com")).toBe(0);
  });

  it("counts a single substitution, insertion or deletion as 1", () => {
    expect(editDistance("paypal.com", "paypa1.com")).toBe(1);
    expect(editDistance("paypal.com", "paypall.com")).toBe(1);
    expect(editDistance("tdcanadatrust.com", "tdcanadatrust.co")).toBe(1);
  });

  it("counts the rn-for-m substitution as 2", () => {
    expect(editDistance("microsoft.com", "rnicrosoft.com")).toBe(2);
  });
});

describe("findLookalike (STY-68, STY-FR-15)", () => {
  it("never flags a brand's own real domain, for every brand in brands.json (TC-07)", () => {
    for (const brand of brands) {
      for (const domain of brand.domains) {
        expect(findLookalike(domain)).toBeNull();
      }
    }
  });

  it("never flags a domain on the safe-domains allowlist, even though it's 1 edit from a brand", () => {
    expect(SAFE_DOMAINS.size).toBeGreaterThan(0);
    for (const domain of SAFE_DOMAINS) {
      expect(findLookalike(domain)).toBeNull();
    }
  });

  it("flags every FR-15 row in brands/lookalikes.txt (excludes FR-16 and FR-17 rows)", () => {
    // 27 of the 50 rows are pure domain-edit tricks; the other 23 are FR-16/FR-17's.
    expect(fr15Rows.length).toBe(27);
    for (const [fake, real] of fr15Rows) {
      const match = findLookalike(fake);
      expect(match, `expected ${fake} to be flagged as a lookalike of ${real}`).not.toBeNull();
      expect(match?.brandDomain).toBe(real);
    }
  });

  it("caps short real domains at 1 edit, so a 2-edit variant isn't flagged", () => {
    // bmo.com is 7 characters: short. 2 edits away (b -> z, m -> q) must not match.
    expect(findLookalike("zqo.com")).toBeNull();
    // 1 edit away still matches (this is also why safe-domains.txt exists).
    expect(findLookalike("bno.com")?.brandDomain).toBe("bmo.com");
  });

  it("allows longer real domains up to 2 edits", () => {
    // microsoft.com is well over 8 characters, so 2 edits is allowed.
    const match = findLookalike("rnicrosoft.com");
    expect(match).toEqual({ brandDomain: "microsoft.com", edits: 2 });
  });

  it("does not flag an unrelated real domain", () => {
    expect(findLookalike("wikipedia.org")).toBeNull();
    expect(findLookalike("github.com")).toBeNull();
  });

  it("does not flag a domain more than 2 edits from anything", () => {
    expect(findLookalike("totally-unrelated-site.com")).toBeNull();
  });
});

describe("createLookalikeCheck (STY-68)", () => {
  const check = createLookalikeCheck();

  it.each(knownBadLookalikes)("flags the known-bad lookalike URL %s", async (url) => {
    const result = await check.check(url, {});
    expect(result.signal).toBe("danger");
    expect(result.points).toBeGreaterThan(0);
    expect(result.reason).toMatch(/^This looks like .+ but it is not\.$/);
  });

  it.each(rowsFromCsv(knownGoodRaw).map(([url]) => url))(
    "leaves the known-good URL %s alone",
    async (url) => {
      const result = await check.check(url, {});
      expect(result.signal).toBe("ok");
      expect(result.points).toBe(0);
      expect(result.reason).toBeNull();
    },
  );

  it("returns the brand's real domain and the edit count as evidence", async () => {
    const result = await check.check("https://login.paypa1.com/signin", {});
    expect(result.evidence).toEqual({ brand: "paypal.com", edits: 1 });
  });

  it("is ok, not an error, for a URL with no domain (bare IP)", async () => {
    const result = await check.check("http://192.0.2.10/login", {});
    expect(result.signal).toBe("ok");
    expect(result.reason).toBeNull();
  });
});
