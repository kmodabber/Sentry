// C1 Verdict: what the pipeline hands the popup. Draft v0, see docs/contracts/C1.md.
import type { CheckResult } from "./c2-check";

export const C1_VERSION = "c1.v0";

export type VerdictLabel = "likely_safe" | "suspicious" | "dangerous";

export interface Reason {
  /** Which check produced this reason, e.g. "lookalike", "safe_browsing". */
  checkId: string;
  /** Plain language, e.g. "This domain looks like paypal.com but isn't". */
  text: string;
  severity: "info" | "warn" | "danger";
  /** Character span of the hostname to highlight in the popup. */
  highlight?: { start: number; end: number };
  /** Required wording for some sources, e.g. "Advisory provided by Google". */
  attribution?: string;
}

export interface Verdict {
  contractVersion: typeof C1_VERSION;
  /** Page URL. Never sent off-device. */
  url: string;
  label: VerdictLabel;
  /** 0 to 100, higher is riskier. */
  score: number;
  /** Ordered, most important first. */
  reasons: Reason[];
  /** True if any check timed out or failed. */
  partial: boolean;
  checks: CheckResult[];
  /** ISO 8601. */
  createdAt: string;
}
