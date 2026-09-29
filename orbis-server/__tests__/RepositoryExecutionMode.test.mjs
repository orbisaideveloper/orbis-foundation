// @vitest-environment node

import {
  describe,
  expect,
  it,
} from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  EXECUTION_MODES,
  resolveRepositoryExecutionMode,
  stripNegatedTaskActions,
} = require(
  "../ai/brain/RepositoryExecutionMode.cjs"
);

describe("RepositoryExecutionMode", () => {
  it("keeps ordinary generated code answer-only", () => {
    expect(
      resolveRepositoryExecutionMode(
        "Write a JavaScript function named add.",
      ),
    ).toBe(
      EXECUTION_MODES.ANSWER_ONLY,
    );
  });

  it("keeps constrained coding answer-only when repository access is explicitly denied", () => {
    expect(
      resolveRepositoryExecutionMode(
        "Write settleInvoice. Do not read or modify repository files.",
      ),
    ).toBe(
      EXECUTION_MODES.ANSWER_ONLY,
    );

    expect(
      resolveRepositoryExecutionMode(
        "এই functionটা ঠিক করে দাও। Repository বদলাবে না।",
      ),
    ).toBe(
      EXECUTION_MODES.ANSWER_ONLY,
    );
  });

  it("uses repository-read for explicit inspection without mutation", () => {
    expect(
      resolveRepositoryExecutionMode(
        "Debug repository configuration",
      ),
    ).toBe(
      EXECUTION_MODES.REPOSITORY_READ,
    );

    expect(
      resolveRepositoryExecutionMode(
        "Review the repository but do not modify repository files",
      ),
    ).toBe(
      EXECUTION_MODES.REPOSITORY_READ,
    );
  });

  it("uses repository-change only for explicit repository mutation or verification", () => {
    expect(
      resolveRepositoryExecutionMode(
        "Fix this repository code and verify it",
      ),
    ).toBe(
      EXECUTION_MODES.REPOSITORY_CHANGE,
    );

    expect(
      resolveRepositoryExecutionMode(
        "Verify the changed repository area",
      ),
    ).toBe(
      EXECUTION_MODES.REPOSITORY_CHANGE,
    );
  });

  it("recognizes a concrete file path as a repository target", () => {
    expect(
      resolveRepositoryExecutionMode(
        "Read orbis-server/ai/AIChatService.cjs",
      ),
    ).toBe(
      EXECUTION_MODES.REPOSITORY_READ,
    );
  });

  it("removes negated actions before deterministic routing checks", () => {
    const cleaned =
      stripNegatedTaskActions(
        "Explain Promise.all. Do not write repository code.",
      );

    expect(cleaned).not.toMatch(
      /\bwrite\b/iu,
    );
  });
});
