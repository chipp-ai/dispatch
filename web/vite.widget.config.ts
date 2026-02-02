import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

/**
 * Vite config for building the embeddable chat widget.
 *
 * Build command: npx vite build --config vite.widget.config.ts
 * Output: dist-widget/widget.js (then copied to public/w/chat/)
 */
export default defineConfig({
  plugins: [
    svelte({
      emitCss: false, // Inline CSS into components
    }),
  ],
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
    },
  },
  // Use a separate public dir to avoid conflicts
  publicDir: false,
  build: {
    outDir: "dist-widget",
    emptyOutDir: true,
    lib: {
      entry: "src/widget/main.ts",
      name: "ChippWidget",
      fileName: () => "widget.js",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        // Ensure all CSS is inlined
        inlineDynamicImports: true,
        // No external dependencies - bundle everything
        globals: {},
      },
    },
    // Minify for production (esbuild is default and doesn't require extra deps)
    minify: "esbuild",
    // Generate sourcemap for debugging
    sourcemap: false,
  },
  // Don't clear the screen during build
  clearScreen: false,
});
