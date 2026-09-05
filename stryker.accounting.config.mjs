// @ts-check

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
const config = {
  mutate: ["orbis-server/lottery-accounting-core.cjs"],
  testFiles: [
    "orbis-server/__tests__/lottery-accounting-business-invariants.test.mjs",
    "orbis-server/__tests__/lottery-accounting-property.test.mjs",
  ],
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: {
    configFile: "vitest.config.ts",
    related: false,
  },
  concurrency: 2,
  reporters: ["clear-text", "progress"],
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
};

export default config;
