// C2 Check: the interface every check plugs into. Draft v0, see docs/contracts/C2.md.
import type { Reason } from "./c1-verdict";
import type { ParsedUrl } from "./c4-parsed-url";

export const C2_VERSION = "c2.v0";

export interface CheckInput {
  url: string;
  parsed: ParsedUrl;
  /** The pipeline aborts checks that run past their timeout. */
  signal: AbortSignal;
}

export type CheckStatus = "ok" | "timeout" | "error" | "skipped";

export interface CheckResult {
  checkId: string;
  status: CheckStatus;
  /** 0 to 1. Null unless status is "ok". */
  risk: number | null;
  /** A feed hit overrides the score. */
  hardVerdict?: "dangerous";
  reasons: Reason[];
  /** How long the check took. */
  ms: number;
}

/** What a check returns; the pipeline fills in checkId, status and ms. */
export type CheckOutput = Pick<CheckResult, "risk" | "reasons" | "hardVerdict">;

export interface Check {
  id: string;
  timeoutMs: number;
  run(input: CheckInput): Promise<CheckOutput>;
}
