// Fake upstreams for local development (STY-108). Fixed answers in the C3 shapes, so the
// extension can be built before the real Safe Browsing, URLhaus, RDAP and OpenPhish calls exist.
// On only when FAKE_UPSTREAMS is exactly "true" (pnpm worker:fake). Never set in production.

import {
  SB_TEST_URLS,
  type HostResponse,
  type OpenPhishResponse,
  type SafeBrowsingResponse,
} from "@sentry-ext/contracts";

/** How long a fake Safe Browsing answer may be cached. */
const SB_CACHE_SECONDS = 5 * 60;

interface ListedHash {
  bytes: Uint8Array;
  base64: string;
  threatType: string;
}

let listed: Promise<ListedHash[]> | undefined;

/** Hashes Google's test expressions once, the way Safe Browsing does: SHA-256 of the expression. */
function listedHashes(): Promise<ListedHash[]> {
  listed ??= Promise.all(
    SB_TEST_URLS.map(async ({ expression, threatType }) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expression));
      const bytes = new Uint8Array(digest);
      return { bytes, base64: btoa(String.fromCharCode(...bytes)), threatType };
    }),
  );
  return listed;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function startsWith(hash: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.length <= hash.length && prefix.every((b, i) => hash[i] === b);
}

/** Like Google: returns only the full hashes that start with one of the prefixes sent. */
export async function fakeSafeBrowsing(
  prefixes: string[],
  now = Date.now(),
): Promise<SafeBrowsingResponse> {
  const sent = prefixes.map(decodeBase64);
  const expiresAt = new Date(now + SB_CACHE_SECONDS * 1000).toISOString();
  const hashes = await listedHashes();
  return {
    fullHashes: hashes
      .filter((h) => sent.some((p) => startsWith(h.bytes, p)))
      .map((h) => ({ hash: h.base64, threatTypes: [h.threatType], expiresAt })),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Made-up .test hosts, one per case the popup has to handle. Any other host is clean.
 * "upstream_down" makes the Worker answer 503, so the partial-verdict path can be built.
 */
export function fakeHost(hostname: string, now = Date.now()): HostResponse | "upstream_down" {
  switch (hostname.toLowerCase()) {
    case "urlhaus.phishclaw.test":
      return {
        urlhaus: { threat: "malware_download", urlCount: 3 },
        registeredAt: "2024-03-01T00:00:00Z",
        rdap: true,
      };
    case "new.phishclaw.test":
      return { urlhaus: null, registeredAt: new Date(now - 3 * DAY_MS).toISOString(), rdap: true };
    case "rdap-down.phishclaw.test":
      return { urlhaus: null, registeredAt: null, rdap: false };
    case "down.phishclaw.test":
      return "upstream_down";
    default:
      return { urlhaus: null, registeredAt: "2010-01-01T00:00:00Z", rdap: true };
  }
}

/** Typed-only URLs: never visit them. */
export const FAKE_OPENPHISH: OpenPhishResponse = {
  updatedAt: "2026-11-09T00:00:00Z",
  urls: ["http://paypa1.com/login", "https://phish.phishclaw.test/signin"],
};
