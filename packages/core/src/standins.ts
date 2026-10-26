import type { Check } from "@sentry-ext/contracts";

// Stand-in checks: fake versions that return hard-coded answers in the C2 shape,
// so the popup and pipeline work end to end before the real checks exist.
// Each one is replaced by the real check in Stage 2.

/** Pretends to be the lookalike check: flags a few known fake brand domains. */
export const standinLookalike: Check = {
  id: "lookalike",
  timeoutMs: 500,
  async run({ parsed }) {
    const fakes: Record<string, string> = {
      "paypa1.com": "paypal.com",
      "rnicrosoft.com": "microsoft.com",
    };
    const real = parsed.domain ? fakes[parsed.domain] : undefined;
    if (!real) return { risk: 0, reasons: [] };
    const start = parsed.hostname.indexOf(parsed.domain ?? "");
    return {
      risk: 0.9,
      reasons: [
        {
          checkId: "lookalike",
          text: `This domain looks like ${real} but isn't.`,
          severity: "danger",
          highlight: { start, end: start + (parsed.domain?.length ?? 0) },
        },
      ],
    };
  },
};

/** Pretends to be a URL red-flag check: raw IP addresses look suspicious. */
export const standinRedFlags: Check = {
  id: "red_flags",
  timeoutMs: 500,
  async run({ parsed }) {
    if (!parsed.isIp) return { risk: 0, reasons: [] };
    return {
      risk: 0.5,
      reasons: [
        {
          checkId: "red_flags",
          text: "This page uses a bare number address instead of a name.",
          severity: "warn",
        },
      ],
    };
  },
};

export const STANDIN_CHECKS: Check[] = [standinLookalike, standinRedFlags];
