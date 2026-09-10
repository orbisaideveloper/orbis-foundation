// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getLotteryAccountingLocalStore } from "../lotteryAccountingLocalStore";

describe("lotteryAccountingLocalStore without a browser", () => {
  it("returns null when window is unavailable", () => {
    expect(getLotteryAccountingLocalStore()).toBeNull();
  });
});
