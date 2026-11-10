import { SB_TEST_URLS, type Check } from "@sentry-ext/contracts";
import { parseUrl } from "@sentry-ext/url-parser";
import type { WorkerClient } from "./worker-client";

// Stand-in checks: fake versions that return hard-coded answers in the C1 shape,
// so the popup and pipeline work end to end before the real checks exist.
// Each one is replaced by the real check in Stage 2.

/** Pretends to be the lookalike check: flags a few known fake brand domains. */
export const standinLookalike: Check = {
  id: "lookalike",
  timeoutMs: 500,
  async check(url) {
    const started = Date.now();
    const fakes: Record<string, string> = {
      "paypa1.com": "paypal.com",
      "rnicrosoft.com": "microsoft.com",
    };
    const { domain } = parseUrl(url);
    const real = domain ? fakes[domain] : undefined;
    if (!real) {
      return {
        check: "lookalike",
        signal: "ok",
        points: 0,
        reason: null,
        ms: Date.now() - started,
      };
    }
    return {
      check: "lookalike",
      signal: "danger",
      points: 80,
      reason: `This domain looks like ${real} but isn't.`,
      evidence: { brand: real, edits: 1 },
      ms: Date.now() - started,
    };
  },
};

/** Pretends to be a URL red-flag check: raw IP addresses look suspicious. */
export const standinRedFlags: Check = {
  id: "red_flags",
  timeoutMs: 500,
  async check(url) {
    const started = Date.now();
    if (!parseUrl(url).isIp) {
      return {
        check: "red_flags",
        signal: "ok",
        points: 0,
        reason: null,
        ms: Date.now() - started,
      };
    }
    return {
      check: "red_flags",
      signal: "warn",
      points: 40,
      reason: "This page uses a bare number address instead of a name.",
      ms: Date.now() - started,
    };
  },
};

export const STANDIN_CHECKS: Check[] = [standinLookalike, standinRedFlags];

const SB_REASONS: Record<string, string> = {
  SOCIAL_ENGINEERING: "Google Safe Browsing lists this page as a phishing site.",
  MALWARE: "Google Safe Browsing lists this page as spreading malware.",
  UNWANTED_SOFTWARE: "Google Safe Browsing lists this page as pushing unwanted software.",
};

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * Pretends to be the Safe Browsing check (STY-108). Only Google's test pages are looked up,
 * through the real Worker round trip: 4-byte prefix out, full hashes back, compared on-device.
 * Every other URL is "ok" with no network call. STY-63 replaces this with real
 * canonicalisation and hashing of every URL.
 */
export function createStandinSafeBrowsing(worker: WorkerClient): Check {
  return {
    id: "safebrowsing",
    timeoutMs: 2000,
    async check(url) {
      const started = Date.now();
      const ok = {
        check: "safebrowsing" as const,
        signal: "ok" as const,
        points: 0,
        reason: null,
      };
      let expression: string;
      try {
        const u = new URL(url);
        expression = `${u.hostname.toLowerCase()}${u.pathname}`;
      } catch {
        return { ...ok, ms: Date.now() - started };
      }
      if (!SB_TEST_URLS.some((t) => t.expression === expression)) {
        return { ...ok, ms: Date.now() - started };
      }

      const full = await sha256(expression);
      const { fullHashes } = await worker.safeBrowsing([toBase64(full.slice(0, 4))]);
      const hit = fullHashes.find((h) => h.hash === toBase64(full));
      if (!hit) return { ...ok, ms: Date.now() - started };

      const threat = hit.threatTypes[0] ?? "SOCIAL_ENGINEERING";
      return {
        check: "safebrowsing",
        signal: "danger",
        points: 100,
        feedHit: true,
        reason: SB_REASONS[threat] ?? "Google Safe Browsing lists this page as unsafe.",
        evidence: { threatTypes: hit.threatTypes },
        source: "google",
        ms: Date.now() - started,
      };
    },
  };
}
