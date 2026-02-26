import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    test: {
      globals: true,
      include: ["test/**/*.test.ts"],
      setupFiles: ["test/setup.ts"],
      env,
    },
  };
});
