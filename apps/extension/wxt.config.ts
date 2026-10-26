import { defineConfig } from "wxt";

// Permissions: keep to the minimum listed in doc 02. activeTab gives the URL of
// the tab only when the user clicks the Sentry icon.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Sentry",
    description: "Tells you, in plain language, whether a page is likely phishing and why.",
    permissions: ["activeTab"],
  },
});
