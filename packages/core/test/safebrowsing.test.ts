import { describe, expect, it, vi } from "vitest";
import { SB_TEST_URLS, type SafeBrowsingResponse } from "@sentry-ext/contracts";
import {
  canonicalString,
  createSafeBrowsingCheck,
  createWorkerClient,
  expressions,
  runPipeline,
  STANDIN_CHECKS,
  WorkerRequestError,
} from "../src";
import { NEGATIVE_CACHE_MS } from "../src/checks/safebrowsing";

// SHA-256 of "testsafebrowsing.appspot.com/s/phishing.html", computed with `shasum -a 256`,
// so a wrong hash in the code can't pass.
const PHISHING_HASH = "771MOrRPMn6xPKlCrXx/CrR+wmCk0LgFFoSgGy7zUiA=";
const PHISHING_URL = "https://testsafebrowsing.appspot.com/s/phishing.html";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** A fake Worker that lists some expressions, answering like Google: by prefix. */
function fakeWorker(listed: Record<string, string>, ttlMs = 5 * 60 * 1000, now = Date.now) {
  const calls: string[][] = [];
  return {
    calls,
    async safeBrowsing(prefixes: string[]): Promise<SafeBrowsingResponse> {
      calls.push(prefixes);
      const fullHashes = [];
      for (const [expression, threatType] of Object.entries(listed)) {
        const full = await sha256(expression);
        if (prefixes.includes(b64(full.subarray(0, 4)))) {
          fullHashes.push({
            hash: b64(full),
            threatTypes: [threatType],
            expiresAt: new Date(now() + ttlMs).toISOString(),
          });
        }
      }
      return { fullHashes };
    },
  };
}

const GOOGLE_TEST_PAGES = Object.fromEntries(SB_TEST_URLS.map((t) => [t.expression, t.threatType]));

const run = (url: string, check: ReturnType<typeof createSafeBrowsingCheck>) =>
  runPipeline({ url, checks: [...STANDIN_CHECKS, check], version: "0.0.1/test" });

describe("canonicalize (Google's published cases)", () => {
  const cases: [string, string][] = [
    ["http://host/%25%32%35", "http://host/%25"],
    ["http://host/%25%32%35%25%32%35", "http://host/%25%25"],
    ["http://host/%2525252525252525", "http://host/%25"],
    ["http://host/asdf%25%32%35asd", "http://host/asdf%25asd"],
    ["http://host/%%%25%32%35asd%%", "http://host/%25%25%25asd%25%25"],
    ["http://www.google.com/", "http://www.google.com/"],
    [
      "http://%31%36%38%2e%31%38%38%2e%39%39%2e%32%36/%2E%73%65%63%75%72%65/%77%77%77%2E%65%62%61%79%2E%63%6F%6D/",
      "http://168.188.99.26/.secure/www.ebay.com/",
    ],
    [
      "http://195.127.0.11/uploads/%20%20%20%20/.verify/.eBaysecure=updateuserdataxplimnbqmn-xplmvalidateinfoswqpcmlx=hgplmcx/",
      "http://195.127.0.11/uploads/%20%20%20%20/.verify/.eBaysecure=updateuserdataxplimnbqmn-xplmvalidateinfoswqpcmlx=hgplmcx/",
    ],
    [
      "http://host%23.com/%257Ea%2521b%2540c%2523d%2524e%25f%255E00%252611%252A22%252833%252944_55%252B",
      "http://host%23.com/~a!b@c%23d$e%25f^00&11*22(33)44_55+",
    ],
    ["http://3279880203/blah", "http://195.127.0.11/blah"],
    ["http://www.google.com/blah/..", "http://www.google.com/"],
    ["www.google.com/", "http://www.google.com/"],
    ["www.google.com", "http://www.google.com/"],
    ["http://www.evil.com/blah#frag", "http://www.evil.com/blah"],
    ["http://www.GOOgle.com/", "http://www.google.com/"],
    ["http://www.google.com.../", "http://www.google.com/"],
    ["http://www.google.com/foo\tbar\rbaz\n2", "http://www.google.com/foobarbaz2"],
    ["http://www.google.com/q?", "http://www.google.com/q?"],
    ["http://www.google.com/q?r?", "http://www.google.com/q?r?"],
    ["http://www.google.com/q?r?s", "http://www.google.com/q?r?s"],
    ["http://evil.com/foo#bar#baz", "http://evil.com/foo"],
    ["http://evil.com/foo;", "http://evil.com/foo;"],
    ["http://evil.com/foo?bar;", "http://evil.com/foo?bar;"],
    ["http://notrailingslash.com", "http://notrailingslash.com/"],
    ["http://www.gotaport.com:1234/", "http://www.gotaport.com/"],
    ["  http://www.google.com/  ", "http://www.google.com/"],
    ["http:// leadingspace.com/", "http://%20leadingspace.com/"],
    ["http://%20leadingspace.com/", "http://%20leadingspace.com/"],
    ["%20leadingspace.com/", "http://%20leadingspace.com/"],
    ["https://www.securesite.com/", "https://www.securesite.com/"],
    ["http://host.com/ab%23cd", "http://host.com/ab%23cd"],
    ["http://host.com//twoslashes?more//slashes", "http://host.com/twoslashes?more//slashes"],
  ];
  it.each(cases)("%j -> %j", (input, expected) => {
    expect(canonicalString(input)).toBe(expected);
  });

  it("drops user info and reads octal and hex IPs", () => {
    expect(canonicalString("http://user:pw@Example.com:8080/a")).toBe("http://example.com/a");
    expect(canonicalString("http://0x7f.1/")).toBe("http://127.0.0.1/");
    expect(canonicalString("http://0177.0.0.1/")).toBe("http://127.0.0.1/");
  });
});

describe("expressions (Google's published cases)", () => {
  it("a.b.c/1/2.html?param=1", () => {
    expect(expressions("http://a.b.c/1/2.html?param=1").sort()).toEqual(
      [
        "a.b.c/1/2.html?param=1",
        "a.b.c/1/2.html",
        "a.b.c/",
        "a.b.c/1/",
        "b.c/1/2.html?param=1",
        "b.c/1/2.html",
        "b.c/",
        "b.c/1/",
      ].sort(),
    );
  });

  it("a.b.c.d.e.f.g/1.html: exact host plus 4 suffixes from the last 5 labels", () => {
    expect(expressions("http://a.b.c.d.e.f.g/1.html").sort()).toEqual(
      [
        "a.b.c.d.e.f.g/1.html",
        "a.b.c.d.e.f.g/",
        "c.d.e.f.g/1.html",
        "c.d.e.f.g/",
        "d.e.f.g/1.html",
        "d.e.f.g/",
        "e.f.g/1.html",
        "e.f.g/",
        "f.g/1.html",
        "f.g/",
      ].sort(),
    );
  });

  it("1.2.3.4/1/: an IP gets no host suffixes", () => {
    expect(expressions("http://1.2.3.4/1/").sort()).toEqual(["1.2.3.4/", "1.2.3.4/1/"]);
  });

  it("a.b.c/saw-cgi/eBayISAPI.dll/", () => {
    expect(expressions("http://a.b.c/saw-cgi/eBayISAPI.dll/").sort()).toEqual(
      [
        "a.b.c/saw-cgi/eBayISAPI.dll/",
        "a.b.c/",
        "a.b.c/saw-cgi/",
        "b.c/saw-cgi/eBayISAPI.dll/",
        "b.c/",
        "b.c/saw-cgi/",
      ].sort(),
    );
  });

  it("never makes more than 30, the C3 limit", () => {
    const deep = "http://a.b.c.d.e.f.g.h/1/2/3/4/5/6/7.html?q=1";
    expect(expressions(deep)).toHaveLength(30);
  });
});

describe("Safe Browsing check", () => {
  it.each(SB_TEST_URLS)("flags Google's $threatType test page as dangerous", async (t) => {
    const check = createSafeBrowsingCheck(fakeWorker(GOOGLE_TEST_PAGES));
    const v = await run(t.url, check);
    expect(v.verdict).toBe("dangerous");
    expect(v.reasons[0]).toMatchObject({ check: "safebrowsing", source: "google" });
    expect(v.checks.find((c) => c.check === "safebrowsing")).toMatchObject({
      signal: "danger",
      feedHit: true,
      evidence: { threatTypes: [t.threatType] },
    });
  });

  it("uses the phishing reason, attributed to Google", async () => {
    const v = await run(PHISHING_URL, createSafeBrowsingCheck(fakeWorker(GOOGLE_TEST_PAGES)));
    // The popup renders source "google" as "Advisory provided by Google".
    expect(v.reasons[0]).toEqual({
      text: "Google Safe Browsing lists this page as a phishing site.",
      check: "safebrowsing",
      source: "google",
    });
  });

  it("sends only 4-byte prefixes over HTTP, never the URL or a full hash", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        fullHashes: [
          {
            hash: PHISHING_HASH,
            threatTypes: ["SOCIAL_ENGINEERING"],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        ],
      }),
    );
    const check = createSafeBrowsingCheck(createWorkerClient("http://worker.test/", fetchMock));
    const v = await run(`${PHISHING_URL}?user=alice#top`, check);
    expect(v.verdict).toBe("dangerous");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://worker.test/v1/sb");
    const body = String(init?.body);
    const { prefixes } = JSON.parse(body) as { prefixes: string[] };
    expect(prefixes.length).toBeGreaterThan(0);
    expect(prefixes.length).toBeLessThanOrEqual(30);
    for (const p of prefixes) expect(atob(p)).toHaveLength(4);
    expect(prefixes).toContain("771MOg==");
    for (const leak of ["testsafebrowsing", "appspot", "alice", "phishing", PHISHING_HASH]) {
      expect(body).not.toContain(leak);
    }
  });

  it("compares full hashes locally: a shared prefix alone isn't a match", async () => {
    const full = await sha256("testsafebrowsing.appspot.com/s/phishing.html");
    const other = Uint8Array.from(full);
    other[31] = full[31]! ^ 0xff; // same 4-byte prefix, different full hash
    const worker = {
      safeBrowsing: async (): Promise<SafeBrowsingResponse> => ({
        fullHashes: [
          {
            hash: b64(other),
            threatTypes: ["SOCIAL_ENGINEERING"],
            expiresAt: "2099-01-01T00:00:00Z",
          },
        ],
      }),
    };
    const v = await run(PHISHING_URL, createSafeBrowsingCheck(worker));
    expect(v.verdict).toBe("likely_safe");
  });

  it("matches a listed parent path, like Google does", async () => {
    const check = createSafeBrowsingCheck(
      fakeWorker({ "evil.phishclaw.test/login/": "SOCIAL_ENGINEERING" }),
    );
    const v = await run("https://www.evil.phishclaw.test/login/step2.php?id=7", check);
    expect(v.verdict).toBe("dangerous");
  });

  it("is ok when nothing is listed", async () => {
    const v = await run(
      "https://example.com/",
      createSafeBrowsingCheck(fakeWorker(GOOGLE_TEST_PAGES)),
    );
    expect(v.verdict).toBe("likely_safe");
    expect(v.partial).toBe(false);
  });

  it("caches a listed hash until it expires, then asks again", async () => {
    let t = 1_000_000;
    const worker = fakeWorker(GOOGLE_TEST_PAGES, 60_000, () => t);
    const check = createSafeBrowsingCheck(worker, { now: () => t });
    expect((await run(PHISHING_URL, check)).verdict).toBe("dangerous");
    t += 59_000;
    expect((await run(PHISHING_URL, check)).verdict).toBe("dangerous");
    expect(worker.calls).toHaveLength(1);
    t += 2_000;
    expect((await run(PHISHING_URL, check)).verdict).toBe("dangerous");
    expect(worker.calls).toHaveLength(2);
  });

  it("caches 'not listed' for 5 minutes, then asks again", async () => {
    let t = 1_000_000;
    const worker = fakeWorker(GOOGLE_TEST_PAGES, 60_000, () => t);
    const check = createSafeBrowsingCheck(worker, { now: () => t });
    await run("https://example.com/a", check);
    t += NEGATIVE_CACHE_MS - 1;
    await run("https://example.com/a", check);
    expect(worker.calls).toHaveLength(1);
    t += 2;
    await run("https://example.com/a", check);
    expect(worker.calls).toHaveLength(2);
  });

  it("only asks for prefixes it doesn't already know", async () => {
    const worker = fakeWorker(GOOGLE_TEST_PAGES);
    const check = createSafeBrowsingCheck(worker);
    await run("https://example.com/a/b.html", check);
    await run("https://example.com/a/c.html", check);
    // Shared expressions (example.com/, example.com/a/) aren't sent twice.
    expect(worker.calls[1]).toHaveLength(1);
  });

  it("skips non-web pages without a network call", async () => {
    const worker = fakeWorker(GOOGLE_TEST_PAGES);
    const result = await createSafeBrowsingCheck(worker).check("chrome://settings", {});
    expect(result.signal).toBe("skipped");
    expect(worker.calls).toHaveLength(0);
  });

  it("marks the verdict partial when the Worker is down", async () => {
    const check = createSafeBrowsingCheck(
      createWorkerClient("http://worker.test", async () =>
        jsonResponse({ error: "upstream_down", message: "Safe Browsing is down." }, 503),
      ),
    );
    const v = await run(PHISHING_URL, check);
    expect(v.partial).toBe(true);
    expect(v.missing).toEqual(["safebrowsing"]);
  });

  it("marks the verdict partial when the Worker can't be reached", async () => {
    const check = createSafeBrowsingCheck(
      createWorkerClient("http://worker.test", () => Promise.reject(new TypeError("fetch failed"))),
    );
    expect((await run(PHISHING_URL, check)).missing).toEqual(["safebrowsing"]);
  });
});

describe("createWorkerClient", () => {
  it("throws a WorkerRequestError carrying the C3 error code", async () => {
    const client = createWorkerClient("http://worker.test", async () =>
      jsonResponse({ error: "rate_limited", message: "Slow down.", retryAfter: 5 }, 429),
    );
    const err = await client.openPhish().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorkerRequestError);
    expect(err).toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("encodes the hostname into the host route", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ urlhaus: null, registeredAt: null, rdap: true }),
    );
    await createWorkerClient("http://worker.test", fetchMock).host("new.phishclaw.test");
    expect(fetchMock.mock.calls[0]![0]).toBe("http://worker.test/v1/host/new.phishclaw.test");
  });
});
