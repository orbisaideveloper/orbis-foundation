import React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AccountingPublicView } from "../admin/dashboard/sections/AccountingPublicView";
import {
  isSupabaseConfigured,
  supabase,
} from "../core/supabase/client";
import {
  createPublicLotteryAccountingClient,
  ensurePublicAccount,
  getPublishedAccountingModel,
  getPublicAccount,
  getPublicOrganizations,
  PublicAccountingApiError,
  type FoundationPublishedModel,
  type FoundationPublicAccount,
  type FoundationPublicOrganization,
  type PublicAccountProfileInput,
} from "./publicAccountingApi";

const AUTH_UNAVAILABLE = "Public Accounting authentication is unavailable.";
const SESSION_UNAVAILABLE = "Unable to restore your session. Please try again.";
const ACCOUNT_UNAVAILABLE = "Unable to load your Accounting account right now.";
const ACCOUNTING_LABEL = "ORBIS Accounting";
const SIGN_IN_LABEL = "Sign in";
const CREATE_ACCOUNT_LABEL = "Create account";
const SIGN_OUT_LABEL = "Sign out";
const PAGE_CLASS = "min-h-screen bg-slate-50 px-4 py-6 text-slate-900";
const CARD_CLASS =
  "mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const FIELD_CLASS = "mt-3 block text-sm font-medium text-slate-700";
const INPUT_CLASS = "mt-1 w-full rounded-lg border border-slate-300 p-2";
const PRIMARY_BUTTON_CLASS =
  "mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60";
const SECONDARY_BUTTON_CLASS =
  "mt-3 w-full rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-60";
const SECTION_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wide text-slate-500";
const REQUIRE_SIGN_IN_ON_OPEN_KEY =
  "orbis.publicAccounting.requireSignInOnOpen";
const SESSION_UNLOCKED_KEY =
  "orbis.publicAccounting.sessionUnlocked";

type BrowserStorageKind = "local" | "session";

function browserStorage(kind: BrowserStorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readStorageFlag(kind: BrowserStorageKind, key: string): boolean {
  try {
    return browserStorage(kind)?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeStorageFlag(
  kind: BrowserStorageKind,
  key: string,
  enabled: boolean,
): void {
  try {
    const storage = browserStorage(kind);
    if (!storage) return;
    if (enabled) storage.setItem(key, "1");
    else storage.removeItem(key);
  } catch {
    // Storage restrictions must not block Accounting access.
  }
}

type AuthMode = "SIGN_IN" | "CREATE";

type SignupForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirmation: string;
};

const emptySignupForm: SignupForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  passwordConfirmation: "",
};

function textMetadata(user: User, key: string): string {
  const value = user.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function profileFromUser(user: User): PublicAccountProfileInput | null {
  const firstName = textMetadata(user, "firstName");
  const lastName = textMetadata(user, "lastName");
  const email = user.email?.trim() || "";
  const phone = user.phone?.trim() || textMetadata(user, "phone");
  const phoneCountryCallingCode = textMetadata(
    user,
    "phoneCountryCallingCode",
  );

  if (!firstName || !lastName || !email || !phone) return null;
  return {
    firstName,
    lastName,
    email,
    phone,
    phoneCountryCallingCode: phoneCountryCallingCode || null,
  };
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof PublicAccountingApiError) {
    if (error.status === 401) return "Your session expired. Please sign in again.";
    if (error.code === "ACCOUNTING_MODEL_UNAVAILABLE") {
      return "The published Accounting model is temporarily unavailable.";
    }
    if (error.code === "FOUNDATION_ACCOUNT_UNAVAILABLE") {
      return "Your Accounting account could not be prepared.";
    }
  }
  return ACCOUNT_UNAVAILABLE;
}

function PublishedWorkspace({
  account,
  organizations,
  model,
  onLogout,
}: {
  account: FoundationPublicAccount;
  organizations: FoundationPublicOrganization[];
  model: FoundationPublishedModel | null;
  onLogout: () => void;
}) {
  return (
    <main className={PAGE_CLASS}>
      <section className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {ACCOUNTING_LABEL}
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {account.firstName} {account.lastName}
            </h1>
            <p className="mt-1 break-all text-sm text-slate-500">
              {account.orbisDisplayId || "ORBIS ID linking in progress"}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {SIGN_OUT_LABEL}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className={SECTION_LABEL_CLASS}>Identity</p>
            <p className="mt-1 font-semibold">{account.identityLinkStatus}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className={SECTION_LABEL_CLASS}>Organization</p>
            <p className="mt-1 font-semibold">
              {organizations[0]?.name || "Not available yet"}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <p className={SECTION_LABEL_CLASS}>Published Accounting model</p>
          {model ? (
            <>
              <p className="mt-1 font-semibold">{model.displayName}</p>
              <p className="mt-1 text-sm text-slate-500">
                Published version {model.publishedVersion.sequence}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-amber-700">
              Accounting is not published for public use yet.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function AuthForm({
  mode,
  form,
  busy,
  message,
  error,
  onModeChange,
  onChange,
  onSubmit,
}: {
  mode: AuthMode;
  form: SignupForm;
  busy: boolean;
  message: string | null;
  error: string | null;
  onModeChange: (mode: AuthMode) => void;
  onChange: (field: keyof SignupForm, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const creating = mode === "CREATE";
  return (
    <main className={PAGE_CLASS}>
      <form onSubmit={onSubmit} className={CARD_CLASS}>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {ACCOUNTING_LABEL}
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          {creating ? CREATE_ACCOUNT_LABEL : SIGN_IN_LABEL}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {creating
            ? "Create your Foundation account with email and password. No OTP is required."
            : "Use the email and password for your ORBIS Foundation account."}
        </p>

        {creating && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              First name
              <input
                required
                autoComplete="given-name"
                value={form.firstName}
                onChange={(event) => onChange("firstName", event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Last name
              <input
                required
                autoComplete="family-name"
                value={form.lastName}
                onChange={(event) => onChange("lastName", event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          </div>
        )}

        <label className={FIELD_CLASS}>
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => onChange("email", event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        {creating && (
          <label className={FIELD_CLASS}>
            Phone
            <input
              required
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        )}

        <label className={FIELD_CLASS}>
          Password
          <input
            required
            minLength={8}
            type="password"
            autoComplete={creating ? "new-password" : "current-password"}
            value={form.password}
            onChange={(event) => onChange("password", event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        {creating && (
          <label className={FIELD_CLASS}>
            Confirm password
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={form.passwordConfirmation}
              onChange={(event) =>
                onChange("passwordConfirmation", event.target.value)
              }
              className={INPUT_CLASS}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <output className="mt-3 block text-sm text-emerald-700">
            {message}
          </output>
        )}

        <button
          type="submit"
          disabled={busy}
          className={PRIMARY_BUTTON_CLASS}
        >
          {busy
            ? "Please wait…"
            : creating
              ? CREATE_ACCOUNT_LABEL
              : SIGN_IN_LABEL}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onModeChange(creating ? "SIGN_IN" : "CREATE")}
          className={SECONDARY_BUTTON_CLASS}
        >
          {creating ? "Back to sign in" : CREATE_ACCOUNT_LABEL}
        </button>
      </form>
    </main>
  );
}

function ProfileCompletion({
  session,
  busy,
  error,
  onComplete,
  onLogout,
}: {
  session: Session;
  busy: boolean;
  error: string | null;
  onComplete: (profile: PublicAccountProfileInput) => void;
  onLogout: () => void;
}) {
  const initial = profileFromUser(session.user);
  const [firstName, setFirstName] = React.useState(
    initial?.firstName || textMetadata(session.user, "firstName"),
  );
  const [lastName, setLastName] = React.useState(
    initial?.lastName || textMetadata(session.user, "lastName"),
  );
  const [phone, setPhone] = React.useState(
    initial?.phone || session.user.phone || textMetadata(session.user, "phone"),
  );
  const email = session.user.email || "";

  return (
    <main className={PAGE_CLASS}>
      <form
        className={CARD_CLASS}
        onSubmit={(event) => {
          event.preventDefault();
          onComplete({ firstName, lastName, email, phone });
        }}
      >
        <h1 className="text-xl font-bold">Complete your Accounting profile</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your authenticated email is fixed. Add the remaining profile details
          to create your Foundation account.
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          First name
          <input
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className={FIELD_CLASS}>
          Last name
          <input
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className={FIELD_CLASS}>
          Email
          <input
            readOnly
            aria-readonly="true"
            value={email}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 p-2 text-slate-600"
          />
        </label>
        <label className={FIELD_CLASS}>
          Phone
          <input
            required
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className={PRIMARY_BUTTON_CLASS}
        >
          {busy ? "Preparing account…" : "Continue"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onLogout}
          className={SECONDARY_BUTTON_CLASS}
        >
          {SIGN_OUT_LABEL}
        </button>
      </form>
    </main>
  );
}


function SessionUnlock({
  email,
  busy,
  error,
  onUnlock,
  onSignOut,
}: {
  email: string;
  busy: boolean;
  error: string | null;
  onUnlock: (password: string) => void;
  onSignOut: () => void;
}) {
  const [password, setPassword] = React.useState("");

  return (
    <main className={PAGE_CLASS}>
      <form
        className={CARD_CLASS}
        onSubmit={(event) => {
          event.preventDefault();
          onUnlock(password);
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {ACCOUNTING_LABEL}
        </p>
        <h1 className="mt-1 text-2xl font-bold">Unlock Accounting</h1>
        <p className="mt-2 text-sm text-slate-500">
          This device is still signed in. Enter your password to unlock the app.
        </p>

        <label className={FIELD_CLASS}>
          Email
          <input
            readOnly
            aria-readonly="true"
            value={email}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 p-2 text-slate-600"
          />
        </label>

        <label className={FIELD_CLASS}>
          Password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={PRIMARY_BUTTON_CLASS}
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onSignOut}
          className={SECONDARY_BUTTON_CLASS}
        >
          {SIGN_OUT_LABEL}
        </button>
      </form>
    </main>
  );
}

export default function PublicAccountingApp() {
  const [session, setSession] = React.useState<Session | null | undefined>(
    undefined,
  );
  const [mode, setMode] = React.useState<AuthMode>("SIGN_IN");
  const [form, setForm] = React.useState<SignupForm>(emptySignupForm);
  const [busy, setBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authMessage, setAuthMessage] = React.useState<string | null>(null);
  const [account, setAccount] = React.useState<FoundationPublicAccount | null>(
    null,
  );
  const [organizations, setOrganizations] = React.useState<
    FoundationPublicOrganization[]
  >([]);
  const [model, setModel] = React.useState<FoundationPublishedModel | null>(null);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [portalError, setPortalError] = React.useState<string | null>(null);
  const [profileRequired, setProfileRequired] = React.useState(false);
  const [requireSignInOnOpen, setRequireSignInOnOpen] = React.useState(() =>
    readStorageFlag("local", REQUIRE_SIGN_IN_ON_OPEN_KEY),
  );
  const [appLocked, setAppLocked] = React.useState(false);

  const loadPortal = React.useCallback(async (activeSession: Session) => {
    setPortalLoading(true);
    setPortalError(null);
    setProfileRequired(false);
    try {
      let currentAccount = await getPublicAccount(activeSession.access_token);
      if (!currentAccount) {
        const profile = profileFromUser(activeSession.user);
        if (!profile) {
          setAccount(null);
          setOrganizations([]);
          setModel(null);
          setProfileRequired(true);
          return;
        }
        const created = await ensurePublicAccount(
          activeSession.access_token,
          profile,
        );
        currentAccount = created.account;
      }

      const [publishedModel, initialOrganizations] = await Promise.all([
        getPublishedAccountingModel(activeSession.access_token),
        getPublicOrganizations(activeSession.access_token),
      ]);
      setAccount(currentAccount);
      setModel(publishedModel);
      setOrganizations(initialOrganizations);
    } catch (error) {
      setPortalError(publicErrorMessage(error));
    } finally {
      setPortalLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    let restored = false;

    if (!isSupabaseConfigured) {
      setSession(null);
      setAuthError(AUTH_UNAVAILABLE);
      return () => {
        active = false;
      };
    }

    const restoreSession = async () => {
      try {
        const lockEnabled = readStorageFlag(
          "local",
          REQUIRE_SIGN_IN_ON_OPEN_KEY,
        );
        const unlockedThisSession = readStorageFlag(
          "session",
          SESSION_UNLOCKED_KEY,
        );

        const { data, error } = await supabase.auth.getSession();
        if (!active) return;

        if (error) {
          setAuthError(SESSION_UNAVAILABLE);
          setSession(null);
          setAppLocked(false);
          restored = true;
          return;
        }

        setSession(data.session);
        setAppLocked(
          Boolean(data.session && lockEnabled && !unlockedThisSession),
        );
        restored = true;
      } catch {
        if (!active) return;
        setAuthError(SESSION_UNAVAILABLE);
        setSession(null);
        setAppLocked(false);
        restored = true;
      }
    };

    void restoreSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active || !restored) return;
      setSession(next);
      if (!next) setAppLocked(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!session) {
      setAccount(null);
      setOrganizations([]);
      setModel(null);
      setProfileRequired(false);
      return;
    }
    if (appLocked) return;
    void loadPortal(session);
  }, [appLocked, loadPortal, session]);

  const logout = React.useCallback(() => {
    setPortalError(null);
    setAppLocked(false);
    writeStorageFlag("session", SESSION_UNLOCKED_KEY, false);
    void supabase.auth.signOut();
  }, []);

  const updateRequireSignInOnOpen = React.useCallback((enabled: boolean) => {
    setRequireSignInOnOpen(enabled);
    writeStorageFlag("local", REQUIRE_SIGN_IN_ON_OPEN_KEY, enabled);

    // Enabling the lock never interrupts the current session.
    // A newly opened browser/app session will require authentication.
    writeStorageFlag("session", SESSION_UNLOCKED_KEY, enabled);
    setAppLocked(false);
  }, []);

  const unlockSession = React.useCallback(
    async (password: string) => {
      const email = session?.user.email?.trim();
      if (!email || !password) {
        setAuthError("Password is required.");
        return;
      }

      setBusy(true);
      setAuthError(null);

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthError("Unable to unlock with that password.");
          return;
        }

        writeStorageFlag("session", SESSION_UNLOCKED_KEY, true);
        if (data?.session) setSession(data.session);
        setAppLocked(false);
      } catch {
        setAuthError(AUTH_UNAVAILABLE);
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  const completeProfile = React.useCallback(
    async (profile: PublicAccountProfileInput) => {
      if (!session) return;
      setBusy(true);
      setPortalError(null);
      try {
        await ensurePublicAccount(session.access_token, profile);
        await loadPortal(session);
      } catch (error) {
        setPortalError(publicErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
    [loadPortal, session],
  );

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    setAuthMessage(null);

    const email = form.email.trim();
    if (!email || !form.password) {
      setAuthError("Email and password are required.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "SIGN_IN") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        });
        if (error) {
          setAuthError("Unable to sign in with those credentials.");
          return;
        }
        writeStorageFlag("session", SESSION_UNLOCKED_KEY, true);
        if (data?.session) setSession(data.session);
        return;
      }

      if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
        setAuthError("First name, last name and phone are required.");
        return;
      }
      if (form.password !== form.passwordConfirmation) {
        setAuthError("Passwords do not match.");
        return;
      }
      if (form.password.length < 8) {
        setAuthError("Use a password with at least 8 characters.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/accounting`,
          data: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            phone: form.phone.trim(),
          },
        },
      });
      if (error) {
        setAuthError("Unable to create the account. Check the details and try again.");
        return;
      }
      if (data.session) {
        writeStorageFlag("session", SESSION_UNLOCKED_KEY, true);
        setSession(data.session);
        return;
      }
      setAuthMessage(
        "Account created. If email confirmation is enabled, confirm the email and then sign in.",
      );
      setMode("SIGN_IN");
      setForm((current) => ({
        ...emptySignupForm,
        email: current.email,
      }));
    } catch {
      setAuthError(AUTH_UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  };

  if (session === undefined) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-600">
        Checking your Accounting session…
      </main>
    );
  }

  if (appLocked && session) {
    return (
      <SessionUnlock
        email={session.user.email || ""}
        busy={busy}
        error={authError}
        onUnlock={(password) => void unlockSession(password)}
        onSignOut={logout}
      />
    );
  }

  if (!session) {
    return (
      <AuthForm
        mode={mode}
        form={form}
        busy={busy}
        message={authMessage}
        error={authError}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setAuthError(null);
          setAuthMessage(null);
          setForm(emptySignupForm);
        }}
        onChange={(field, value) =>
          setForm((current) => ({ ...current, [field]: value }))
        }
        onSubmit={submitAuth}
      />
    );
  }

  if (portalLoading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-600">
        Preparing your Accounting workspace…
      </main>
    );
  }

  if (profileRequired) {
    return (
      <ProfileCompletion
        session={session}
        busy={busy}
        error={portalError}
        onComplete={(profile) => void completeProfile(profile)}
        onLogout={logout}
      />
    );
  }

  if (portalError || !account) {
    return (
      <main className={PAGE_CLASS}>
        <section className="mx-auto w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold">Accounting unavailable</h1>
          <p role="alert" className="mt-3 text-sm text-red-700">
            {portalError || ACCOUNT_UNAVAILABLE}
          </p>
          <button
            type="button"
            onClick={() => void loadPortal(session)}
            className={SECONDARY_BUTTON_CLASS}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={logout}
            className={PRIMARY_BUTTON_CLASS}
          >
            {SIGN_OUT_LABEL}
          </button>
        </section>
      </main>
    );
  }

  if (account.identityLinkStatus === "LINKED" && model) {
    return (
      <AccountingPublicView
        mode="LIVE"
        version={model.publishedVersion}
        publicApi={createPublicLotteryAccountingClient(session.access_token)}
        onBack={logout}
        backLabel={SIGN_OUT_LABEL}
        viewerName={`${account.firstName} ${account.lastName}`.trim()}
        viewerOrbisId={account.orbisIdentityId || account.orbisDisplayId}
        localScope={{ ownerKind: "PUBLIC_USER", ownerId: account.id }}
        publicUserMode
        requireSignInOnOpen={requireSignInOnOpen}
        onRequireSignInOnOpenChange={updateRequireSignInOnOpen}
      />
    );
  }

  return (
    <PublishedWorkspace
      account={account}
      organizations={organizations}
      model={model}
      onLogout={logout}
    />
  );
}
