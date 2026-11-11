"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    setErrorMessage("");

    try {
      const { error } = await createClient().auth.signOut();

      if (error) {
        throw error;
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "We could not sign you out."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={signOut}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
      >
        <LogOut size={15} />
        {busy ? "Signing out..." : "Sign out"}
      </button>
      {errorMessage && (
        <span role="alert" className="max-w-48 text-right text-xs text-red-600">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
