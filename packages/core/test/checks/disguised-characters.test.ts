import { describe, expect, it } from "vitest";
import type { Brand } from "@sentry-ext/contracts";
import {
  createDisguisedCharactersCheck,
  findHomograph,
} from "../../src/checks/disguised-characters";
import brandsJson from "../../../../brands/brands.json";
import lookalikesRaw from "../../../../brands/lookalikes.txt?raw";
import knownBadRaw from "../../../../fixtures/urls/known_bad.csv?raw";
import knownGoodRaw from "../../../../fixtures/urls/known_good.csv?raw";

const brands = brandsJson as Brand[];

// Only the 5 "disguised letter" rows in brands/lookalikes.txt are this check's job (STY-67
// review, doc 03): the other 45 rows are FR-15 (edit distance, STY-68) and FR-17 (brand in
// the wrong place, Brandon's future STY-70).
const rows = lookalikesRaw
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split(",") as [string, string, string]);
const fr16Rows = rows.filter(([, , trick]) => trick.includes("disguised letter"));

function rowsFromCsv(csv: string): [string, string][] {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => line.split(",") as [string, string]);
}

describe("findHomograph (STY-69, STY-FR-16)", () => {
  it("matches every FR-16 row in brands/lookalikes.txt to its real brand domain", () => {
    expect(fr16Rows.length).toBe(5);
    for (const [fake, real] of fr16Rows) {
      const match = findHomograph(fake);
      expect(match, `expected ${fake} to match ${real}`).not.toBeNull();
      expect(match?.brandDomain).toBe(real);
    }
  });

  it("does not match an unrelated domain", () => {
    expect(findHomograph("totally-unrelated-site.example")).toBeNull();
  });
});

describe("createDisguisedCharactersCheck (STY-69)", () => {
  const check = createDisguisedCharactersCheck();

  it("never flags a brand's own real domain, for every brand (TC-07)", async () => {
    // Real domains are plain ASCII, so isPunycode is false and the gate alone protects them —
    // findHomograph is never even called for these.
    for (const brand of brands) {
      for (const domain of brand.domains) {
        const result = await check.check(`https://${domain}/`, {});
        expect(result.signal, `expected ${domain} not to be flagged`).toBe("ok");
      }
    }
  });

  it("flags the known-bad disguised-character URL with the real name and the actual characters", async () => {
    const bad = rowsFromCsv(knownBadRaw).find(([, reason]) => reason.startsWith("disguised"));
    expect(bad).toBeDefined();
    const [url] = bad!;
    const result = await check.check(url, {});
    expect(result.signal).toBe("danger");
    expect(result.reason).toContain("paypal.com");
    expect(result.reason).toContain("pаypal.com"); // the actual Cyrillic а shown
    expect(result.evidence).toEqual({ brand: "paypal.com" });
  });

  it.each(rowsFromCsv(knownGoodRaw).map(([url]) => url))(
    "leaves the known-good URL %s alone",
    async (url) => {
      const result = await check.check(url, {});
      expect(result.signal).toBe("ok");
    },
  );

  it("does not flag a pure-ASCII lookalike — that's FR-15's job (STY-68), not this check's", async () => {
    const result = await check.check("https://rnicrosoft.com/", {});
    expect(result.signal).toBe("ok");
  });

  it("is ok, not an error, for a bare IP", async () => {
    const result = await check.check("http://192.0.2.10/login", {});
    expect(result.signal).toBe("ok");
  });
});
