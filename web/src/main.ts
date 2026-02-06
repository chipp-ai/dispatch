import { mount } from "svelte";
import App from "./App.svelte";
import { initDebugLogger } from "./lib/debug-logger";
import { initSentry } from "./lib/sentry";

// Initialize Sentry before anything else
initSentry();

// Initialize browser console log capture (dev only)
if (import.meta.env.DEV) {
  initDebugLogger();
}

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
