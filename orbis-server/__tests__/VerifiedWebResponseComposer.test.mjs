// @vitest-environment node

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  composeVerifiedWebAnswer,
  sameNumericFacts,
} = require(
  "../ai/brain/VerifiedWebResponseComposer.cjs"
);

describe("VerifiedWebResponseComposer", () => {
  it("keeps an already-Bengali verified answer without another model call", async () => {
    const manager = {
      generateChat: vi.fn(),
    };

    const result =
      await composeVerifiedWebAnswer(
        "আজ USD to INR হার 93.50।",
        "bn",
        { manager },
      );

    expect(result).toContain(
      "আজ USD to INR হার 93.50।",
    );

    expect(
      manager.generateChat,
    ).not.toHaveBeenCalled();
  });

  it("translates an English verified answer into Bengali while preserving numbers", async () => {
    const source =
      "On 2026-09-29 the USD to INR rate is 93.50.";

    const manager = {
      generateChat: vi.fn().mockResolvedValue({
        content:
          "2026-09-29 তারিখে USD to INR হার 93.50।",
      }),
    };

    const result =
      await composeVerifiedWebAnswer(
        source,
        "bn",
        { manager },
      );

    expect(result).toContain(
      "2026-09-29",
    );

    expect(result).toContain(
      "93.50",
    );

    expect(result).toMatch(
      /[\u0980-\u09FF]/u,
    );

    expect(
      sameNumericFacts(
        source,
        result,
      ),
    ).toBe(true);
  });

  it("rejects a Bengali rewrite that changes verified numeric facts", async () => {
    const source =
      "On 2026-09-29 the USD to INR rate is 93.50.";

    const manager = {
      generateChat: vi.fn().mockResolvedValue({
        content:
          "2026-09-29 তারিখে USD to INR হার 94.00।",
      }),
    };

    const result =
      await composeVerifiedWebAnswer(
        source,
        "bn",
        { manager },
      );

    expect(result).toMatch(
      /[\u0980-\u09FF]/u,
    );

    expect(result).toContain(source);
    expect(result).not.toContain("94.00");
  });

  it("leaves an English request on the deterministic composer path", async () => {
    const manager = {
      generateChat: vi.fn(),
    };

    const source =
      "Current verified value is 42.";

    const result =
      await composeVerifiedWebAnswer(
        source,
        "en",
        { manager },
      );

    expect(result).toBe(
      `[ORBIS Web Analysis]:\n${source}`,
    );

    expect(
      manager.generateChat,
    ).not.toHaveBeenCalled();
  });
});
