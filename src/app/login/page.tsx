"use client";

import { useState, Suspense, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
  children,
}: {
  id: string;
  label?: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  error?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          aria-invalid={error || undefined}
          className={`h-11 w-full rounded-lg border bg-white pl-10 pr-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 ${
            error
              ? "border-rose-400 ring-2 ring-rose-100 focus:border-rose-500 focus:ring-rose-100"
              : "border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          }`}
        />
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-slate-400">
          {autoComplete === "username" ? (
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
        </span>
        {children}
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("super@jabit.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (!email.trim()) {
      setFieldError("email");
      setError("Please enter your email address");
      return;
    }
    if (!password) {
      setFieldError("password");
      setError("Please enter your password");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error ?? "Unable to sign in");
          setFieldError(res.status === 401 ? "password" : null);
          return;
        }

        // Honour an explicit ?next= only when it matches the role we just
        // signed in as; otherwise fall back to that role's landing page.
        const landing: string = data.destination ?? "/dashboard";
        const requested = params.get("next");
        const sameArea = requested && landing.startsWith("/org") === requested.startsWith("/org");
        router.replace((sameArea ? requested : landing) ?? landing);
        router.refresh();
      } catch {
        setError("Network error — please try again");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field
        id="email"
        label="Email address"
        type="email"
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (fieldError === "email") {
            setFieldError(null);
            setError(null);
          }
        }}
        autoComplete="username"
        placeholder="you@company.com"
        error={fieldError === "email"}
      />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="block text-[13px] font-medium text-slate-700">
            Password
          </label>
          <span className="text-[12px] text-slate-400">Forgot password?</span>
        </div>
        <Field
          id="password"
          label=""
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (fieldError === "password") {
              setFieldError(null);
              setError(null);
            }
          }}
          autoComplete="current-password"
          placeholder="Enter your password"
          error={fieldError === "password"}
        >
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-600"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </Field>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700"
        >
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13px] text-slate-600">
        <input
          type="checkbox"
          defaultChecked
          className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
        />
        Keep me signed in for 12 hours
      </label>

      <button
        type="submit"
        disabled={busy}
        className="group relative h-11 w-full overflow-hidden rounded-lg bg-indigo-600 text-[15px] font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={busy ? "opacity-0" : ""}>Sign in to console</span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Signing in…
          </span>
        )}
      </button>
    </form>
  );
}

const FEATURES = [
  "Full lifecycle management for every tenant organisation",
  "Real-time integration health across 14 connectors",
  "Immutable audit trail on every privileged action",
  "Granular role and permission controls",
];

export default function LoginPage() {
  return (
    <div className="pc-scope relative flex min-h-screen bg-slate-50">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50" />
      </div>
      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <div className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:w-[52%] lg:flex-col lg:justify-between xl:w-[55%]">
        {/* Decorative glows */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-52 -right-32 h-[520px] w-[520px] rounded-full bg-violet-600/25 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative z-10 px-12 pt-12 xl:px-16 xl:pt-16">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-500 text-base font-bold text-white shadow-lg shadow-indigo-500/30">
              PC
            </span>
            <div className="leading-tight">
              <div className="text-[17px] font-semibold tracking-tight text-white">
                PeopleCore AU
              </div>
              <div className="text-[13px] text-slate-400">Platform Administration</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 px-12 pb-4 xl:px-16">
          <h1 className="max-w-lg text-[40px] font-semibold leading-[1.1] tracking-tight text-white xl:text-[46px]">
            One console for the
            <span className="block bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              entire platform.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-400">
            Organisations, subscriptions, integrations, security and diagnostics —
            governed centrally with a complete record of every change.
          </p>

          <ul className="mt-8 space-y-3.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-[14px] text-slate-300">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-500/20 text-indigo-300">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-6 border-t border-white/10 px-12 py-6 text-[12px] text-slate-500 xl:px-16">
          <span>© 2026 PeopleCore AU</span>
          <span className="h-3 w-px bg-white/15" />
          <span>Australian data residency</span>
          <span className="h-3 w-px bg-white/15" />
          <span>SOC 2 aligned</span>
        </div>
      </div>

      {/* ── Form panel ──────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <div className="flex items-center gap-3 px-6 pt-8 lg:hidden">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
            PC
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-slate-900">PeopleCore AU</div>
            <div className="text-[12px] text-slate-500">Platform Administration</div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[400px]">
            <div className="mb-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                All systems operational
              </div>
              <h2 className="text-[28px] font-semibold tracking-tight text-slate-900">
                Welcome back
              </h2>
              <p className="mt-1.5 text-[14px] text-slate-500">
                Sign in with your platform administrator credentials to continue.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] sm:p-7">
              <Suspense>
                <LoginForm />
              </Suspense>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white/60 px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div className="text-[12px] leading-relaxed text-slate-500">
                  <span className="font-medium text-slate-700">Restricted access.</span>{" "}
                  Authorised personnel only. Every sign-in and privileged action is
                  recorded in the immutable audit log.
                </div>
              </div>
            </div>

            <p className="mt-6 text-center text-[12px] text-slate-400">
              Need access? Contact your organisation owner.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
