import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";

const EMAIL = "ajay@example.com";
const PHONE = "+919999999999";
const DISPLAY_NAME = "Ajay Saha";
const DISPLAY_ID = "ORB-U-12345678";
const CREATE_ACCOUNT = "Create account";
const ACCESS_TOKEN = "token-1";
const ACTIVE = "ACTIVE";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  getPublicAccount: vi.fn(),
  ensurePublicAccount: vi.fn(),
  getPublishedAccountingModel: vi.fn(),
  getPublicOrganizations: vi.fn(),
}));

vi.mock("../core/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: authMocks },
}));

vi.mock("./publicAccountingApi", async () => {
  const actual = await vi.importActual<typeof import("./publicAccountingApi")>(
    "./publicAccountingApi",
  );
  return { ...actual, ...apiMocks };
});

import PublicAccountingApp from "./PublicAccountingApp";

const session = {
  access_token: ACCESS_TOKEN,
  user: {
    id: "auth-user-1",
    email: EMAIL,
    phone: null,
    user_metadata: {
      firstName: "Ajay",
      lastName: "Saha",
      phone: PHONE,
    },
  },
} as any;

const account = {
  id: "account-1",
  firstName: "Ajay",
  lastName: "Saha",
  email: EMAIL,
  phone: PHONE,
  status: ACTIVE,
  identityLinkStatus: "LINKED",
  orbisIdentityId: "identity-1",
  orbisDisplayId: DISPLAY_ID,
  orbisLifecycle: "active",
  identityLinkReason: null,
};

const organization = {
  id: "org-1",
  name: DISPLAY_NAME,
  tdsRateBps: 200,
  userLedgerStorage: "CLOUD",
  status: ACTIVE,
};

const model = {
  slug: "orbis-accounting-ai",
  displayName: "ORBiS Accounting AI",
  category: "ACCOUNTING_AI",
  status: ACTIVE,
  publishedVersion: {
    sequence: 3,
    lifecycle: "PUBLISHED" as const,
    definition: {},
    publishedAt: "2026-09-13T00:00:00.000Z",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  authMocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  authMocks.signInWithPassword.mockResolvedValue({ error: null });
  authMocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  authMocks.signOut.mockResolvedValue({ error: null });
  apiMocks.getPublicAccount.mockResolvedValue(account);
  apiMocks.ensurePublicAccount.mockResolvedValue({ account, organization });
  apiMocks.getPublishedAccountingModel.mockResolvedValue(model);
  apiMocks.getPublicOrganizations.mockResolvedValue([organization]);
});

describe("PublicAccountingApp", () => {
  it("shows public sign-in and the no-OTP create-account fields", async () => {
    render(<PublicAccountingApp />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: CREATE_ACCOUNT }));

    expect(screen.getByLabelText("First name")).toBeVisible();
    expect(screen.getByLabelText("Last name")).toBeVisible();
    expect(screen.getByLabelText("Phone")).toBeVisible();
    expect(screen.getByLabelText("Confirm password")).toBeVisible();
    expect(screen.getByText(/No OTP is required/i)).toBeVisible();
  });

  it("creates Supabase auth with durable profile metadata", async () => {
    render(<PublicAccountingApp />);
    await screen.findByRole("heading", { name: "Sign in" });
    fireEvent.click(screen.getByRole("button", { name: CREATE_ACCOUNT }));

    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Ajay" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Saha" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: EMAIL },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: PHONE },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: CREATE_ACCOUNT })[0]);

    await waitFor(() => expect(authMocks.signUp).toHaveBeenCalledTimes(1));
    expect(authMocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: EMAIL,
        password: "password123",
        options: expect.objectContaining({
          data: {
            firstName: "Ajay",
            lastName: "Saha",
            phone: PHONE,
          },
        }),
      }),
    );
    expect(await screen.findByText(/Account created/i)).toBeVisible();
  });

  it("restores an authenticated session and loads only the public workspace", async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });

    render(<PublicAccountingApp />);

    expect(await screen.findByText(DISPLAY_ID)).toBeVisible();
    expect(screen.getAllByText(DISPLAY_NAME).length).toBeGreaterThan(0);
    expect(screen.getByText("ORBiS Accounting AI")).toBeVisible();
    expect(screen.getByText("Published version 3")).toBeVisible();
    expect(apiMocks.getPublicAccount).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(apiMocks.getPublishedAccountingModel).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(apiMocks.getPublicOrganizations).toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it("bootstraps a missing Foundation account from authenticated user metadata", async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    apiMocks.getPublicAccount.mockResolvedValue(null);

    render(<PublicAccountingApp />);

    expect(await screen.findByText(DISPLAY_ID)).toBeVisible();
    expect(apiMocks.ensurePublicAccount).toHaveBeenCalledWith(ACCESS_TOKEN, {
      firstName: "Ajay",
      lastName: "Saha",
      email: EMAIL,
      phone: PHONE,
      phoneCountryCallingCode: null,
    });
  });
});
