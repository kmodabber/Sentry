import {
  createStandinSafeBrowsing,
  createWorkerClient,
  runPipeline,
  STANDIN_CHECKS,
} from "@sentry-ext/core";
import type { Verdict } from "@sentry-ext/contracts";

export type CheckPageMessage = { type: "check-page"; url: string };

// No model ships yet; Ethan Rajack's model.json version replaces this in Stage 2.
const MODEL_VERSION = "none";

// Local fake Worker by default (pnpm worker:fake). Set WXT_WORKER_URL in apps/extension/.env
// to point elsewhere; STY-62 sets the deployed Worker's URL for production builds.
const WORKER_URL: string = import.meta.env.WXT_WORKER_URL ?? "http://localhost:8787";
const CHECKS = [...STANDIN_CHECKS, createStandinSafeBrowsing(createWorkerClient(WORKER_URL))];

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: CheckPageMessage, _sender, sendResponse) => {
    if (msg?.type !== "check-page") return;
    checkPage(msg.url).then(sendResponse);
    return true; // keep the channel open for the async response
  });
});

async function checkPage(url: string): Promise<Verdict | { error: string }> {
  try {
    // Stand-in checks only. Real checks replace them during Stage 2.
    return await runPipeline({
      url,
      checks: CHECKS,
      version: `${browser.runtime.getManifest().version}/${MODEL_VERSION}`,
    });
  } catch {
    return { error: "PhishClaw can't check this kind of page." };
  }
}
