/**
 * Chipp Chat Widget
 *
 * Embeddable chat widget that can be added to any website.
 *
 * Usage:
 * <script src="https://build.chipp.ai/w/chat/widget.js"></script>
 *
 * The script automatically detects the app from the URL path.
 * For example, if loaded from: https://my-app.build.chipp.ai/w/chat/widget.js
 * It will use "my-app" as the appNameId.
 */

import { mount } from "svelte";
import Widget from "./Widget.svelte";

// Get the script element to determine the app URL and appNameId
const currentScript = document.currentScript as HTMLScriptElement;
const scriptUrl = new URL(currentScript.src);

// Extract appNameId from the URL path: /w/chat/widget.js -> check subdomain or path
// The URL format is: https://{appNameId}.build.chipp.ai/w/chat/widget.js
// Or in dev: http://{appNameId}.localhost:5174/w/chat/widget.js
const hostname = scriptUrl.hostname;
const appNameId = hostname.split(".")[0]; // Get subdomain

// Determine the app URL (origin of the script)
const appUrl = scriptUrl.origin;

// Create container element
let container = document.getElementById("chipp-chat-widget");
if (!container) {
  container = document.createElement("div");
  container.id = "chipp-chat-widget";
  document.body.appendChild(container);
}

// Mount the widget
if (!(container as any).__chipp_mounted) {
  mount(Widget, {
    target: container,
    props: {
      appUrl,
      appNameId,
    },
  });
  (container as any).__chipp_mounted = true;
}
