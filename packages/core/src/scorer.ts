import type { CheckResult, Reason, Signal, VerdictLabel } from "@sentry-ext/contracts";
import scoring from "./scoring.json";

const SIGNAL_ORDER: Record<Signal, number> = {
  danger: 0,
  warn: 1,
  info: 2,
  ok: 3,
  error: 4,
  skipped: 5,
};

/**
 * Stand-in scorer: a feed hit means dangerous, otherwise a simple sum of points.
 * Brandon replaces this with the tuned scorer in Stage 3 (STY-FR-22, 23).
 */
export function scoreResults(results: CheckResult[]): {
  verdict: VerdictLabel;
  score: number;
  reasons: Reason[];
} {
  const reasons = results
    .filter((r) => r.reason !== null && r.signal !== "error" && r.signal !== "skipped")
    .sort((a, b) => SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal] || b.points - a.points)
    .slice(0, scoring.maxReasons)
    .map((r): Reason => ({
      text: r.reason as string,
      check: r.check,
      ...(r.source && { source: r.source }),
    }));

  if (results.some((r) => r.feedHit)) {
    return { verdict: "dangerous", score: 100, reasons };
  }

  // Failed checks add nothing, but they show up in Verdict.missing, never as a pass.
  const sum = results
    .filter((r) => r.signal !== "error" && r.signal !== "skipped")
    .reduce((total, r) => total + r.points, 0);
  const score = Math.min(100, Math.round(sum));
  const { suspicious, dangerous } = scoring.thresholds;
  const verdict: VerdictLabel =
    score >= dangerous ? "dangerous" : score >= suspicious ? "suspicious" : "likely_safe";
  return { verdict, score, reasons };
}
