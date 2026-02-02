export const TEMPLATE_VAR_REGEX = /{{\s*([a-zA-Z0-9_]+)\s*}}/;

// Detect *system* variable placeholders (e.g. {{system.message_history}})
// Capture group 1 will be the key after the `system.` namespace.
export const SYSTEM_VAR_REGEX = /{{\s*system\.([a-zA-Z0-9_]+)\s*}}/;

// Detect *user* variable placeholders (e.g. {{var.API_KEY}})
// Capture group 1 will be the variable name after the `var.` namespace.
export const USER_VAR_REGEX = /{{\s*var\.([a-zA-Z0-9_]+)\s*}}/;

// List of system variable identifiers we currently support. Anything else
// will be treated as a normal string so that users get immediate feedback in
// the UI rather than ending up with an unresolved placeholder at runtime.
export const SUPPORTED_SYSTEM_KEYS = new Set([
  "message_history",
  "message_history_light",
  "user_id",
  "timestamp",
]);
