// Real upstream calls (STY-FR-09, 10, 11). Keys come from Worker secrets and go in headers,
// never in a URL, so they can't leak through an error message or a redirect.
// Nothing in this file logs: a log line could carry a hostname or a hash.

import {
  HOST_CACHE_SECONDS,
  OPENPHISH_REFRESH_SECONDS,
  type HostResponse,
  type OpenPhishResponse,
  type SafeBrowsingResponse,
} from "@sentry-ext/contracts";
import { parse } from "tldts";
import { cached } from "./cache";

/** An upstream failed or isn't configured. The Worker answers 503 upstream_down. */
export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

const TIMEOUT_MS = 5000;
const CLIENT_ID = "phishclaw";
const CLIENT_VERSION = "0.0.1";

async function upstream(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    // Drop the original error: its message can contain the URL, and with it the hostname.
    throw new UpstreamError(`${what} didn't answer.`);
  }
}

// --- Google Safe Browsing v4 fullHashes:find -------------------------------------------

export const SB_ENDPOINT = "https://safebrowsing.googleapis.com/v4/fullHashes:find";
const SB_THREAT_TYPES = ["SOCIAL_ENGINEERING", "MALWARE", "UNWANTED_SOFTWARE"];
/** Used when Google leaves out cacheDuration. */
const SB_DEFAULT_CACHE_SECONDS = 300;

interface SbMatch {
  threatType: string;
  threat: { hash: string };
  /** e.g. "300s" or "300.500s" */
  cacheDuration?: string;
}

/**
 * Sends the prefixes on unchanged and returns every full hash Google lists under them.
 * The extension compares full hashes locally, so neither side learns the other's URL.
 */
export async function lookupSafeBrowsing(
  prefixes: string[],
  key: string | undefined,
  now = Date.now(),
): Promise<SafeBrowsingResponse> {
  if (!key) throw new UpstreamError("Safe Browsing isn't configured.");
  const res = await upstream(
    SB_ENDPOINT,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        client: { clientId: CLIENT_ID, clientVersion: CLIENT_VERSION },
        clientStates: [],
        threatInfo: {
          threatTypes: SB_THREAT_TYPES,
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: prefixes.map((hash) => ({ hash })),
        },
      }),
    },
    "Safe Browsing",
  );
  if (!res.ok) throw new UpstreamError(`Safe Browsing answered ${res.status}.`);
  const { matches = [] } = (await res.json()) as { matches?: SbMatch[] };

  // One entry per hash: Google repeats a hash once per threat type.
  const byHash = new Map<string, { threatTypes: Set<string>; expires: number }>();
  for (const m of matches) {
    const seconds = Number.parseFloat(m.cacheDuration ?? "") || SB_DEFAULT_CACHE_SECONDS;
    const expires = now + seconds * 1000;
    const entry = byHash.get(m.threat.hash);
    if (entry) {
      entry.threatTypes.add(m.threatType);
      entry.expires = Math.min(entry.expires, expires);
    } else {
      byHash.set(m.threat.hash, { threatTypes: new Set([m.threatType]), expires });
    }
  }
  return {
    fullHashes: [...byHash].map(([hash, { threatTypes, expires }]) => ({
      hash,
      threatTypes: [...threatTypes],
      expiresAt: new Date(expires).toISOString(),
    })),
  };
}

// --- URLhaus + RDAP -------------------------------------------------------------------

export const URLHAUS_ENDPOINT = "https://urlhaus-api.abuse.ch/v1/host/";
export const RDAP_ENDPOINT = "https://rdap.org/domain/";
/** RDAP failures are retried sooner than a full answer. */
const RDAP_DOWN_CACHE_SECONDS = 60 * 60;

interface UrlhausHost {
  query_status: string;
  url_count?: string | number;
  urls?: { threat?: string }[];
}

/** Null when not listed. Throws when URLhaus can't answer: "unknown" must never read as clean. */
export async function lookupUrlhaus(
  hostname: string,
  key: string | undefined,
): Promise<HostResponse["urlhaus"]> {
  if (!key) throw new UpstreamError("URLhaus isn't configured.");
  const res = await upstream(
    URLHAUS_ENDPOINT,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "auth-key": key },
      body: new URLSearchParams({ host: hostname }).toString(),
    },
    "URLhaus",
  );
  if (!res.ok) throw new UpstreamError(`URLhaus answered ${res.status}.`);
  const body = (await res.json()) as UrlhausHost;
  if (body.query_status === "no_results" || body.query_status === "invalid_host") return null;
  if (body.query_status !== "ok") throw new UpstreamError("URLhaus refused the lookup.");

  const counts = new Map<string, number>();
  for (const { threat } of body.urls ?? []) {
    if (threat) counts.set(threat, (counts.get(threat) ?? 0) + 1);
  }
  const threat = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "malware_download";
  return { threat, urlCount: Number(body.url_count ?? body.urls?.length ?? 0) };
}

interface RdapDomain {
  events?: { eventAction?: string; eventDate?: string }[];
}

/**
 * Registration date of the registrable domain (RDAP knows "paypa1.com", not
 * "login.paypa1.com"). `rdap: false` when RDAP couldn't answer or the host has no domain.
 */
export async function lookupRdap(
  hostname: string,
): Promise<Pick<HostResponse, "registeredAt" | "rdap">> {
  const unknown = { registeredAt: null, rdap: false };
  const info = parse(hostname.replace(/^\[|\]$/g, ""));
  if (info.isIp || !info.domain) return unknown;

  let res: Response;
  try {
    res = await upstream(
      `${RDAP_ENDPOINT}${encodeURIComponent(info.domain)}`,
      { headers: { accept: "application/rdap+json" } },
      "RDAP",
    );
  } catch {
    return unknown;
  }
  // 404: RDAP answered and has no record. Unknown date, but RDAP did answer.
  if (res.status === 404) return { registeredAt: null, rdap: true };
  if (!res.ok) return unknown;

  const body = (await res.json().catch(() => null)) as RdapDomain | null;
  if (!body) return unknown;
  const date = body.events?.find((e) => e.eventAction === "registration")?.eventDate;
  const ms = date ? Date.parse(date) : Number.NaN;
  return { registeredAt: Number.isNaN(ms) ? null : new Date(ms).toISOString(), rdap: true };
}

/** URLhaus and RDAP in parallel, cached per hostname for HOST_CACHE_SECONDS. */
export function lookupHost(
  hostname: string,
  urlhausKey: string | undefined,
): Promise<HostResponse> {
  const host = hostname.toLowerCase();
  return cached(`host:${host}`, async () => {
    const [urlhaus, rdap] = await Promise.all([lookupUrlhaus(host, urlhausKey), lookupRdap(host)]);
    return {
      value: { urlhaus, ...rdap },
      ttlSeconds: rdap.rdap ? HOST_CACHE_SECONDS : RDAP_DOWN_CACHE_SECONDS,
    };
  });
}

// --- OpenPhish community feed ---------------------------------------------------------

/** The same public feed the ML collector reads (STY-113). */
export const OPENPHISH_FEED =
  "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt";

/** The feed as typed text, refreshed every OPENPHISH_REFRESH_SECONDS. Never opened. */
export function fetchOpenPhish(now = Date.now()): Promise<OpenPhishResponse> {
  return cached("feed:openphish", async () => {
    const res = await upstream(OPENPHISH_FEED, {}, "OpenPhish");
    if (!res.ok) throw new UpstreamError(`OpenPhish answered ${res.status}.`);
    const urls = (await res.text())
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line));
    if (urls.length === 0) throw new UpstreamError("OpenPhish sent an empty feed.");
    return {
      value: { updatedAt: new Date(now).toISOString(), urls },
      ttlSeconds: OPENPHISH_REFRESH_SECONDS,
    };
  });
}
