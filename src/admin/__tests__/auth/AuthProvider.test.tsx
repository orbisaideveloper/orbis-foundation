import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  adminEmail: "orbisaideveloper@gmail.com",
  configured: { value: true },
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../../../core/supabase/client", () => ({
  REQUIRED_ADMIN_EMAIL: authMocks.adminEmail,
  get adminEmail() {
    return authMocks.configured.value ? authMocks.adminEmail : null;
  },
  get isAdminAuthConfigured() {
    return authMocks.configured.value;
  },
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
      signInWithPassword: authMocks.signInWithPassword,
      signUp: authMocks.signUp,
      signOut: authMocks.signOut,
    },
  },
}));

vi.mock("../../../components/SystemDiagnosticConsole", () => ({
  default: () => <div>system-diagnostic-console</div>,
}));

vi.mock("../../AdminViews", () => ({
  default: () => <div>admin-views</div>,
}));

import { AuthProvider, useAuth } from "../../auth/AuthProvider";
import { AuthenticatedAdminApp } from "../../../App";

const ADMIN_IDENTITY = authMocks.adminEmail;
const ADMIN_VIEWS_TEXT = "admin-views";
const CREATE_ADMIN_ACCOUNT = "Create Admin Account";
const NEW_PASSWORD = "New password";
const CONFIRM_PASSWORD = "Confirm new password";
const VALID_TEST_PASSWORD = "ValidPass123";
const PROVIDER_DETAIL = "provider detail";

function Consumer() {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.isLoading ? "loading" : "ready"}</span>
      <span>{auth.user || "guest"}</span>
      <span>{auth.role}</span>
      <span>{auth.isAuthenticated ? "authenticated" : "unauthorized"}</span>
      <button onClick={() => void auth.login(ADMIN_IDENTITY, "password")}>
        login
      </button>
      <button onClick={() => void auth.logout()}>logout</button>
      {auth.authError && <span role="alert">{auth.authError}</span>}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  authMocks.configured.value = true;
  authMocks.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  authMocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: authMocks.unsubscribe } },
  });
  authMocks.signInWithPassword.mockResolvedValue({ error: null });
  authMocks.signUp.mockResolvedValue({
    data: {
      user: { identities: [{ id: "new-admin-identity" }] },
      session: null,
    },
    error: null,
  });
  authMocks.signOut.mockResolvedValue({ error: null });
});

describe("AuthProvider Supabase session integration", () => {
  it("restores an Admin session only after backend confirmation", async () => {
    authMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "admin-token",
          user: { id: "admin-id", email: ADMIN_IDENTITY },
        },
      },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, role: "ADMIN" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );

    expect(await screen.findByText(ADMIN_VIEWS_TEXT)).toBeInTheDocument();
    expect(screen.getByText("system-diagnostic-console")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/system/access",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("Authorization")).toBe("Bearer admin-token");
    expect(authMocks.onAuthStateChange).toHaveBeenCalledOnce();

    unmount();
    expect(authMocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps a valid non-Admin outside Admin UI with denial and sign out", async () => {
    authMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "ordinary-token",
          user: { id: "ordinary-user", email: "user@example.test" },
        },
      },
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Admin access required" }), {
          status: 403,
        }),
      ),
    );

    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This account does not have Admin access.",
    );
    expect(screen.queryByText(ADMIN_VIEWS_TEXT)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeVisible();
  });

  it("signs out a restored session rejected as invalid or expired", async () => {
    authMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "expired-token",
          user: { id: "stale-user", email: "stale@example.test" },
        },
      },
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeVisible();
    expect(screen.queryByText(ADMIN_VIEWS_TEXT)).not.toBeInTheDocument();
    expect(authMocks.signOut).toHaveBeenCalledOnce();
  });

  it("fails closed when backend Admin verification is unavailable", async () => {
    authMocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "unverified-token",
          user: { id: "unknown-user", email: "unknown@example.test" },
        },
      },
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error(PROVIDER_DETAIL)),
    );

    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Admin access could not be verified.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(PROVIDER_DETAIL);
    expect(screen.queryByText(ADMIN_VIEWS_TEXT)).not.toBeInTheDocument();
  });

  it("fails closed without frontend Supabase configuration", async () => {
    authMocks.configured.value = false;

    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Admin authentication is not configured.",
    );
    expect(screen.queryByText(ADMIN_VIEWS_TEXT)).not.toBeInTheDocument();
    expect(authMocks.getSession).not.toHaveBeenCalled();
  });

  it("signs in with Supabase credentials and signs out through Supabase", async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await screen.findByText("ready");

    fireEvent.click(screen.getByText("login"));
    await waitFor(() => {
      expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
        email: ADMIN_IDENTITY,
        password: "password",
      });
    });

    fireEvent.click(screen.getByText("logout"));
    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledOnce());
  });

  it("uses a generic login error without exposing provider details", async () => {
    authMocks.signInWithPassword.mockResolvedValue({
      error: new Error("provider secret detail"),
    });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await screen.findByText("ready");

    fireEvent.click(screen.getByText("login"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to sign in with those credentials.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret detail");
  });

  it("creates only the fixed Admin identity and shows the verification state", async () => {
    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );
    await screen.findByRole("button", { name: "Sign in" });

    fireEvent.click(screen.getByRole("button", { name: CREATE_ADMIN_ACCOUNT }));
    const emailInput = screen.getByLabelText("Admin email");
    expect(emailInput).toHaveValue(ADMIN_IDENTITY);
    expect(emailInput).toHaveAttribute("readonly");

    fireEvent.change(screen.getByLabelText(NEW_PASSWORD), {
      target: { value: VALID_TEST_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(CONFIRM_PASSWORD), {
      target: { value: VALID_TEST_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE_ADMIN_ACCOUNT }));

    await waitFor(() => {
      expect(authMocks.signUp).toHaveBeenCalledWith({
        email: ADMIN_IDENTITY,
        password: VALID_TEST_PASSWORD,
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Confirmation email sent",
    );
    expect(screen.queryByText(ADMIN_VIEWS_TEXT)).not.toBeInTheDocument();
  });

  it("reports password mismatch without contacting Supabase", async () => {
    function SignupConsumer() {
      const auth = useAuth();
      return (
        <>
          <button
            onClick={() =>
              void auth.createAdminAccount?.("long-enough", "different-value")
            }
          >
            mismatch
          </button>
          <button
            onClick={() => void auth.createAdminAccount?.("short", "short")}
          >
            weak
          </button>
          {auth.authError && <span role="alert">{auth.authError}</span>}
        </>
      );
    }
    render(
      <AuthProvider>
        <SignupConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(authMocks.getSession).toHaveBeenCalled());

    fireEvent.click(screen.getByText("mismatch"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords do not match.",
    );
    expect(authMocks.signUp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("weak"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "at least 8 characters",
    );
    expect(authMocks.signUp).not.toHaveBeenCalled();
  });

  it("guides an already registered Admin back to sign in", async () => {
    authMocks.signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    });
    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );
    await screen.findByRole("button", { name: "Sign in" });
    fireEvent.click(screen.getByRole("button", { name: CREATE_ADMIN_ACCOUNT }));
    fireEvent.change(screen.getByLabelText(NEW_PASSWORD), {
      target: { value: VALID_TEST_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(CONFIRM_PASSWORD), {
      target: { value: VALID_TEST_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE_ADMIN_ACCOUNT }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already registered. Sign in instead.",
    );
    expect(
      screen.getByRole("button", { name: "Back to Sign in" }),
    ).toBeVisible();
  });

  it("shows an unverified-email login error safely", async () => {
    authMocks.signInWithPassword.mockResolvedValueOnce({
      error: { code: "email_not_confirmed", message: PROVIDER_DETAIL },
    });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await screen.findByText("ready");
    fireEvent.click(screen.getByText("login"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Verify the Admin email",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(PROVIDER_DETAIL);
  });

  it("shows a safe Supabase weak-password error", async () => {
    authMocks.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "weak_password", message: "provider password policy" },
    });
    function SignupConsumer() {
      const auth = useAuth();
      return (
        <>
          <button
            onClick={() =>
              void auth.createAdminAccount?.(
                VALID_TEST_PASSWORD,
                VALID_TEST_PASSWORD,
              )
            }
          >
            create
          </button>
          {auth.authError && <span role="alert">{auth.authError}</span>}
        </>
      );
    }
    render(
      <AuthProvider>
        <SignupConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(authMocks.getSession).toHaveBeenCalled());
    fireEvent.click(screen.getByText("create"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Supabase password requirements",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "provider password policy",
    );
  });

  it("shows signup loading and refuses an immediate unverified session", async () => {
    let resolveSignup = vi.fn<(value: unknown) => void>();
    authMocks.signUp.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignup = resolve;
      }),
    );
    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );
    await screen.findByRole("button", { name: "Sign in" });
    fireEvent.click(screen.getByRole("button", { name: CREATE_ADMIN_ACCOUNT }));
    fireEvent.change(screen.getByLabelText(NEW_PASSWORD), {
      target: { value: VALID_TEST_PASSWORD },
    });
    fireEvent.change(screen.getByLabelText(CONFIRM_PASSWORD), {
      target: { value: VALID_TEST_PASSWORD },
    });
    fireEvent.click(screen.getByRole("button", { name: CREATE_ADMIN_ACCOUNT }));

    expect(
      await screen.findByRole("button", { name: "Creating account…" }),
    ).toBeDisabled();
    resolveSignup({
      data: {
        user: { identities: [{ id: "auto-confirmed-admin" }] },
        session: {
          access_token: "must-not-be-authorized",
          user: { id: "auto-confirmed-admin", email: ADMIN_IDENTITY },
        },
      },
      error: null,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "email verification must be enabled",
    );
    expect(authMocks.signOut).toHaveBeenCalled();
    expect(screen.queryByText(ADMIN_VIEWS_TEXT)).not.toBeInTheDocument();
  });
});
