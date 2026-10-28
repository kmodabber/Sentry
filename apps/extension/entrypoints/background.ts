import { runPipeline, STANDIN_CHECKS } from "@sentry-ext/core";
import type { Verdict } from "@sentry-ext/contracts";

export type CheckPageMessage = { type: "check-page"; url: string };

// No model ships yet; Ethan Rajack's model.json version replaces this in Stage 2.
const MODEL_VERSION = "none";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: CheckPageMessage, _sender, sendResponse) => {
    if (msg?.type !== "check-page") return;
    checkPage(msg.url).then(sendResponse);
    return true; // keep the channel open for the async response
  });
});

async function checkPage(url: string): Promise<Verdict | { error: string }> {
  try {
    // Stage 1: stand-in checks only. Real checks replace STANDIN_CHECKS in Stage 2.
    return await runPipeline({
      url,
      checks: STANDIN_CHECKS,
      version: `${browser.runtime.getManifest().version}/${MODEL_VERSION}`,
    });
  } catch {
    return { error: "Sentry can't check this kind of page." };
  }
}
