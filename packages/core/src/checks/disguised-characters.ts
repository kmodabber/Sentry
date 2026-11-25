// Disguised characters check (STY-69, STY-FR-16).
//
// Flags a punycode-encoded domain whose Unicode form, once Unicode confusables are
// normalised (UTS #39, via the unicode-confusables package), exactly matches a brand's real
// domain: pаypal.com (Cyrillic а) decodes to that Unicode text, normalises to the same
// skeleton as paypal.com, and is flagged showing both the real-looking name and the actual
// (disguised) characters, per FR-16's acceptance criteria.
//
// isPunycode gates this: only a hostname that actually used IDN/punycode encoding (contains
// real non-ASCII characters) reaches the comparison. A pure-ASCII same-script trick — rn for
// m in rnicrosoft.com, no disguise involved — never reaches here; the rectifier would treat
// even the real paypal.com as "confusing" on its own (m/rn visual ambiguity isn't limited to
// non-Latin scripts), so without the isPunycode gate a plain ASCII domain could wrongly reach
// the comparison. That pattern is FR-15's job (STY-68), already caught there as an edit-
// distance lookalike.

import type { Brand, Check } from "@sentry-ext/contracts";
import { parseUrl } from "@sentry-ext/url-parser";
import { rectifyConfusion } from "unicode-confusables";
import brandsJson from "../../../../brands/brands.json";

const BRANDS = brandsJson as Brand[];

export interface HomographMatch {
  /** The brand's real domain this is a disguised-character match for, e.g. "paypal.com". */
  brandDomain: string;
}

/**
 * The brand domain `hostnameUnicode` spells using disguised characters, or null. Only
 * meaningful for a hostname that actually used punycode (see file header) — callers must
 * check `isPunycode` themselves before calling this.
 */
export function findHomograph(
  hostnameUnicode: string,
  brands: Brand[] = BRANDS,
): HomographMatch | null {
  const skeleton = rectifyConfusion(hostnameUnicode.toLowerCase());
  for (const brand of brands) {
    for (const real of brand.domains) {
      if (rectifyConfusion(real.toLowerCase()) === skeleton) {
        return { brandDomain: real.toLowerCase() };
      }
    }
  }
  return null;
}

/** The real disguised-characters check. */
export function createDisguisedCharactersCheck(): Check {
  return {
    id: "homograph",
    timeoutMs: 500,
    async check(url) {
      const started = Date.now();
      const base = { check: "homograph" as const, ms: 0 };
      const parsed = parseUrl(url);
      const match = parsed.isPunycode ? findHomograph(parsed.hostnameUnicode) : null;
      if (!match) {
        return { ...base, signal: "ok", points: 0, reason: null, ms: Date.now() - started };
      }
      return {
        ...base,
        signal: "danger",
        points: 80,
        reason: `This looks like ${match.brandDomain}, spelled with disguised letters (${parsed.hostnameUnicode}).`,
        evidence: { brand: match.brandDomain },
        ms: Date.now() - started,
      };
    },
  };
}
