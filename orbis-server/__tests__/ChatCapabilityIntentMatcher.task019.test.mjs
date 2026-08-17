import { describe, expect, it } from "vitest";
import matcher from "../ai/brain/ChatCapabilityIntentMatcher.cjs";

describe("TASK-019 approval intent", () => {
  const token = "AbCdEf0123456789_-AbCdEf0123456789";
  it("accepts explicit APPROVE token syntax", () => {
    expect(matcher.matchApprovalDecision(`APPROVE ${token}`)).toEqual({ token, decision: "APPROVE" });
  });
  it("does not authorize bare yes", () => {
    expect(matcher.matchApprovalDecision("yes")).toBeNull();
    expect(matcher.matchApprovalDecision("হ্যাঁ")).toBeNull();
  });
  it("accepts Bengali approval with a token", () => {
    expect(matcher.matchApprovalDecision(`অনুমোদন ${token}`)).toEqual({ token, decision: "APPROVE" });
  });
});
