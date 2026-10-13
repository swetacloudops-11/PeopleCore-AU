"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NotificationToggle({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function toggle() {
    const next = !isEnabled;
    setIsEnabled(next);
    setState("saving");
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: next }),
      });
      if (!res.ok) throw new Error();
      setState("idle");
      router.refresh();
    } catch {
      setIsEnabled(!next);
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">
        {state === "saving" ? "Saving…" : state === "error" ? "Failed ✗" : isEnabled ? "Enabled" : "Disabled"}
      </span>
      <button
        type="button"
        disabled={state === "saving"}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          isEnabled ? "bg-indigo-600" : "bg-slate-300"
        }`}
        aria-pressed={isEnabled}
        aria-label={isEnabled ? "Disable notification" : "Enable notification"}
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
