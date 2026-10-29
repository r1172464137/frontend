import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig((configEnv) => {
  // Set this before Vite resolves production/development conditions and before
  // workers import React. This config is loaded only by Vitest, not builds.
  process.env.NODE_ENV = "test";
  return mergeConfig(viteConfig(configEnv), {
    test: { env: { NODE_ENV: "test" } },
  });
});
