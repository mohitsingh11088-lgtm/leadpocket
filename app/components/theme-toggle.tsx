"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const storageKey = "leadpocket-theme";

function subscribe(onChange: () => void) {
  window.addEventListener("leadpocket-theme-change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("leadpocket-theme-change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot() {
  return document.documentElement.dataset.theme === "dark";
}

function getServerSnapshot() {
  return false;
}

function setTheme(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event("leadpocket-theme-change"));
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    console.warn("Could not save the LeadPocket theme preference.");
  }
}

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span className="hidden sm:inline">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
