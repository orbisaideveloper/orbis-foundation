import { describe, expect, it } from "vitest";
import {
  formatPaise,
  percentToBasisPoints,
  rupeesToPaise,
  sumPaise,
} from "../lotteryAccountingMoney";

describe("lottery accounting money helpers", () => {
  it("converts user-facing rupees and percentages without floating-point drift", () => {
    expect(rupeesToPaise("10")).toBe("1000");
    expect(rupeesToPaise("10.05")).toBe("1005");
    expect(rupeesToPaise("10.005")).toBeNull();
    expect(percentToBasisPoints("5.25")).toBe("525");
    expect(percentToBasisPoints("100.01")).toBeNull();
  });

  it("formats and totals integer paise exactly", () => {
    expect(formatPaise("1005")).toBe("₹10.05");
    expect(formatPaise("-50")).toBe("-₹0.50");
    expect(sumPaise(["1", "2", 3n])).toBe("6");
  });
});
