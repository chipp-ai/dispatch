/**
 * Re-export app for test compatibility.
 * Tests import from src/api/index.ts, but app is defined in root app.ts.
 */

import app from "../../app.ts";

export default app;
