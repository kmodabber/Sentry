// STY-71 (STY-FR-18): URL red flags. Pure and synchronous inside its async wrapper -- no
// network calls, reuses the parser's own output rather than re-deriving anything from the
// raw string. Weights live in scoring.json's "red_flags" section and are PLACEHOLDERS until
// Brandon tunes them on test-set data in Stage 3 (STY-FR-23) -- see docs/decisions.md.
import type { Check, CheckResult } from "@sentry-ext/contracts";
import { parseUrl } from "@sentry-ext/url-parser";
import scoring from "../scoring.json";
import { ABUSED_TLDS, HOSTING_PLATFORMS, SHORTENERS } from "../lists";

export type RedFlagId =
  | "ip_host"
  | "at_symbol"
  | "deep_subdomains"
  | "long_url"
  | "abused_tld"
  | "shortener"
  | "free_hosting";

export interface RedFlagHit {
  id: RedFlagId;
  points: number;
  reason: string;
}

const WEIGHTS: Record<RedFlagId, number> = scoring.red_flags;

/** Over this many characters in the normalised URL counts as "long" (TC-08). */
const MAX_URL_LENGTH = 100;
/** More than this many dot-separated subdomain labels counts as "deep" (TC-08). */
const MAX_SUBDOMAIN_LEVELS = 3;

/** True if `hostname` is exactly `entry` or ends in it as a real label boundary ("."entry). */
function hostMatches(hostname: string, entry: string): boolean {
  return hostname === entry || hostname.endsWith(`.${entry}`);
}

/**
 * Finds every red flag in `url` from its already-parsed fields. Exported separately from the
 * `Check` so the logic (and its ordering/weighting) is directly unit-testable.
 */
export function findRedFlags(url: string): RedFlagHit[] {
  const parsed = parseUrl(url);
  const hits: RedFlagHit[] = [];

  if (parsed.isIp) {
    hits.push({
      id: "ip_host",
      points: WEIGHTS.ip_host,
      reason:
        "This link uses a number address instead of a website name, which real sites rarely do.",
    });
  }

  // Checked on the raw input, not parsed.userInfo: the parser drops "@" from userInfo
  // whenever it's empty ("http://@evil.com/") or the "@" is actually in the path
  // ("http://evil.com/x@paypal.com"), but either placement is still the same trick.
  if (url.includes("@")) {
    hits.push({
      id: "at_symbol",
      points: WEIGHTS.at_symbol,
      reason: "This link contains an @, which can hide where it really goes.",
    });
  }

  // "www" counts as a level like any other label -- simplest rule, no special-casing it.
  const subdomainLevels = parsed.subdomain ? parsed.subdomain.split(".").length : 0;
  if (subdomainLevels > MAX_SUBDOMAIN_LEVELS) {
    hits.push({
      id: "deep_subdomains",
      points: WEIGHTS.deep_subdomains,
      reason: "This address has an unusual number of parts before the real site name.",
    });
  }

  if (parsed.href.length > MAX_URL_LENGTH) {
    hits.push({
      id: "long_url",
      points: WEIGHTS.long_url,
      reason: "This link is unusually long, a trick used to hide the real address.",
    });
  }

  // Compare only the last label ("ml" out of "com.ml"), so a multi-part suffix built on
  // an abused TLD (evil.com.ml) is caught the same way the bare TLD (evil.ml) is.
  const tldLastLabel = parsed.publicSuffix ? parsed.publicSuffix.split(".").pop() : undefined;
  if (tldLastLabel && ABUSED_TLDS.has(tldLastLabel)) {
    hits.push({
      id: "abused_tld",
      points: WEIGHTS.abused_tld,
      reason: `This site's ending (.${parsed.publicSuffix}) is often used by scam sites.`,
    });
  }

  if (parsed.domain && SHORTENERS.has(parsed.domain)) {
    hits.push({
      id: "shortener",
      points: WEIGHTS.shortener,
      reason: "This link is shortened, so we cannot see where it goes.",
    });
  }

  if (HOSTING_PLATFORMS.some((entry) => hostMatches(parsed.hostname, entry))) {
    hits.push({
      id: "free_hosting",
      points: WEIGHTS.free_hosting,
      reason: "This page is on a free hosting site where anyone can make a page.",
    });
  }

  return hits.sort((a, b) => b.points - a.points);
}

/**
 * Sums every hit's points, capped at 100. Several flags can never coexist on one real URL
 * (e.g. ip_host leaves domain/publicSuffix null, so shortener/abused_tld can't also fire) --
 * kept separate from findRedFlags so the cap itself can be tested against fabricated hits.
 */
export function sumRedFlagPoints(hits: readonly RedFlagHit[]): number {
  return Math.min(
    100,
    hits.reduce((sum, hit) => sum + hit.points, 0),
  );
}

export const redFlagsCheck: Check = {
  id: "red_flags",
  timeoutMs: 500,
  async check(url): Promise<CheckResult> {
    const hits = findRedFlags(url);
    const points = sumRedFlagPoints(hits);
    return {
      check: "red_flags",
      signal: hits.length > 0 ? "warn" : "ok",
      points,
      reason: hits[0]?.reason ?? null,
      ...(hits.length > 0 && { evidence: { flags: hits } }),
      ms: 0,
    };
  },
};
