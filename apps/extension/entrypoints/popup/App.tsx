import { useEffect, useState } from "react";
import type { Verdict, VerdictLabel } from "@sentry-ext/contracts";
import { highlightDomain } from "./domain-diff";

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

/** STY-FR-32: the checked domain, with the part that imitates a brand highlighted. */
function Domain({ verdict }: { verdict: Verdict }) {
  const flagged = verdict.checks.find(
    (c) =>
      (c.check === "lookalike" || c.check === "homograph") && typeof c.evidence?.brand === "string",
  );
  if (!flagged) return <p className="domain">{verdict.host}</p>;

  const { prefix, tricky, suffix } = highlightDomain(
    verdict.host,
    flagged.evidence!.brand as string,
  );
  if (!tricky) return <p className="domain">{verdict.host}</p>;

  return (
    <p className="domain">
      {prefix}
      <mark className="domain-tricky">{tricky}</mark>
      {suffix}
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
    </main>
  );
}
