// C2 Verdict: the scorer produces it, the popup and history consume it. v0, doc 05 section 3. Owner Brandon.
import type { CheckId, CheckResult, Source } from "./c1-check";

export type VerdictLabel = "likely_safe" | "suspicious" | "dangerous";

export interface Reason {
  /** Plain language, e.g. "This domain looks like paypal.com but isn't." */
  text: string;
  check: CheckId;
  /** Set for feed reasons; "google" means the popup must show Google's attribution. */
  source?: Source;
}

export interface Verdict {
  /** Page URL. Never sent off-device. */
  url: string;
  /** Lowercased hostname, e.g. "login.paypa1.com". */
  host: string;
  /** E.g. "paypa1.com". Falls back to host for IPs and unknown suffixes. */
  registrableDomain: string;
  /** 0 to 100, higher is riskier. */
  score: number;
  verdict: VerdictLabel;
  /** 2 to 4, most important first. Fewer only when fewer checks gave a reason. */
  reasons: Reason[];
  /** True when any check did not run. */
  partial: boolean;
  /** Checks whose signal is "error" or "skipped". */
  missing: CheckId[];
  checks: CheckResult[];
  /** ISO 8601. */
  checkedAt: string;
  /** Extension and model versions, "<extension>/<model>", e.g. "0.0.1/2026-12-01". */
  version: string;
}
