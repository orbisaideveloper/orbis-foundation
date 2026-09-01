import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pickMobileContact,
  supportsMobileContactPicker,
} from "../mobileContactPicker";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mobileContactPicker", () => {
  it("uses the phone contact picker when supported", async () => {
    const select = vi.fn().mockResolvedValue([
      { name: ["Seller A"], tel: ["+919999999999"] },
    ]);
    vi.stubGlobal("navigator", { contacts: { select } });
    expect(supportsMobileContactPicker()).toBe(true);
    await expect(pickMobileContact()).resolves.toEqual({
      name: "Seller A",
      phone: "+919999999999",
    });
    expect(select).toHaveBeenCalledWith(["name", "tel"], { multiple: false });
  });

  it("keeps manual entry available where the browser has no contact picker", async () => {
    vi.stubGlobal("navigator", {});
    expect(supportsMobileContactPicker()).toBe(false);
    await expect(pickMobileContact()).resolves.toBeNull();
  });
});
