// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const PARTY_EMAIL = "rahul@example.com";
const {
  normalizePartyEmail,
  normalizePartyPhone,
  verifiedContactSelectors,
} = require("../accounting-party-contact.cjs");

describe("Accounting party contact normalization", () => {
  it("normalizes email and only explicit international phone values", () => {
    expect(normalizePartyEmail(" Rahul@Example.COM ")).toBe(
      PARTY_EMAIL,
    );
    expect(normalizePartyEmail("invalid")).toBeNull();
    expect(normalizePartyPhone("+91 98765-43210")).toBe("+919876543210");
    expect(normalizePartyPhone("9876543210")).toBeNull();
  });

  it("uses only verified login contacts for claim matching", () => {
    expect(
      verifiedContactSelectors({
        email: "Rahul@Example.com",
        emailVerified: true,
        phone: "+919876543210",
        phoneVerified: false,
      }),
    ).toEqual({
      selectors: [{ emailNormalized: PARTY_EMAIL }],
      email: PARTY_EMAIL,
      phone: null,
    });
  });
});
