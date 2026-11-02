// C1 Check result: what every check returns. v0, doc 05 section 3. Owner Mo.

export type CheckId =
  | "safebrowsing"
  | "openphish"
  | "urlhaus"
  | "lookalike"
  | "homograph"
  | "brand_misuse"
  | "red_flags"
  | "known_site"
  | "domain_age"
  | "page"
  | "ml";

/** "error" means the check failed or timed out; it never counts as a pass. */
export type Signal = "danger" | "warn" | "info" | "ok" | "error" | "skipped";

export type Source = "google" | "openphish" | "urlhaus" | "rdap";

export interface CheckResult {
  check: CheckId;
  signal: Signal;
  /** 0 to 100, what this check adds to the score. */
  points: number;
  /** True only for safebrowsing, openphish and urlhaus. */
  feedHit?: boolean;
  /** One plain sentence for the popup. */
  reason: string | null;
  /** E.g. { brand: "paypal.com", edits: 1 }. */
  evidence?: Record<string, unknown>;
  source?: Source;
  /** How long the check took. */
  ms: number;
}

/** What the page check reads from the active tab. Placeholder until Brandon's page check lands. */
export interface PageFacts {
  title: string;
  headings: string[];
  forms: { hasPassword: boolean; actionHost: string | null }[];
  isHttps: boolean;
}

export interface CheckContext {
  page?: PageFacts;
}

/**
 * A check plugin. The pipeline runs each one under timeoutMs and never knows which checks
 * exist. It overwrites `check` and `ms`, and turns a throw or timeout into signal "error".
 */
export interface Check {
  id: CheckId;
  timeoutMs: number;
  check(url: string, ctx: CheckContext): Promise<CheckResult>;
}
