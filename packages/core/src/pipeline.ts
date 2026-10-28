import type { Check, CheckContext, CheckResult, Verdict } from "@sentry-ext/contracts";
import { parseUrl } from "@sentry-ext/url-parser";
import { scoreResults } from "./scorer";

export interface PipelineOptions {
  url: string;
  checks: Check[];
  ctx?: CheckContext;
  /** Extension and model versions, "<extension>/<model>". */
  version: string;
  now?: () => Date;
}

/** Run every check in parallel, each under its own timeout, and combine them into a C2 Verdict. */
export async function runPipeline(opts: PipelineOptions): Promise<Verdict> {
  const parsed = parseUrl(opts.url);
  const ctx = opts.ctx ?? {};
  const results = await Promise.all(opts.checks.map((c) => runCheck(c, opts.url, ctx)));
  const { verdict, score, reasons } = scoreResults(results);
  const missing = results
    .filter((r) => r.signal === "error" || r.signal === "skipped")
    .map((r) => r.check);
  return {
    url: opts.url,
    host: parsed.hostname,
    registrableDomain: parsed.domain ?? parsed.hostname,
    score,
    verdict,
    reasons,
    partial: missing.length > 0,
    missing,
    checks: results,
    checkedAt: (opts.now ?? (() => new Date()))().toISOString(),
    version: opts.version,
  };
}

async function runCheck(check: Check, url: string, ctx: CheckContext): Promise<CheckResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), check.timeoutMs);
  });

  try {
    const out = await Promise.race([check.check(url, ctx), timeout]);
    const ms = Date.now() - started;
    if (out === "timeout") return failed(check, ms);
    const points = Math.min(100, Math.max(0, out.points));
    return { ...out, check: check.id, points, ms };
  } catch {
    return failed(check, Date.now() - started);
  } finally {
    clearTimeout(timer);
  }
}

/** Fail visibly: a check that throws or times out is an "error", never a pass. */
function failed(check: Check, ms: number): CheckResult {
  return { check: check.id, signal: "error", points: 0, reason: null, ms };
}
