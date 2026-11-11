"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPublicAppUrl } from "@/lib/public-app-url";

type AuthMode = "sign-in" | "sign-up" | "forgot-password";

function getAuthErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "We could not complete this request.";
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("429")
  ) {
    return "Email sending is temporarily rate-limited. Please wait before trying again. For reliable account and password emails, configure a custom SMTP provider in Supabase under Authentication → SMTP. Keep email confirmation enabled.";
  }

  return message;
}

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const authError = new URLSearchParams(window.location.search).get("error");
      if (authError === "configuration") {
        setErrorMessage(
          "Account verification is temporarily unavailable. Please try again later."
        );
      } else if (authError === "confirmation") {
        setErrorMessage(
          "That email confirmation link could not be verified. Request a new confirmation email and try again."
        );
      } else if (authError === "confirmation_expired") {
        setErrorMessage(
          "That email confirmation link has expired. Request a new confirmation email and try again."
        );
      } else if (authError === "recovery") {
        setErrorMessage(
          "That password reset link could not be verified. Request a new reset email and try again."
        );
      } else if (authError === "recovery_expired") {
        setErrorMessage(
          "That password reset link has expired. Request a new reset email and try again."
        );
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const supabase = createClient();

      if (mode === "forgot-password") {
        const appUrl = getPublicAppUrl();
        if (!appUrl) {
          throw new Error(
            "Password reset needs the public website URL. Add NEXT_PUBLIC_APP_URL to your app settings and redeploy."
          );
        }
        const redirectTo = new URL("/auth/callback", appUrl);
        redirectTo.searchParams.set("next", "/reset-password");
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: redirectTo.toString() }
        );

        if (error) {
          throw error;
        }

        setSuccessMessage(
          "If an account exists for that email, a password reset link has been sent."
        );
        return;
      } else if (mode === "sign-up") {
        const appUrl =
          getPublicAppUrl() ??
          (process.env.NODE_ENV !== "production" ? window.location.origin : null);
        if (!appUrl) {
          throw new Error(
            "Account confirmation needs the public website URL. Add NEXT_PUBLIC_APP_URL to your app settings and redeploy."
          );
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${appUrl}/auth/callback`,
            data: { full_name: name.trim() },
          },
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          setSuccessMessage(
            "Account created. Check your email to confirm your address, then sign in."
          );
          setMode("sign-in");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          throw error;
        }
      }

      const requestedPath = new URLSearchParams(window.location.search).get("next");
      const destination =
        requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
          ? requestedPath
          : "/";

      router.replace(destination);
      router.refresh();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
      <div className="mb-7 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Sparkles size={21} />
        </div>
        <div>
          <h1 className="text-xl font-bold">LeadPocket</h1>
          <p className="text-xs text-slate-500">A simpler CRM for your business</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight">
        {mode === "sign-in"
          ? "Welcome back"
          : mode === "sign-up"
            ? "Create your account"
            : "Reset your password"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {mode === "sign-in"
          ? "Sign in to manage your business leads."
          : mode === "sign-up"
            ? "Start organizing your customer relationships."
            : "Enter your email and we’ll send you a secure password reset link."}
      </p>

      {!configured && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Supabase is not connected yet. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code>, add your Supabase project URL and publishable
          key, then restart the development server.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "sign-up" && (
          <label className="block text-sm font-medium text-slate-700">
            Your name
            <input
              required
              minLength={2}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {mode !== "forgot-password" && (
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              required
              type="password"
              minLength={8}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {mode === "sign-up" && (
              <span className="mt-1 block text-xs font-normal text-slate-400">
                Use at least 8 characters.
              </span>
            )}
          </label>
        )}

        {errorMessage && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={!configured || busy}
          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Please wait..."
            : mode === "sign-in"
              ? "Sign in"
              : mode === "sign-up"
                ? "Create account"
                : "Send reset link"}
        </button>
      </form>

      {mode === "sign-in" && (
        <p className="mt-4 text-center text-sm">
          <button
            type="button"
            onClick={() => {
              setMode("forgot-password");
              setErrorMessage("");
              setSuccessMessage("");
            }}
            className="font-semibold text-blue-600 hover:text-blue-700"
          >
            Forgot password?
          </button>
        </p>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        {mode === "sign-in" || mode === "forgot-password"
          ? mode === "sign-in"
            ? "New to LeadPocket?"
            : "Remembered your password?"
          : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setErrorMessage("");
            setSuccessMessage("");
          }}
          className="font-semibold text-blue-600 hover:text-blue-700"
        >
          {mode === "sign-in" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </section>
  );
}
