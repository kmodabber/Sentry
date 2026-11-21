// Lookalike domain check (STY-68, STY-FR-15).
//
// Flags a domain that's a small edit away from a brand's real domain: paypa1.com for
// paypal.com, rnicrosoft.com for microsoft.com. Edit distance is computed over the whole
// registrable domain, including the suffix, so a TLD swap counts too (tdcanadatrust.co is
// one edit from tdcanadatrust.com).
//
// "1 edit for short names" (STY-FR-15): a real domain SHORT_DOMAIN_LENGTH characters or
// fewer only allows 1 edit, not 2. At that length, allowing 2 edits would flag huge numbers
// of unrelated real sites — bmo.com and bmw.com are already 1 edit apart on their own, and a
// 2-edit radius around a 6-to-8-character domain catches far more collisions than a 2-edit
// radius around "microsoft.com" does. Longer domains allow 2, which is what catches
// rnicrosoft.com (2 edits from microsoft.com) and arnazon.com (2 edits from amazon.com).
//
// Never flags a brand's own real domain (TC-07), or anything in brands/safe-domains.txt: real
// domains the STY-67 review found sitting one edit from a protected brand (cbc.ca vs nbc.ca,
// ubs.com vs ups.com, bmw.com vs bmo.com) that a pure edit-distance rule can't tell apart on
// its own.

import type { Brand, Check } from "@sentry-ext/contracts";
import { parseUrl } from "@sentry-ext/url-parser";
import brandsJson from "../../../../brands/brands.json";
import safeDomainsRaw from "../../../../brands/safe-domains.txt?raw";

const BRANDS = brandsJson as Brand[];

/** Real domains this length or shorter only allow 1 edit, not 2. See file header. */
const SHORT_DOMAIN_LENGTH = 8;

function parseSafeDomains(raw: string): Set<string> {
  const domains = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => (line.split(",")[0] ?? "").toLowerCase());
  return new Set(domains);
}

export const SAFE_DOMAINS: ReadonlySet<string> = parseSafeDomains(safeDomainsRaw);

/** Levenshtein distance between two strings. */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(row[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost));
    }
    prev = row;
  }
  return prev[b.length]!;
}

export interface LookalikeMatch {
  /** The brand's real domain this candidate is a lookalike of, e.g. "paypal.com". */
  brandDomain: string;
  edits: number;
}

/**
 * The closest brand domain `candidate` is a lookalike of, within its allowed edit distance,
 * or null if it isn't one (including: it already is a real domain, or it's on the
 * safe-domains allowlist).
 */
export function findLookalike(
  candidate: string,
  brands: Brand[] = BRANDS,
  safeDomains: ReadonlySet<string> = SAFE_DOMAINS,
): LookalikeMatch | null {
  const domain = candidate.toLowerCase();
  if (safeDomains.has(domain)) return null;

  const realDomains = brands.flatMap((b) => b.domains.map((d) => d.toLowerCase()));
  if (realDomains.includes(domain)) return null;

  let best: LookalikeMatch | null = null;
  for (const real of realDomains) {
    const cap = real.length <= SHORT_DOMAIN_LENGTH ? 1 : 2;
    const edits = editDistance(domain, real);
    if (edits >= 1 && edits <= cap && (!best || edits < best.edits)) {
      best = { brandDomain: real, edits };
    }
  }
  return best;
}

/** The real lookalike check. Brand data and the safe-domains allowlist are loaded once. */
export function createLookalikeCheck(): Check {
  return {
    id: "lookalike",
    timeoutMs: 500,
    async check(url) {
      const started = Date.now();
      const base = { check: "lookalike" as const, ms: 0 };
      const { domain } = parseUrl(url);
      const match = domain ? findLookalike(domain) : null;
      if (!match) {
        return { ...base, signal: "ok", points: 0, reason: null, ms: Date.now() - started };
      }
      return {
        ...base,
        signal: "danger",
        points: 80,
        reason: `This looks like ${match.brandDomain} but it is not.`,
        evidence: { brand: match.brandDomain, edits: match.edits },
        ms: Date.now() - started,
      };
    },
  };
}
