/**
 * C5 feature spec (STY-112). Owners: Ethan Rajack and Mo.
 *
 * The ordered list of URL features the model reads. The extension (at check time) and the
 * Node export script (for training) both compute features in exactly this order, so
 * training and the browser cannot drift apart (doc 02, section 5).
 *
 * Input (applies to every feature):
 * - The input is the raw URL string as received (not URL.href or any normalised form),
 *   cut to its first MAX_URL_LENGTH (1,000) characters with prepareUrl() BEFORE any feature
 *   is computed. PhreshPhish benign URLs are cut at exactly 1,000 (STY-100), so cutting
 *   everything the same way stops the cut-off leaking through any feature.
 * - "Characters" means Unicode code points (Python len(); Array.from(s).length in JS).
 * - Host, path and query come from parseUrl() in @sentry-ext/url-parser, run on the cut input.
 *   The host is lower-cased, without the port and without IPv6 brackets.
 *
 * Rules:
 * - Order is part of the contract. Add, remove, rename or reorder only via a decision in
 *   docs/decisions.md, then update SPEC_HASH (the spec test tells you the new value).
 * - The word, file-type and symbol lists below are part of the fingerprint too.
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

/** Every URL is cut to this many characters before any feature is computed. */
export const MAX_URL_LENGTH = 1000;

/** The feature input: the raw URL cut to MAX_URL_LENGTH code points. */
export function prepareUrl(raw: string): string {
  const chars = Array.from(raw);
  return chars.length <= MAX_URL_LENGTH ? raw : chars.slice(0, MAX_URL_LENGTH).join("");
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
    definition: "Characters in the input (the raw URL after prepareUrl), so at most 1,000.",
    reason: "The address is unusually long.",
  },
  {
    name: "host_length",
    kind: "length",
    definition:
      "Characters in the host from parseUrl, lower-cased, without the port or IPv6 brackets.",
    reason: "The site name is unusually long.",
  },
  {
    name: "path_length",
    kind: "length",
    definition:
      "Characters in the path from parseUrl: from the first '/' after the host up to '?' or '#'. A bare '/' counts as 1; no path counts as 0.",
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
    definition: "Number of characters 0-9 in the input.",
    reason: "The address has a lot of numbers in it.",
  },
  {
    name: "url_digit_ratio",
    kind: "ratio",
    definition: "url_digits divided by url_length. 0 for an empty input. Between 0 and 1.",
    reason: "Much of the address is numbers.",
  },
  {
    name: "special_chars",
    kind: "count",
    definition: "Number of characters in the input that are in SPECIAL_CHARS (@~%_=&!*+$,;|).",
    reason: "The address has many unusual symbols.",
  },
  {
    name: "subdomain_depth",
    kind: "count",
    definition:
      "Number of dot-separated labels in the subdomain that parseUrl returns ('www' counts). 0 for an IP host or when there is no subdomain.",
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
      "1 if the host is an IPv4 or IPv6 address, else 0. PhreshPhish has no benign IP hosts (STY-100), so this will weigh heavily: STY-115 reports results with and without it.",
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
    definition: "1 if '@' appears anywhere in the input, else 0.",
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
      "Number of distinct words from PHISHING_WORDS that appear as a substring of the lower-cased host + path + query (so 'mylogin' and 'logins' both count 'login'). 0 to 7.",
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

/** The lookup values that change feature numbers; all are part of the fingerprint. */
export const SPEC_LISTS = {
  maxUrlLength: MAX_URL_LENGTH,
  phishingWords: PHISHING_WORDS,
  riskyFileTypes: RISKY_FILE_TYPES,
  specialChars: SPECIAL_CHARS,
};

export type SpecLists = {
  maxUrlLength: number;
  phishingWords: readonly string[];
  riskyFileTypes: readonly string[];
  specialChars: string;
};

/**
 * The exact text that is hashed, one compact JSON array per line:
 *   ["max_url_length",1000]
 *   ["phishing_words",["login",...]]
 *   ["risky_file_types",["exe",...]]
 *   ["special_chars","@~%_=&!*+$,;|"]
 * then one line per feature, in order: [name, kind, cap or null].
 * Wording and definitions are not included, so popup text can change without retraining.
 * Python reproduces it with json.dumps(row, separators=(",", ":"), ensure_ascii=False).
 */
export function canonicalSpec(
  features: readonly FeatureSpec[] = FEATURES,
  lists: SpecLists = SPEC_LISTS,
): string {
  const rows: unknown[] = [
    ["max_url_length", lists.maxUrlLength],
    ["phishing_words", lists.phishingWords],
    ["risky_file_types", lists.riskyFileTypes],
    ["special_chars", lists.specialChars],
    ...features.map((f) => [f.name, f.kind, f.cap ?? null]),
  ];
  return rows.map((r) => JSON.stringify(r)).join("\n");
}

/** SHA-256 (hex) of canonicalSpec(). Works in the browser and in Node 20+. */
export async function computeSpecHash(
  features: readonly FeatureSpec[] = FEATURES,
  lists: SpecLists = SPEC_LISTS,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSpec(features, lists));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The fingerprint of FEATURES and SPEC_LISTS. Kept as a constant so the extension can check a model
 * without hashing at load time. The spec test fails if it no longer matches FEATURES.
 */
export const SPEC_HASH = "6a5a0d406ecafaaf47be47d747cc1add70178f4809f7ce8f7b06f7b0c44efe78";

/** Throws if a model was trained on a different feature list (doc 05, C5). */
export function assertModelMatchesSpec(model: { specHash: string }): void {
  if (model.specHash !== SPEC_HASH) {
    throw new Error(
      `Model specHash ${model.specHash} does not match the feature spec ${SPEC_HASH}. ` +
        "Retrain the model on the current features.",
    );
  }
}
