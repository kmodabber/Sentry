import { describe, expect, it, vi } from "vitest";
import type { Check } from "@sentry-ext/contracts";
import {
  createBrandMisuseCheck,
  createDisguisedCharactersCheck,
  createLookalikeCheck,
  findRedFlags,
  redFlagsCheck,
  runPipeline,
  sumRedFlagPoints,
  type RedFlagHit,
} from "../src";
import scoring from "../src/scoring.json";
import knownBadRaw from "../../../fixtures/urls/known_bad.csv?raw";

const WEIGHTS = scoring.red_flags;

describe("findRedFlags (TC-08)", () => {
  describe("clean URLs trigger nothing", () => {
    it.each([
      ["https://www.google.com"],
      ["https://www.rbc.com/personal.html"],
      ["https://www.example.com/a/normal/path/under/a/hundred/chars"],
    ])("%s", (url) => {
      expect(findRedFlags(url)).toEqual([]);
    });
  });

  describe("one flag at a time", () => {
    it("ip_host: IPv4", () => {
      expect(findRedFlags("http://192.0.2.10/login")).toEqual([
        { id: "ip_host", points: WEIGHTS.ip_host, reason: expect.any(String) },
      ]);
    });

    it("ip_host: IPv6", () => {
      const hits = findRedFlags("http://[2001:db8::1]/");
      expect(hits.map((h) => h.id)).toEqual(["ip_host"]);
    });

    it("ip_host: decimal IPv4", () => {
      const hits = findRedFlags("http://3221225994/login");
      expect(hits.map((h) => h.id)).toEqual(["ip_host"]);
    });

    it("ip_host: hex IPv4", () => {
      const hits = findRedFlags("http://0xC0.0x00.0x02.0x0A/login");
      expect(hits.map((h) => h.id)).toEqual(["ip_host"]);
    });

    it("at_symbol", () => {
      expect(findRedFlags("http://user@evil-site.com/")).toEqual([
        { id: "at_symbol", points: WEIGHTS.at_symbol, reason: expect.any(String) },
      ]);
    });

    it("at_symbol: an @ in the path, not just in userinfo", () => {
      const hits = findRedFlags("http://evil.com/x@paypal.com");
      expect(hits.map((h) => h.id)).toEqual(["at_symbol"]);
    });

    it('at_symbol: an empty userinfo ("@" with nothing before it) still fires', () => {
      const hits = findRedFlags("http://@evil.com/");
      expect(hits.map((h) => h.id)).toEqual(["at_symbol"]);
    });

    it("deep_subdomains: 4 levels", () => {
      expect(findRedFlags("http://a.b.c.d.example.com/")).toEqual([
        { id: "deep_subdomains", points: WEIGHTS.deep_subdomains, reason: expect.any(String) },
      ]);
    });

    it("deep_subdomains: exactly 3 levels does not trigger", () => {
      expect(findRedFlags("http://a.b.c.example.com/")).toEqual([]);
    });

    it("deep_subdomains: www counts as a level (www + 3 more = 4, triggers)", () => {
      expect(findRedFlags("http://www.a.b.c.example.com/")).toEqual([
        { id: "deep_subdomains", points: WEIGHTS.deep_subdomains, reason: expect.any(String) },
      ]);
    });

    it("deep_subdomains: bare www alone does not trigger", () => {
      expect(findRedFlags("http://www.example.com/")).toEqual([]);
    });

    it("long_url: exactly 100 characters does not trigger", () => {
      const prefix = "https://example.com/";
      const url = prefix + "a".repeat(100 - prefix.length);
      expect(url.length).toBe(100);
      expect(findRedFlags(url)).toEqual([]);
    });

    it("long_url: 101 characters triggers", () => {
      const prefix = "https://example.com/";
      const url = prefix + "a".repeat(101 - prefix.length);
      expect(url.length).toBe(101);
      expect(findRedFlags(url)).toEqual([
        { id: "long_url", points: WEIGHTS.long_url, reason: expect.any(String) },
      ]);
    });

    it("abused_tld", () => {
      expect(findRedFlags("http://scam-site.xyz/")).toEqual([
        { id: "abused_tld", points: WEIGHTS.abused_tld, reason: expect.any(String) },
      ]);
    });

    it("abused_tld: a multi-part suffix built on an abused TLD (evil.com.ml) still fires", () => {
      const hits = findRedFlags("http://evil.com.ml/");
      expect(hits.map((h) => h.id)).toEqual(["abused_tld"]);
    });

    it("abused_tld: a clean multi-part suffix (example.co.uk) does not fire", () => {
      const hits = findRedFlags("http://example.co.uk/");
      expect(hits.find((h) => h.id === "abused_tld")).toBeUndefined();
    });

    it("shortener", () => {
      expect(findRedFlags("http://bit.ly/abc123")).toEqual([
        { id: "shortener", points: WEIGHTS.shortener, reason: expect.any(String) },
      ]);
    });

    it("shortener lookalike: bit.ly.evil.com does not trigger shortener", () => {
      const hits = findRedFlags("http://bit.ly.evil.com/");
      expect(hits.find((h) => h.id === "shortener")).toBeUndefined();
    });

    it("free_hosting", () => {
      expect(findRedFlags("http://myapp.netlify.app/")).toEqual([
        { id: "free_hosting", points: WEIGHTS.free_hosting, reason: expect.any(String) },
      ]);
    });

    it("free_hosting: a real page on github.io flags only free_hosting", () => {
      expect(findRedFlags("http://someuser.github.io/project/")).toEqual([
        { id: "free_hosting", points: WEIGHTS.free_hosting, reason: expect.any(String) },
      ]);
    });

    it("free_hosting lookalike: notgithub.io does not trigger", () => {
      const hits = findRedFlags("http://notgithub.io/");
      expect(hits.find((h) => h.id === "free_hosting")).toBeUndefined();
    });
  });

  describe("several flags at once", () => {
    it("at_symbol + deep_subdomains + shortener + long_url, ordered highest points first", () => {
      const prefix = "http://user@a.b.c.d.bit.ly/";
      const url = prefix + "a".repeat(Math.max(0, 101 - prefix.length));
      const hits = findRedFlags(url);
      expect(hits.map((h) => h.id)).toEqual([
        "shortener",
        "at_symbol",
        "deep_subdomains",
        "long_url",
      ]);
      expect(sumRedFlagPoints(hits)).toBe(
        WEIGHTS.at_symbol + WEIGHTS.shortener + WEIGHTS.deep_subdomains + WEIGHTS.long_url,
      );
    });
  });

  describe("edge cases", () => {
    it("uppercase host is treated the same as lowercase", () => {
      expect(findRedFlags("http://BIT.LY/abc")).toEqual(findRedFlags("http://bit.ly/abc"));
    });

    it("a trailing dot on the host is treated the same as without it", () => {
      expect(findRedFlags("http://bit.ly./abc")).toEqual(findRedFlags("http://bit.ly/abc"));
    });

    it("a port in the URL does not interfere with other flags", () => {
      expect(findRedFlags("http://bit.ly:8080/abc")).toEqual([
        { id: "shortener", points: WEIGHTS.shortener, reason: expect.any(String) },
      ]);
    });

    it("a multi-part suffix (bank.co.uk) is not mistaken for deep subdomains", () => {
      expect(findRedFlags("https://x.y.bank.co.uk/")).toEqual([]);
    });
  });
});

describe("sumRedFlagPoints", () => {
  it("sums plain hits", () => {
    const hits: RedFlagHit[] = [
      { id: "ip_host", points: 25, reason: "r1" },
      { id: "at_symbol", points: 25, reason: "r2" },
    ];
    expect(sumRedFlagPoints(hits)).toBe(50);
  });

  it("caps a combination over 100 at 100", () => {
    const hits: RedFlagHit[] = [
      { id: "ip_host", points: 60, reason: "r1" },
      { id: "at_symbol", points: 60, reason: "r2" },
    ];
    expect(sumRedFlagPoints(hits)).toBe(100);
  });

  it("returns 0 for no hits", () => {
    expect(sumRedFlagPoints([])).toBe(0);
  });
});

describe("redFlagsCheck (the registered Check)", () => {
  it("returns ok/0/null for a clean URL", async () => {
    const result = await redFlagsCheck.check("https://www.google.com", {});
    expect(result).toMatchObject({ check: "red_flags", signal: "ok", points: 0, reason: null });
    expect(result.evidence).toBeUndefined();
  });

  it("returns warn with evidence for a flagged URL", async () => {
    const result = await redFlagsCheck.check("http://192.0.2.10/login", {});
    expect(result.signal).toBe("warn");
    expect(result.points).toBe(WEIGHTS.ip_host);
    expect(result.reason).toEqual(expect.any(String));
    expect(result.evidence).toEqual({
      flags: [{ id: "ip_host", points: WEIGHTS.ip_host, reason: expect.any(String) }],
    });
  });

  it("picks the highest-scoring flag's reason when several fire", async () => {
    const result = await redFlagsCheck.check("http://user@scam.xyz/", {});
    const flags = (result.evidence as { flags: RedFlagHit[] }).flags;
    expect(flags[0]?.id).toBe("at_symbol"); // 25 > abused_tld's 15
    expect(result.reason).toBe(flags[0]?.reason);
  });

  it("weights come from scoring.json: changing a weight in setup changes the points", async () => {
    vi.resetModules();
    vi.doMock("../src/scoring.json", () => ({
      default: { ...scoring, red_flags: { ...scoring.red_flags, ip_host: 99 } },
    }));
    const { redFlagsCheck: patchedCheck } = await import("../src");
    const result = await patchedCheck.check("http://192.0.2.10/", {});
    expect(result.points).toBe(99);
    vi.doUnmock("../src/scoring.json");
    vi.resetModules();
  });
});

// Reviewer request (STY-71 review): every row in fixtures/urls/known_bad.csv must score
// above "likely safe" through the full real pipeline, not just red_flags in isolation --
// the lookalike/disguised-characters/brand-misuse rows depend on those checks, not this one.
// Safe Browsing is stubbed as "not listed" since it needs a live WorkerClient otherwise.
const stubSafeBrowsing: Check = {
  id: "safebrowsing",
  timeoutMs: 100,
  async check() {
    return { check: "safebrowsing", signal: "ok", points: 0, reason: null, ms: 0 };
  },
};

const knownBadUrls = knownBadRaw
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((line) => line.split(",")[0]!);

describe("known_bad.csv guarantee (reviewer request)", () => {
  it.each(knownBadUrls)("%s is never likely_safe", async (url) => {
    const v = await runPipeline({
      url,
      checks: [
        redFlagsCheck,
        stubSafeBrowsing,
        createLookalikeCheck(),
        createDisguisedCharactersCheck(),
        createBrandMisuseCheck(),
      ],
      version: "0.0.1/test",
    });
    expect(v.verdict).not.toBe("likely_safe");
  });
});
