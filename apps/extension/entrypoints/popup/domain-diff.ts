// STY-FR-32: splits a checked domain into the part it shares with the brand it's
// imitating and the part that's tricky, so the popup can highlight the latter.
import type { CheckResult } from "@sentry-ext/contracts";

export type DomainSegment =
  | { type: "same"; text: string }
  | { type: "changed"; text: string }
  | { type: "missing"; letter: string };

/**
 * Peels the subdomain off `host`, leaving the registrable domain to diff against a brand.
 * Returns null when `registrableDomain` is empty or isn't actually a suffix of `host`,
 * so the caller can fall back to showing the host plain rather than diffing garbage.
 */
export function splitHost(
  host: string,
  registrableDomain: string,
): { subdomain: string; rest: string } | null {
  if (!registrableDomain) return null;
  if (host === registrableDomain) return { subdomain: "", rest: registrableDomain };
  if (host.endsWith(`.${registrableDomain}`)) {
    return {
      subdomain: host.slice(0, host.length - registrableDomain.length),
      rest: registrableDomain,
    };
  }
  return null;
}

/** Only a lookalike/homograph check that actually flagged something can drive a highlight. */
export function findBrandEvidence(checks: CheckResult[]): string | undefined {
  const flagged = checks.find(
    (c) =>
      (c.check === "lookalike" || c.check === "homograph") &&
      (c.signal === "danger" || c.signal === "warn") &&
      typeof c.evidence?.brand === "string",
  );
  return flagged?.evidence?.brand as string | undefined;
}

/**
 * Diffs `host` against `brand`, returning the parts that are the same, a substituted/
 * swapped-in run of characters ("changed"), or a single letter `brand` has that `host`
 * doesn't ("missing" — e.g. "microsft.com" vs "microsoft.com" is missing the "o").
 */
export function highlightDomain(host: string, brand: string): DomainSegment[] {
  const max = Math.min(host.length, brand.length);

  let prefixLen = 0;
  while (prefixLen < max && host[prefixLen] === brand[prefixLen]) prefixLen++;

  let suffixLen = 0;
  while (
    suffixLen < max - prefixLen &&
    host[host.length - 1 - suffixLen] === brand[brand.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = host.slice(0, prefixLen);
  const suffix = host.slice(host.length - suffixLen);
  const hostMid = host.slice(prefixLen, host.length - suffixLen);
  const brandMid = brand.slice(prefixLen, brand.length - suffixLen);

  const segments: DomainSegment[] = [];
  if (prefix) segments.push({ type: "same", text: prefix });
  if (hostMid) {
    segments.push({ type: "changed", text: hostMid });
  } else if (brandMid) {
    segments.push({ type: "missing", letter: brandMid });
  }
  if (suffix) segments.push({ type: "same", text: suffix });
  return segments;
}
