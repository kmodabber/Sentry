import {
  createDisguisedCharactersCheck,
  createLookalikeCheck,
  createSafeBrowsingCheck,
  createWorkerClient,
  runPipeline,
  STANDIN_CHECKS,
} from "@sentry-ext/core";
import type { Verdict } from "@sentry-ext/contracts";

export type CheckPageMessage = { type: "check-page"; url: string };

// No model ships yet; Ethan Rajack's model.json version replaces this in Stage 2.
const MODEL_VERSION = "none";

// The deployed Worker (STY-62) holds the keys. Its URL isn't secret: it ships in every build.
const DEPLOYED_WORKER_URL = "https://phishclaw-worker.phishclaw-wcs.workers.dev";
// `pnpm dev` uses the local fake Worker (pnpm worker:fake); production builds use the deployed
// one. Set WXT_WORKER_URL in apps/extension/.env to override either.
const WORKER_URL: string =
  import.meta.env.WXT_WORKER_URL ??
  (import.meta.env.DEV ? "http://localhost:8787" : DEPLOYED_WORKER_URL);
// One instance for the background's lifetime, so its Safe Browsing cache is shared by all checks.
const CHECKS = [
  ...STANDIN_CHECKS,
  createSafeBrowsingCheck(createWorkerClient(WORKER_URL)),
  createLookalikeCheck(),
  createDisguisedCharactersCheck(),
];

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: CheckPageMessage, _sender, sendResponse) => {
    if (msg?.type !== "check-page") return;
    checkPage(msg.url).then(sendResponse);
    return true; // keep the channel open for the async response
  });
});

async function checkPage(url: string): Promise<Verdict | { error: string }> {
  try {
    // Safe Browsing (STY-63), lookalike (STY-68) and disguised characters (STY-69) are real;
    // red flags is still a stand-in.
    return await runPipeline({
      url,
      checks: CHECKS,
      version: `${browser.runtime.getManifest().version}/${MODEL_VERSION}`,
    });
  } catch {
    return { error: "PhishClaw can't check this kind of page." };
  }
}
