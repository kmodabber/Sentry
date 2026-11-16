import { useEffect, useState } from "react";
import type { Verdict, VerdictLabel } from "@sentry-ext/contracts";
import { findBrandEvidence, highlightDomain, splitHost } from "./domain-diff";

// Popup v0 (Ethan Ung owns this). Wording follows the guide: plain words, never "safe" alone.
const LABEL_TEXT: Record<VerdictLabel, string> = {
  likely_safe: "Likely safe",
  suspicious: "Suspicious",
  dangerous: "Dangerous",
};

// Decorative only: the heading already states the verdict in words.
const LABEL_GLYPH: Record<VerdictLabel, string> = {
  likely_safe: "✓",
  suspicious: "!",
  dangerous: "✕",
};

/** STY-85: the Stage 2 plan's disclaimer, shown only under the likely-safe verdict. */
export function showsNoCheckIsPerfect(verdict: VerdictLabel): boolean {
  return verdict === "likely_safe";
}

/** STY-FR-32: the checked domain, with the part that imitates a brand highlighted. */
function Domain({ verdict }: { verdict: Verdict }) {
  const brand = findBrandEvidence(verdict.checks);
  const split = brand ? splitHost(verdict.host, verdict.registrableDomain) : null;
  if (!brand || !split) return <p className="domain">{verdict.host}</p>;

  const { subdomain, rest } = split;
  const segments = highlightDomain(rest, brand);
  if (!segments.some((s) => s.type !== "same")) return <p className="domain">{verdict.host}</p>;

  return (
    <p className="domain">
      {subdomain}
      {segments.map((s, i) => {
        if (s.type === "same") return <span key={i}>{s.text}</span>;
        if (s.type === "changed") {
          return (
            <mark key={i} className="domain-tricky">
              {s.text}
            </mark>
          );
        }
        return (
          <mark
            key={i}
            className="domain-tricky domain-missing"
            aria-label={`missing letter '${s.letter}'`}
            title={`missing letter '${s.letter}'`}
          >
            ‸
          </mark>
        );
      })}
    </p>
  );
}

type State =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; verdict: Verdict };

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        setState({ kind: "error", message: "Sentry can't read this page's address." });
        return;
      }
      const res = await browser.runtime.sendMessage({ type: "check-page", url: tab.url });
      if (!res || "error" in res) {
        setState({ kind: "error", message: res?.error ?? "Something went wrong." });
      } else {
        setState({ kind: "done", verdict: res as Verdict });
      }
    })();
  }, []);

  if (state.kind === "loading") return <main className="popup">Checking this page…</main>;
  if (state.kind === "error") return <main className="popup">{state.message}</main>;

  const v = state.verdict;
  return (
    <main className={`popup verdict-${v.verdict}`}>
      <div className="headline">
        <span className="verdict-icon" aria-hidden="true">
          {LABEL_GLYPH[v.verdict]}
        </span>
        <h1>{LABEL_TEXT[v.verdict]}</h1>
      </div>
      <Domain verdict={v} />
      <p className="score">Risk score: {v.score} / 100</p>
      {v.reasons.length > 0 ? (
        <ul>
          {v.reasons.map((r, i) => (
            <li key={i}>
              {r.text}
              {r.source === "google" && (
                <span className="attribution">Advisory provided by Google</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>We didn't find warning signs on this page.</p>
      )}
      {v.partial && (
        <p className="partial">Some checks didn't finish, so this result may be incomplete.</p>
      )}
      {showsNoCheckIsPerfect(v.verdict) && <p className="disclaimer">No check is perfect.</p>}
    </main>
  );
}
