import SystemDiagnosticConsole from "./components/SystemDiagnosticConsole";
import React from "react";
import AdminViews from "./admin/AdminViews";
import { AdminCoreProvider } from "./admin/providers/AdminCoreProvider";
import { AuthGuard } from "./admin/auth/AuthGuard";
import { useAuth } from "./admin/auth/AuthProvider";

export function AuthenticatedAdminApp() {
  const { isAuthenticated, isLoading, authError, login, logout, user } =
    useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

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
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <form
          className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
          onSubmit={(event) => {
            event.preventDefault();
            void login(email, password);
          }}
        >
          <h1 className="text-xl font-bold text-slate-900">
            ORBIS Foundation Admin
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with your Supabase account to continue.
          </p>
          <label className="mt-5 block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2"
            />
          </label>
          {authError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {authError}
            </p>
          )}
          <button
            type="submit"
            className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white"
          >
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <AuthGuard>
      <SystemDiagnosticConsole />
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
