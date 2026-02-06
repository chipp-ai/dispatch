import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

/**
 * Generates version.json in the build output and defines __APP_VERSION__
 * as a compile-time constant. The version check module polls version.json
 * to detect new deployments and nudge users to refresh.
 */
function versionPlugin(): Plugin {
  const version = Date.now().toString(36);
  return {
    name: "chipp-version",
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(version),
        },
      };
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version }),
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), versionPlugin()],
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        cookieDomainRewrite: "localhost",
      },
      "/generate": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://localhost:8000",
        changeOrigin: true,
        cookieDomainRewrite: "localhost",
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
      "/consumer": {
        target: "http://localhost:8000",
        changeOrigin: true,
        cookieDomainRewrite: "localhost",
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          svelte: ["svelte"],
        },
      },
    },
  },
});
