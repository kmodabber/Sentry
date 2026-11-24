import type { Check } from "@sentry-ext/contracts";
import { parseUrl } from "@sentry-ext/url-parser";

// Stand-in checks: fake versions that return hard-coded answers in the C1 shape,
// so the popup and pipeline work end to end before the real checks exist.
// Each one is replaced by the real check in Stage 2.
// lookalike's stand-in was replaced by the real check in checks/lookalike.ts (STY-68).

/** Pretends to be a URL red-flag check: raw IP addresses look suspicious. */
export const standinRedFlags: Check = {
  id: "red_flags",
  timeoutMs: 500,
  async check(url) {
    const started = Date.now();
    if (!parseUrl(url).isIp) {
      return {
        check: "red_flags",
        signal: "ok",
        points: 0,
        reason: null,
        ms: Date.now() - started,
      };
    }
    return {
      check: "red_flags",
      signal: "warn",
      points: 40,
      reason: "This page uses a bare number address instead of a name.",
      ms: Date.now() - started,
    };
  },
};

export const STANDIN_CHECKS: Check[] = [standinRedFlags];
