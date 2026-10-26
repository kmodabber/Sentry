import type { CheckResult, Reason, VerdictLabel } from "@sentry-ext/contracts";

const SEVERITY_ORDER: Record<Reason["severity"], number> = { danger: 0, warn: 1, info: 2 };

/**
 * Stand-in scorer: a feed hit means dangerous, otherwise the highest risk wins.
 * Brandon replaces this with the tuned scorer in Stage 3 (STY-FR-22, 23).
 */
export function scoreResults(results: CheckResult[]): {
  label: VerdictLabel;
  score: number;
  reasons: Reason[];
} {
  const reasons = results
    .flatMap((r) => r.reasons)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  if (results.some((r) => r.hardVerdict === "dangerous")) {
    return { label: "dangerous", score: 100, reasons };
  }

  const maxRisk = Math.max(0, ...results.map((r) => r.risk ?? 0));
  const score = Math.round(maxRisk * 100);
  const label: VerdictLabel =
    score >= 70 ? "dangerous" : score >= 40 ? "suspicious" : "likely_safe";
  return { label, score, reasons };
}
