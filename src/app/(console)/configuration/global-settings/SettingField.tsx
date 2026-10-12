"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingField({
  id,
  value,
  dataType,
  isSecret,
}: {
  id: string;
  value: string;
  dataType: string;
  isSecret: boolean;
}) {
  const router = useRouter();
  const [val, setVal] = useState(value);
  const [revealed, setRevealed] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: string) {
    if (next === value) return;
    setState("saving");
    try {
      const res = await fetch(`/api/settings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          className="input pr-9"
          type={isSecret && !revealed ? "password" : dataType === "number" ? "number" : "text"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => save(val)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            title={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? "🙈" : "👁"}
          </button>
        )}
      </div>
      <span className="w-14 shrink-0 text-right text-[11px] text-slate-400">
        {state === "saving" ? "…" : state === "saved" ? "✓" : state === "error" ? "✗" : ""}
      </span>
    </div>
  );
}
