import { describe, expect, it, vi } from "vitest";
import { registerAccountingPwa } from "./registerAccountingPwa";

const REGISTRATION = {} as ServiceWorkerRegistration;
const ACCOUNTING_PATH = "/accounting";

describe("registerAccountingPwa", () => {
  it("registers the Accounting worker only for the production /accounting route", async () => {
    const register = vi.fn().mockResolvedValue(REGISTRATION);

    await expect(
      registerAccountingPwa({
        pathname: `${ACCOUNTING_PATH}/`,
        production: true,
        serviceWorker: { register },
      }),
    ).resolves.toBe(REGISTRATION);

    expect(register).toHaveBeenCalledWith("/accounting-sw.js", {
      scope: ACCOUNTING_PATH,
    });
  });

  it("does not register outside the Accounting route", async () => {
    const register = vi.fn().mockResolvedValue(REGISTRATION);

    await expect(
      registerAccountingPwa({
        pathname: "/preview",
        production: true,
        serviceWorker: { register },
      }),
    ).resolves.toBeNull();

    expect(register).not.toHaveBeenCalled();
  });

  it("does not register in development", async () => {
    const register = vi.fn().mockResolvedValue(REGISTRATION);

    await expect(
      registerAccountingPwa({
        pathname: ACCOUNTING_PATH,
        production: false,
        serviceWorker: { register },
      }),
    ).resolves.toBeNull();

    expect(register).not.toHaveBeenCalled();
  });

  it("fails closed when browser registration rejects", async () => {
    const register = vi.fn().mockRejectedValue(new Error("blocked"));

    await expect(
      registerAccountingPwa({
        pathname: ACCOUNTING_PATH,
        production: true,
        serviceWorker: { register },
      }),
    ).resolves.toBeNull();
  });
});
