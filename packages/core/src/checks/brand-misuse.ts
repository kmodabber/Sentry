// Brand in the wrong place check (STY-70, STY-FR-17).
//
// Flags a brand keyword appearing as a whole word in the subdomain, the registrable domain's
// own label, or the path, while the page isn't actually on any of our tracked real domains.
// Whole-word matching (matchesBrandKeyword, STY-67) catches both shapes the same way:
// interac.etransfer-refund.com (keyword in the subdomain) and interac-etransfer.com (keyword
// hyphenated into the domain's own label) both split into an "interac" token.
//
// Never flags any of our tracked real domains (not just the brand whose keyword matched) —
// visiting a genuine microsoft.com page never gets checked against paypal's keywords either.
// A keyword still catches an unrelated real site that happens to mention a brand name
// (a news article about a PayPal scam, say); that residual risk is accepted here the same way
// doc 02's known-sites cap (FR-19, not built yet) is meant to handle it project-wide, which is
// why this is "warn" and moderate points, not "danger" — a brand mention alone isn't proof.

import type { Brand, Check, ParsedUrl } from "@sentry-ext/contracts";
import { matchesBrandKeyword } from "@sentry-ext/contracts";
import { parseUrl } from "@sentry-ext/url-parser";
import brandsJson from "../../../../brands/brands.json";

const BRANDS = brandsJson as Brand[];

export interface BrandMisuseMatch {
  brand: Brand;
  /** Which part of the URL the keyword was found in. */
  where: "subdomain" | "domain" | "path";
}

/**
 * The brand whose keyword `parsed` mentions outside its own real domain, or null. `parsed`
 * only needs subdomain, domain and path — the full ParsedUrl works too.
 */
export function findBrandMisuse(
  parsed: Pick<ParsedUrl, "subdomain" | "domain" | "path">,
  brands: Brand[] = BRANDS,
): BrandMisuseMatch | null {
  const { subdomain, domain, path } = parsed;
  const realDomains = new Set(brands.flatMap((b) => b.domains.map((d) => d.toLowerCase())));
  if (domain && realDomains.has(domain.toLowerCase())) return null;

  const parts: { where: BrandMisuseMatch["where"]; text: string }[] = [
    ...(subdomain ? [{ where: "subdomain" as const, text: subdomain }] : []),
    ...(domain ? [{ where: "domain" as const, text: domain }] : []),
    { where: "path" as const, text: path },
  ];

  for (const brand of brands) {
    for (const keyword of brand.keywords) {
      const hit = parts.find((part) => matchesBrandKeyword(part.text, keyword));
      if (hit) return { brand, where: hit.where };
    }
  }
  return null;
}

/** The real brand-in-the-wrong-place check. */
export function createBrandMisuseCheck(): Check {
  return {
    id: "brand_misuse",
    timeoutMs: 500,
    async check(url) {
      const started = Date.now();
      const base = { check: "brand_misuse" as const, ms: 0 };
      const parsed = parseUrl(url);
      const match = findBrandMisuse(parsed);
      if (!match) {
        return { ...base, signal: "ok", points: 0, reason: null, ms: Date.now() - started };
      }
      return {
        ...base,
        signal: "warn",
        points: 50,
        reason: `It mentions ${match.brand.name}, but the site is ${parsed.domain ?? parsed.hostname}.`,
        evidence: { brand: match.brand.domains[0]! },
        ms: Date.now() - started,
      };
    },
  };
}
