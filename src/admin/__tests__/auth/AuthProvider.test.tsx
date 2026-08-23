import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  configured: { value: true },
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../../../core/supabase/client", () => ({
  get isSupabaseConfigured() {
    return authMocks.configured.value;
  },
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
      signInWithPassword: authMocks.signInWithPassword,
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

const ADMIN_IDENTITY = "admin-identity";
const ADMIN_VIEWS_TEXT = "admin-views";

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
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
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
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider detail")));

    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Admin access could not be verified.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("provider detail");
    expect(screen.queryByText(ADMIN_VIEWS_TEXT)).not.toBeInTheDocument();
  });

  it("fails closed without frontend Supabase configuration", async () => {
    authMocks.configured.value = false;

    render(
      <AuthProvider>
        <AuthenticatedAdminApp />
      </AuthProvider>,
    );

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
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
});
