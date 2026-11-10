import { describe, expect, it, vi } from "vitest";
import type { SafeBrowsingResponse } from "@sentry-ext/contracts";
import {
  createStandinSafeBrowsing,
  createWorkerClient,
  runPipeline,
  STANDIN_CHECKS,
  WorkerRequestError,
} from "../src";

// SHA-256 of "testsafebrowsing.appspot.com/s/phishing.html", computed with `shasum -a 256`.
const PHISHING_HASH = "771MOrRPMn6xPKlCrXx/CrR+wmCk0LgFFoSgGy7zUiA=";
const PHISHING_PREFIX = "771MOg==";
const PHISHING_URL = "https://testsafebrowsing.appspot.com/s/phishing.html";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const listed: SafeBrowsingResponse = {
  fullHashes: [
    {
      hash: PHISHING_HASH,
      threatTypes: ["SOCIAL_ENGINEERING"],
      expiresAt: "2099-01-01T00:00:00Z",
    },
  ],
};

function setup(answer: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(async () => answer());
  const check = createStandinSafeBrowsing(createWorkerClient("http://worker.test/", fetchMock));
  const run = (url: string) =>
    runPipeline({ url, checks: [...STANDIN_CHECKS, check], version: "0.0.1/test" });
  return { fetchMock, run };
}

describe("stand-in Safe Browsing check", () => {
  it("shows Google's phishing test page as dangerous with Google attribution", async () => {
    const { fetchMock, run } = setup(() => jsonResponse(listed));
    const v = await run(PHISHING_URL);

    expect(v.verdict).toBe("dangerous");
    expect(v.reasons[0]).toEqual({
      text: "Google Safe Browsing lists this page as a phishing site.",
      check: "safebrowsing",
      source: "google",
    });
    expect(v.partial).toBe(false);

    // Only the 4-byte prefix leaves the device, never the URL.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://worker.test/v1/sb");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ prefixes: [PHISHING_PREFIX] });
    expect(String(init?.body)).not.toContain("testsafebrowsing");
  });

  it("makes no network call for other pages", async () => {
    const { fetchMock, run } = setup(() => jsonResponse(listed));
    const v = await run("https://example.com/s/phishing.html");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(v.verdict).toBe("likely_safe");
    expect(v.checks.find((c) => c.check === "safebrowsing")?.signal).toBe("ok");
  });

  it("is ok when no full hash matches", async () => {
    const { run } = setup(() => jsonResponse({ fullHashes: [] }));
    const v = await run(PHISHING_URL);
    expect(v.verdict).toBe("likely_safe");
    expect(v.partial).toBe(false);
  });

  it("marks the verdict partial when the Worker is down", async () => {
    const { run } = setup(() =>
      jsonResponse({ error: "upstream_down", message: "Safe Browsing is down." }, 503),
    );
    const v = await run(PHISHING_URL);
    expect(v.partial).toBe(true);
    expect(v.missing).toEqual(["safebrowsing"]);
  });

  it("marks the verdict partial when the Worker can't be reached", async () => {
    const { run } = setup(() => Promise.reject(new TypeError("fetch failed")));
    const v = await run(PHISHING_URL);
    expect(v.missing).toEqual(["safebrowsing"]);
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
