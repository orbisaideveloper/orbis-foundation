import React from "react";
import AdminViews from "./admin/AdminViews";
import { AdminCoreProvider } from "./admin/providers/AdminCoreProvider";
import { AuthGuard } from "./admin/auth/AuthGuard";
import { useAuth } from "./admin/auth/AuthProvider";
import { adminEmail, REQUIRED_ADMIN_EMAIL } from "./core/supabase/client";

function AdminLoginForm() {
  const {
    isSubmitting,
    authError,
    signupStatus,
    login,
    createAdminAccount,
    clearAuthFeedback,
  } = useAuth();
  const [mode, setMode] = React.useState<"SIGN_IN" | "CREATE">("SIGN_IN");
  const [password, setPassword] = React.useState("");
  const [passwordConfirmation, setPasswordConfirmation] = React.useState("");

  const switchMode = (nextMode: "SIGN_IN" | "CREATE") => {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirmation("");
    clearAuthFeedback?.();
  };

  const creatingAccount = mode === "CREATE";
  const confirmationSent = signupStatus === "CONFIRMATION_SENT";
  const submitLabel = creatingAccount ? "Create Admin Account" : "Sign in";
  const loadingLabel = creatingAccount ? "Creating account…" : "Signing in…";

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault();
          if (creatingAccount) {
            void createAdminAccount?.(password, passwordConfirmation);
            return;
          }
          void login(REQUIRED_ADMIN_EMAIL, password);
        }}
      >
        <h1 className="text-xl font-bold text-slate-900">
          ORBIS Foundation Admin
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {creatingAccount
            ? "Create the one approved Admin account. Email verification is required."
            : "Sign in with the verified Supabase Admin account to continue."}
        </p>
        <label className="mt-5 block text-sm font-medium text-slate-700">
          Admin email
          <input
            type="email"
            autoComplete="username"
            readOnly
            aria-readonly="true"
            value={adminEmail || REQUIRED_ADMIN_EMAIL}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 p-2 text-slate-600"
          />
        </label>
        {!confirmationSent && (
          <>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              {creatingAccount ? "New password" : "Password"}
              <input
                type="password"
                autoComplete={
                  creatingAccount ? "new-password" : "current-password"
                }
                required
                minLength={creatingAccount ? 8 : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2"
              />
            </label>
            {creatingAccount && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={passwordConfirmation}
                  onChange={(event) =>
                    setPasswordConfirmation(event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                />
              </label>
            )}
          </>
        )}
        {authError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {authError}
          </p>
        )}
        {confirmationSent && (
          <p role="status" className="mt-4 text-sm text-emerald-700">
            Confirmation email sent. Verify the Admin email, then return here
            and sign in. The password remains active until it is changed or
            reset through Supabase.
          </p>
        )}
        {!confirmationSent && (
          <button
            type="submit"
            disabled={isSubmitting || !adminEmail}
            className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? loadingLabel : submitLabel}
          </button>
        )}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => switchMode(creatingAccount ? "SIGN_IN" : "CREATE")}
          className="mt-3 w-full rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-60"
        >
          {creatingAccount ? "Back to Sign in" : "Create Admin Account"}
        </button>
      </form>
    </main>
  );
}

export function AuthenticatedAdminApp() {
  const { isAuthenticated, isLoading, authError, logout, user } = useAuth();

  if (isLoading) {
    return <div className="p-8 text-slate-600">Checking Admin session…</div>;
  }

  if (user && !isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <section className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-6 shadow-lg">
          <h1 className="text-xl font-bold text-slate-900">Access denied</h1>
          <p role="alert" className="mt-3 text-sm text-red-700">
            {authError || "This account does not have Admin access."}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white"
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <AdminLoginForm />;
  }

  return (
    <AuthGuard>
      <AdminViews />
    </AuthGuard>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-green-100">
      <AdminCoreProvider>
        <AuthenticatedAdminApp />
      </AdminCoreProvider>
    </div>
  );
}

export default App;
