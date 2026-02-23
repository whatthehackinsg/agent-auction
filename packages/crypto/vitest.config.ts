import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000, // ZK operations can be slow
  },
});
