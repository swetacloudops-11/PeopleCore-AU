"use client";

import { useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

/**
 * Minimal event-driven toast bus. Components call `toast.success(...)` etc.
 * without needing a React context provider, so it can be used from anywhere.
 */
let seq = 0;
function emit(kind: ToastKind, message: string) {
  window.dispatchEvent(new CustomEvent("pc-toast", { detail: { id: ++seq, kind, message } }));
}

export const toast = {
  success: (m: string) => emit("success", m),
  error: (m: string) => emit("error", m),
  info: (m: string) => emit("info", m),
};

const TONE: Record<ToastKind, { wrap: string; icon: string; glyph: string }> = {
  success: { wrap: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: "bg-emerald-500", glyph: "✓" },
  error: { wrap: "border-rose-200 bg-rose-50 text-rose-800", icon: "bg-rose-500", glyph: "!" },
  info: { wrap: "border-sky-200 bg-sky-50 text-sky-800", icon: "bg-sky-500", glyph: "i" },
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((prev) => [...prev, t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 4000);
    };
    window.addEventListener("pc-toast", handler);
    return () => window.removeEventListener("pc-toast", handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
      {items.map((t) => {
        const tone = TONE[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] shadow-lg ${tone.wrap} animate-[pc-in_.18s_ease-out]`}
          >
            <span
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${tone.icon}`}
            >
              {tone.glyph}
            </span>
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="shrink-0 opacity-50 transition hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
      <style>{`@keyframes pc-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
