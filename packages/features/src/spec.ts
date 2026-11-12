/**
 * C5 feature spec (STY-112). Owners: Ethan Rajack and Mo.
 *
 * The ordered list of URL features the model reads. The extension (at check time) and the
 * Node export script (for training) both compute features in exactly this order, so
 * training and the browser cannot drift apart (doc 02, section 5).
 *
 * Rules:
 * - Order is part of the contract. Add, remove, rename or reorder only via a decision in
 *   docs/decisions.md, then update SPEC_HASH (the spec test tells you the new value).
 * - Every feature is a number. Flags are 0 or 1, and 1 always means "more suspicious".
 * - `reason` is the popup sentence shown when this feature pushes the score up. Plain words,
 *   no jargon, never "safe" (popup wording guide). Wording is NOT part of the fingerprint,
 *   so it can be improved without retraining.
 *
 * v0: the 20 URL-only features for the Stage 2 baseline. Features that need lookup lists
 * (shorteners, free hosting, brand names, abused TLDs) are added in Stage 3.
 */

export type FeatureKind = "length" | "count" | "ratio" | "score" | "flag";

export interface FeatureSpec {
  /** snake_case, unique. */
  name: string;
  kind: FeatureKind;
  /** Values above this are clamped to it (lengths only). */
  cap?: number;
  /** Exact definition, so every implementation computes the same number. */
  definition: string;
  /** Plain-language popup sentence. */
  reason: string;
}

/** Words counted by `phishing_words` (doc 02, section 5). */
export const PHISHING_WORDS = [
  "login",
  "verify",
  "secure",
  "account",
  "update",
  "etransfer",
  "refund",
] as const;

/** File extensions counted by `risky_file_type`. */
export const RISKY_FILE_TYPES = [
  "exe",
  "msi",
  "apk",
  "dmg",
  "pkg",
  "scr",
  "bat",
  "cmd",
  "zip",
  "rar",
] as const;

/** Characters counted by `special_chars`. */
export const SPECIAL_CHARS = "@~%_=&!*+$,;|";

export const FEATURES: readonly FeatureSpec[] = [
  {
    name: "url_length",
    kind: "length",
    cap: 1000,
    definition:
      "Characters in the full URL as given. Capped at 1,000 because PhreshPhish benign URLs are cut at exactly 1,000 (STY-100).",
    reason: "The address is unusually long.",
  },
  {
    name: "host_length",
    kind: "length",
    definition: "Characters in the host name, without the port.",
    reason: "The site name is unusually long.",
  },
  {
    name: "path_length",
    kind: "length",
    definition:
      "Characters in the path (URL.pathname), from the first '/' after the host up to '?' or '#'. A bare '/' counts as 1; no path counts as 0.",
    reason: "The part after the site name is unusually long.",
  },
  {
    name: "query_length",
    kind: "length",
    definition: "Characters after '?' up to '#', not counting the '?'. 0 if there is no query.",
    reason: "The address carries a lot of extra data.",
  },
  {
    name: "host_dots",
    kind: "count",
    definition: "Number of '.' characters in the host name.",
    reason: "The site name has many dots in it.",
  },
  {
    name: "host_hyphens",
    kind: "count",
    definition: "Number of '-' characters in the host name.",
    reason: "The site name has many hyphens in it.",
  },
  {
    name: "url_digits",
    kind: "count",
    definition: "Number of characters 0-9 in the full URL (not capped).",
    reason: "The address has a lot of numbers in it.",
  },
  {
    name: "url_digit_ratio",
    kind: "ratio",
    definition:
      "url_digits divided by the full URL length before capping. 0 for an empty URL. Between 0 and 1.",
    reason: "Much of the address is numbers.",
  },
  {
    name: "special_chars",
    kind: "count",
    definition: "Number of characters in the full URL that are in SPECIAL_CHARS (@~%_=&!*+$,;|).",
    reason: "The address has many unusual symbols.",
  },
  {
    name: "subdomain_depth",
    kind: "count",
    definition:
      "Number of host labels before the registrable domain, using the shared URL parser (tldts). 'www' counts. 0 for an IP host or when there is no subdomain.",
    reason: "The real site name is hidden behind several layers.",
  },
  {
    name: "host_entropy",
    kind: "score",
    definition:
      "Shannon entropy in bits per character of the host name with dots removed, lower-cased. 0 for an empty host.",
    reason: "The site name looks like random letters.",
  },
  {
    name: "is_ip_host",
    kind: "flag",
    definition:
      "1 if the host is an IPv4 or IPv6 address, else 0. Note: PhreshPhish has no benign IP hosts (STY-100), so this will weigh heavily.",
    reason: "The address uses a number instead of a site name.",
  },
  {
    name: "has_punycode",
    kind: "flag",
    definition: "1 if any host label starts with 'xn--', else 0.",
    reason: "The site name uses letters from other alphabets that can look like normal ones.",
  },
  {
    name: "has_at_sign",
    kind: "flag",
    definition: "1 if '@' appears anywhere in the URL, else 0.",
    reason: "The address contains an @ sign, which can hide the real site.",
  },
  {
    name: "has_port",
    kind: "flag",
    definition: "1 if the URL names a port that is not the default for its scheme, else 0.",
    reason: "The address uses an unusual connection port.",
  },
  {
    name: "no_https",
    kind: "flag",
    definition: "1 if the scheme is not https, else 0.",
    reason: "The connection to this site is not encrypted.",
  },
  {
    name: "path_depth",
    kind: "count",
    definition: "Number of non-empty segments in the path, split on '/'.",
    reason: "The address goes through many folders.",
  },
  {
    name: "query_params",
    kind: "count",
    definition: "Number of non-empty parts of the query split on '&'. 0 if there is no query.",
    reason: "The address has many extra settings attached.",
  },
  {
    name: "phishing_words",
    kind: "count",
    definition:
      "Number of distinct words from PHISHING_WORDS that appear in the lower-cased host, path and query.",
    reason: "The address uses words that scams often use, like 'login' or 'verify'.",
  },
  {
    name: "risky_file_type",
    kind: "flag",
    definition:
      "1 if the path's last segment ends in '.' plus one of RISKY_FILE_TYPES (case-insensitive), else 0.",
    reason: "The address points to a file that could install something on your device.",
  },
] as const;

export const FEATURE_NAMES: readonly string[] = FEATURES.map((f) => f.name);

/**
 * The exact text that is hashed: one JSON array per feature, in order, holding only what
 * changes the numbers (name, kind, cap). Wording and definitions are not included.
 */
export function canonicalSpec(features: readonly FeatureSpec[] = FEATURES): string {
  return features.map((f) => JSON.stringify([f.name, f.kind, f.cap ?? null])).join("\n");
}

/** SHA-256 (hex) of canonicalSpec(). Works in the browser and in Node 20+. */
export async function computeSpecHash(
  features: readonly FeatureSpec[] = FEATURES,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSpec(features));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The fingerprint of FEATURES. Kept as a constant so the extension can check a model
 * without hashing at load time. The spec test fails if it no longer matches FEATURES.
 */
export const SPEC_HASH = "ca67eece63e9cf0446e1083662f7aacb7d1689597d57165e95c4643b3544c9d5";

/** Throws if a model was trained on a different feature list (doc 05, C5). */
export function assertModelMatchesSpec(model: { specHash: string }): void {
  if (model.specHash !== SPEC_HASH) {
    throw new Error(
      `Model specHash ${model.specHash} does not match the feature spec ${SPEC_HASH}. ` +
        "Retrain the model on the current features.",
    );
  }
}
