"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "pc-theme";
const CHANGE_EVENT = "pc-theme-change";
type Pref = "light" | "dark" | "system";

function readPref(): Pref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** Applies a preference to <html> (where the dark rules are keyed off). */
function applyPref(pref: Pref) {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    if (readPref() === "system") {
      applyPref("system");
      onChange();
    }
  };
  const onEvent = () => onChange();
  mq.addEventListener("change", onMedia);
  window.addEventListener(CHANGE_EVENT, onEvent);
  return () => {
    mq.removeEventListener("change", onMedia);
    window.removeEventListener(CHANGE_EVENT, onEvent);
  };
}

// The class on <html> is the single source of truth: an inline script in the
// root layout sets it before paint, so this stays in sync without an effect.
function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

/**
 * Light/dark switch shown in every console topbar and on the login page.
 * Follows the OS preference until the user picks a side; the choice is kept
 * in localStorage.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Pref = getSnapshot() ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the in-session switch still works */
    }
    applyPref(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={
        className ??
        "grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
      }
    >
      <span className="sr-only">{label}</span>
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}
