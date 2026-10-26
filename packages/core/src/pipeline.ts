import type { Check, CheckResult, ParsedUrl, Verdict } from "@sentry-ext/contracts";
import { C1_VERSION } from "@sentry-ext/contracts";
import { scoreResults } from "./scorer";

export interface PipelineOptions {
  url: string;
  parsed: ParsedUrl;
  checks: Check[];
  now?: () => Date;
}

/** Run every check in parallel, each under its own timeout, and combine them into a C1 Verdict. */
export async function runPipeline(opts: PipelineOptions): Promise<Verdict> {
  const results = await Promise.all(opts.checks.map((c) => runCheck(c, opts.url, opts.parsed)));
  const { label, score, reasons } = scoreResults(results);
  return {
    contractVersion: C1_VERSION,
    url: opts.url,
    label,
    score,
    reasons,
    partial: results.some((r) => r.status === "timeout" || r.status === "error"),
    checks: results,
    createdAt: (opts.now ?? (() => new Date()))().toISOString(),
  };
}

async function runCheck(check: Check, url: string, parsed: ParsedUrl): Promise<CheckResult> {
  const controller = new AbortController();
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, check.timeoutMs);
  });

  try {
    const out = await Promise.race([
      check.run({ url, parsed, signal: controller.signal }),
      timeout,
    ]);
    const ms = Date.now() - started;
    if (out === "timeout") {
      return { checkId: check.id, status: "timeout", risk: null, reasons: [], ms };
    }
    return { checkId: check.id, status: "ok", ms, ...out };
  } catch {
    return {
      checkId: check.id,
      status: "error",
      risk: null,
      reasons: [],
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
