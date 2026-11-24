/**
 * FR-24 shared feature extractor (STY-77). Owner: Ethan Rajack.
 *
 * Computes the C5 features (spec.ts) for one URL. The extension calls this at check time and
 * the Node export script (scripts/export-features.ts) calls the same function for training,
 * so the two can never drift apart. Python never re-implements a feature (doc 02, section 5).
 *
 * Every definition below follows spec.ts exactly; if you change one, change the spec, its
 * hash and the tests in the same PR.
 */
import { parseUrl } from "@sentry-ext/url-parser";
import {
  FEATURE_NAMES,
  PHISHING_WORDS,
  RISKY_FILE_TYPES,
  SPECIAL_CHARS,
  prepareUrl,
  stripIpv6Brackets,
} from "./spec";

/** Everything a feature needs, worked out once per URL. */
interface FeatureInput {
  /** prepareUrl(raw): normalised href cut to 1,000 code points. */
  input: string;
  /** Host from parseUrl, lower-cased, no port, IPv6 brackets removed. */
  host: string;
  /** parseUrl's path ("/" at least for http and https). */
  path: string;
  /** Query without the leading "?"; "" when there is none. */
  query: string;
  subdomain: string | null;
  isIp: boolean;
  isPunycode: boolean;
  port: number | null;
  protocol: string;
}

const codePoints = (s: string): number => Array.from(s).length;
const countChars = (s: string, set: string): number =>
  Array.from(s).filter((c) => set.includes(c)).length;

function shannonEntropy(s: string): number {
  const chars = Array.from(s);
  if (chars.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const c of chars) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / chars.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const FEATURE_FNS: Record<string, (f: FeatureInput) => number> = {
  url_length: (f) => codePoints(f.input),
  host_length: (f) => codePoints(f.host),
  path_length: (f) => codePoints(f.path),
  query_length: (f) => codePoints(f.query),
  host_dots: (f) => countChars(f.host, "."),
  host_hyphens: (f) => countChars(f.host, "-"),
  url_digits: (f) => countChars(f.input, "0123456789"),
  url_digit_ratio: (f) => {
    const len = codePoints(f.input);
    return len === 0 ? 0 : countChars(f.input, "0123456789") / len;
  },
  special_chars: (f) => countChars(f.input, SPECIAL_CHARS),
  subdomain_depth: (f) => (f.isIp || !f.subdomain ? 0 : f.subdomain.split(".").length),
  host_entropy: (f) => shannonEntropy(f.host.replaceAll(".", "")),
  is_ip_host: (f) => (f.isIp ? 1 : 0),
  has_punycode: (f) => (f.isPunycode ? 1 : 0),
  has_at_sign: (f) => (f.input.includes("@") ? 1 : 0),
  has_port: (f) => (f.port !== null ? 1 : 0),
  no_https: (f) => (f.protocol === "https:" ? 0 : 1),
  path_depth: (f) => f.path.split("/").filter(Boolean).length,
  query_params: (f) => (f.query ? f.query.split("&").filter(Boolean).length : 0),
  phishing_words: (f) => {
    // Host, path and query are searched one at a time, so no word is made across a boundary.
    const parts = [f.host, f.path, f.query].map((p) => p.toLowerCase());
    return PHISHING_WORDS.filter((w) => parts.some((p) => p.includes(w))).length;
  },
  risky_file_type: (f) => {
    const last = (f.path.split("/").at(-1) ?? "").toLowerCase();
    return RISKY_FILE_TYPES.some((ext) => last.endsWith(`.${ext}`)) ? 1 : 0;
  },
};

/** Work out host, path and query from the cut input. Null if it won't parse. */
function toFeatureInput(raw: string): FeatureInput | null {
  const input = prepareUrl(raw);
  if (input === null) return null;
  try {
    const parsed = parseUrl(input);
    const host = stripIpv6Brackets(parsed.hostname);
    return {
      input,
      host,
      path: parsed.path,
      query: new URL(input).search.replace(/^\?/, ""),
      subdomain: parsed.subdomain,
      // tldts may not flag a bracketed IPv6 host, so a ":" in the host also counts.
      isIp: parsed.isIp || host.includes(":"),
      isPunycode: parsed.isPunycode,
      port: parsed.port,
      protocol: parsed.protocol,
    };
  } catch {
    return null; // the 1,000 cut can, very rarely, leave a URL that no longer parses
  }
}

/**
 * The C5 feature vector for one URL: one number per feature, in FEATURE_NAMES order.
 * Returns null when the URL won't parse or isn't http/https (C5: no features for it).
 */
export function extractFeatures(raw: string): number[] | null {
  const f = toFeatureInput(raw);
  if (f === null) return null;
  return FEATURE_NAMES.map((name) => {
    const fn = FEATURE_FNS[name];
    if (!fn) throw new Error(`No implementation for feature ${name}`);
    return fn(f);
  });
}

/** Same as extractFeatures, keyed by feature name. Handy for tests and debugging. */
export function extractFeatureMap(raw: string): Record<string, number> | null {
  const vector = extractFeatures(raw);
  if (vector === null) return null;
  return Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, vector[i] ?? NaN]));
}

/** Names of every feature that has an implementation (used by a test). */
export const IMPLEMENTED_FEATURES: readonly string[] = Object.keys(FEATURE_FNS);
