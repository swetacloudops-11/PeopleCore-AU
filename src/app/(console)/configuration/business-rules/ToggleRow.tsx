"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  dataType: string;
  initialValue: string;
  enabled: boolean;
  readOnly: boolean;
};

export default function ToggleRow({ id, dataType, initialValue, enabled, readOnly }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function persist(next: { value?: string; isEnabled?: boolean }) {
    if (readOnly) return;
    setState("saving");
    try {
      const res = await fetch(`/api/business-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
    }
  }

  if (readOnly) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        {initialValue}
      </div>
    );
  }

  if (dataType === "BOOLEAN") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : state === "error" ? "Failed ✗" : isEnabled ? "Enabled" : "Disabled"}
        </span>
        <button
          type="button"
          disabled={state === "saving"}
          onClick={() => {
            const next = !isEnabled;
            setIsEnabled(next);
            persist({ isEnabled: next });
          }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            isEnabled ? "bg-indigo-600" : "bg-slate-300"
          }`}
          aria-pressed={isEnabled}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full pc-knob shadow transition-transform ${
              isEnabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    );
  }

  const isNumber = dataType === "NUMBER";

  return (
    <div className="flex items-center gap-2">
      <input
        className="input"
        type={isNumber ? "number" : "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value !== initialValue) persist({ value });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLInputElement).blur) {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="w-16 shrink-0 text-right text-[11px] text-slate-400">
        {state === "saving" ? "…" : state === "saved" ? "Saved ✓" : state === "error" ? "✗" : ""}
      </span>
    </div>
  );
}
