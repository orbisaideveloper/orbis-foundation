// @ts-check

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
const config = {
  mutate: ["orbis-server/lottery-accounting-core.cjs"],
  testFiles: [
    "orbis-server/__tests__/lottery-accounting-boundaries.test.mjs",
    "orbis-server/__tests__/lottery-accounting-business-invariants.test.mjs",
    "orbis-server/__tests__/lottery-accounting-property.test.mjs",
    "orbis-server/__tests__/lottery-accounting-core.test.mjs",
    "orbis-server/__tests__/lottery-accounting-service.test.mjs",
    "orbis-server/__tests__/lottery-accounting-corrections.test.mjs",
    "orbis-server/__tests__/lottery-accounting-summary-reconciliation.test.mjs",
    "orbis-server/__tests__/lottery-accounting-tds-reconciliation.test.mjs",
    "orbis-server/__tests__/lottery-accounting-voucher-advance.test.mjs",
    "orbis-server/__tests__/lottery-accounting-monthly-carry-forward.test.mjs",
    "orbis-server/__tests__/lottery-accounting-voids.test.mjs",
    "orbis-server/__tests__/lottery-accounting-business-date.test.mjs",
  ],
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: {
    configFile: "vitest.config.ts",
    related: false,
  },
  concurrency: 2,
  reporters: ["clear-text", "progress", "json"],
  thresholds: {
    high: 80,
    low: 60,
    break: 60,
  },
};

export default config;
