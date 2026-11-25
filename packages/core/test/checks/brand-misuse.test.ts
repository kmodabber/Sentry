import { describe, expect, it } from "vitest";
import type { Brand } from "@sentry-ext/contracts";
import { createBrandMisuseCheck, findBrandMisuse } from "../../src/checks/brand-misuse";
import { parseUrl } from "@sentry-ext/url-parser";
import brandsJson from "../../../../brands/brands.json";
import lookalikesRaw from "../../../../brands/lookalikes.txt?raw";
import knownBadRaw from "../../../../fixtures/urls/known_bad.csv?raw";
import knownGoodRaw from "../../../../fixtures/urls/known_good.csv?raw";

const brands = brandsJson as Brand[];

// Only the "brand plus word" and "brand in subdomain" rows in brands/lookalikes.txt are this
// check's job (STY-67 review, doc 03): the rest are FR-15 (STY-68) and FR-16 (STY-69).
const FR17_TRICKS = new Set(["brand plus word", "brand in subdomain"]);
const rows = lookalikesRaw
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split(",") as [string, string, string]);
const fr17Rows = rows.filter(([, , trick]) => FR17_TRICKS.has(trick));
const otherRows = rows.filter(([, , trick]) => !FR17_TRICKS.has(trick));

// canada.ca.refund-claim.com is a deliberate gap: its subdomain is "canada.ca", and neither
// "canada" nor "ca" is a safe whole-word keyword for any brand (both are far too generic —
// the same risk visa/zoom/uber/tangerine/intuit were dropped for in the STY-67 review). No
// brand's keyword list includes them, so this one row isn't caught.
const KNOWN_GAP = "canada.ca.refund-claim.com";

// Four FR-15 ("hyphen added" / "wrong ending") rows keep the brand's exact spelling and so
// also legitimately match this check: td-canadatrust.com, tdcanadatrust.co, rbc-royalbank.com
// and canadapost.co all contain a whole-word keyword, same as a real FR-17 case would. That's
// not an overlap bug — FR-15 (edit distance) and this check (keyword match) are different
// mechanisms that can both correctly fire on the same URL. The other FR-15/FR-16 rows mangle
// the brand's spelling (missing/extra/swapped letters, digits for letters, disguised
// characters), so no whole-word keyword match is possible there.
const EXPECTED_OVERLAP = new Set([
  "td-canadatrust.com",
  "tdcanadatrust.co",
  "rbc-royalbank.com",
  "canadapost.co",
]);

function rowsFromCsv(csv: string): [string, string][] {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => line.split(",") as [string, string]);
}

describe("findBrandMisuse (STY-70, STY-FR-17)", () => {
  it("flags every FR-17 row in brands/lookalikes.txt except the documented canada.ca gap", () => {
    expect(fr17Rows.length).toBe(18);
    const unexpectedlyUncaught: string[] = [];
    for (const [fake] of fr17Rows) {
      if (fake === KNOWN_GAP) continue;
      const match = findBrandMisuse(parseUrl(`https://${fake}/`));
      if (!match) unexpectedlyUncaught.push(fake);
    }
    expect(unexpectedlyUncaught).toEqual([]);
  });

  it("does not catch the documented canada.ca gap (both of its subdomain's words are too generic to use as keywords)", () => {
    expect(findBrandMisuse(parseUrl(`https://${KNOWN_GAP}/`))).toBeNull();
  });

  it("does not overlap with FR-15/FR-16 rows that mangle the brand's spelling, only the ones that keep it exact", () => {
    const unexpectedOverlap: string[] = [];
    for (const [fake] of otherRows) {
      const match = findBrandMisuse(parseUrl(`https://${fake}/`));
      if (match && !EXPECTED_OVERLAP.has(fake)) unexpectedOverlap.push(fake);
    }
    expect(unexpectedOverlap).toEqual([]);
  });

  it("never flags any of our tracked real domains, for every brand", () => {
    for (const brand of brands) {
      for (const domain of brand.domains) {
        expect(findBrandMisuse(parseUrl(`https://${domain}/`))).toBeNull();
        // A real subdomain of a real domain is still that registrable domain — also safe.
        expect(findBrandMisuse(parseUrl(`https://login.${domain}/account`))).toBeNull();
      }
    }
  });

  it("does not flag an unrelated domain and path with no brand keyword in it", () => {
    expect(findBrandMisuse(parseUrl("https://example.com/about-us"))).toBeNull();
  });

  it("names which brand and which part of the URL matched", () => {
    const match = findBrandMisuse(parseUrl("https://interac.etransfer-refund.com/"));
    expect(match).toMatchObject({ where: "subdomain" });
    expect(match?.brand.id).toBe("interac");
  });

  it("also catches a brand keyword hyphenated into the path, not just the hostname", () => {
    const match = findBrandMisuse(parseUrl("https://example.com/interac-login-verify"));
    expect(match).toMatchObject({ where: "path" });
    expect(match?.brand.id).toBe("interac");
  });
});

describe("createBrandMisuseCheck (STY-70)", () => {
  const check = createBrandMisuseCheck();

  it("flags the known-bad URL naming the brand and the real site", async () => {
    const bad = rowsFromCsv(knownBadRaw).find(([, reason]) => reason.startsWith("mentions"));
    expect(bad).toBeDefined();
    const [url] = bad!;
    const result = await check.check(url, {});
    expect(result.signal).toBe("warn");
    expect(result.points).toBeGreaterThan(0);
    expect(result.reason).toBe("It mentions Interac, but the site is etransfer-refund.com.");
    expect(result.evidence).toEqual({ brand: "interac.ca" });
  });

  it.each(rowsFromCsv(knownGoodRaw).map(([url]) => url))(
    "leaves the known-good URL %s alone",
    async (url) => {
      const result = await check.check(url, {});
      expect(result.signal).toBe("ok");
    },
  );

  it("is ok, not an error, for a URL with no domain (bare IP)", async () => {
    const result = await check.check("http://192.0.2.10/login", {});
    expect(result.signal).toBe("ok");
    expect(result.reason).toBeNull();
  });
});
