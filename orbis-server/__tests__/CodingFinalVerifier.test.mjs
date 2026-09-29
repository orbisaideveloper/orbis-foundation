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
  parseCodingFinalReview,
  requiresCodingConstraintReview,
  reviewCodingFinal,
} = require(
  "../ai/brain/CodingFinalVerifier.cjs"
);

describe("CodingFinalVerifier", () => {
  it("reviews explicit coding contracts but skips simple unconstrained prompts", () => {
    expect(
      requiresCodingConstraintReview(
        "totalPaise must be a non-negative integer and invalid input must throw TypeError",
      ),
    ).toBe(true);

    expect(
      requiresCodingConstraintReview(
        "Write a JavaScript add function.",
      ),
    ).toBe(false);
  });

  it("parses only bounded pass or revise verdicts", () => {
    expect(
      parseCodingFinalReview(
        '{"status":"pass","feedback":""}',
      ),
    ).toEqual({
      status: "pass",
      feedback: "",
    });

    expect(
      parseCodingFinalReview(
        '{"status":"revise","feedback":"Missing integer validation."}',
      ),
    ).toEqual({
      status: "revise",
      feedback:
        "Missing integer validation.",
    });

    expect(
      parseCodingFinalReview(
        '{"status":"maybe","feedback":"x"}',
      ),
    ).toBeNull();
  });

  it("uses reasoning routing for the bounded verifier", async () => {
    const manager = {
      generateChat: vi.fn().mockResolvedValue({
        content:
          '{"status":"revise","feedback":"Missing validation."}',
      }),
    };

    const result =
      await reviewCodingFinal({
        manager,
        originalUserRequest:
          "Input must be an integer.",
        draft:
          "function f(value) { return value; }",
      });

    expect(result).toEqual({
      status: "revise",
      feedback: "Missing validation.",
    });

    expect(
      manager.generateChat,
    ).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        task: "reasoning",
      }),
    );
  });
});
