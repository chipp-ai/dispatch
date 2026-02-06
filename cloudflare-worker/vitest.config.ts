import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        singleWorker: true,
        isolatedStorage: false,
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          kvNamespaces: ["TENANT_CONFIG"],
          r2Buckets: ["ASSETS"],
          bindings: {
            API_ORIGIN: "http://localhost:8000",
          },
        },
      },
    },
  },
});
