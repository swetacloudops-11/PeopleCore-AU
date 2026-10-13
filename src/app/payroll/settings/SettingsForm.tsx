"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { Badge } from "@/components/ui";

export type SettingRow = {
  id: string;
  key: string;
  label: string;
  value: string;
  dataType: string;
  isSecret?: boolean;
  group?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function StatusDot({ state }: { state: SaveState }) {
  return (
    <span className="w-8 shrink-0 text-right text-[11px] text-slate-400">
      {state === "saving" ? "…" : state === "saved" ? "✓" : state === "error" ? "✗" : ""}
    </span>
  );
}

function SettingField({ row }: { row: SettingRow }) {
  const router = useRouter();
  const isBool = row.dataType === "boolean";
  const isSecret = Boolean(row.isSecret);
  const [val, setVal] = useState(row.value);
  const [state, setState] = useState<SaveState>("idle");

  async function save(next: string) {
    if (!isSecret && next === row.value) return;
    setState("saving");
    const res = await apiCall(
      "/api/payroll/settings",
      "PATCH",
      { updates: [{ id: row.id, value: next }] },
      { silent: true }
    );
    setState(res.ok ? "saved" : "error");
    if (res.ok) router.refresh();
    setTimeout(() => setState("idle"), 1500);
  }

  if (isBool) {
    const on = row.value === "true";
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => save(on ? "false" : "true")}
          className={`relative h-6 w-11 rounded-full transition ${
            on ? "bg-amber-500" : "bg-slate-300"
          }`}
          aria-pressed={on}
          aria-label={row.label}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
              on ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
        <span className={`text-xs font-medium ${on ? "text-amber-700" : "text-slate-400"}`}>
          {on ? "Enabled" : "Disabled"}
        </span>
        <StatusDot state={state} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="input"
        type={isSecret ? "password" : row.dataType === "number" ? "number" : "text"}
        value={val}
        placeholder={isSecret ? "••••••••" : undefined}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => save(val)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={row.label}
      />
      <StatusDot state={state} />
    </div>
  );
}

/**
 * Shared editor for the Payroll console's OrgSetting rows. Boolean settings
 * render as toggles; text and numeric values save on blur. Changes are sent to
 * the batched PATCH endpoint and the page is refreshed.
 */
export default function SettingsForm({
  settings,
  title = "payroll",
}: {
  settings: SettingRow[];
  title?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {settings.length} setting{settings.length === 1 ? "" : "s"} in{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{title}</code>
      </p>

      {settings.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-slate-500">
          No settings to show here yet.
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {settings.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5 sm:px-5">
              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{s.label}</span>
                  {s.isSecret && <Badge tone="amber">SECRET</Badge>}
                  {s.dataType === "boolean" && <Badge tone="slate">TOGGLE</Badge>}
                </div>
                <code className="mt-0.5 block text-[11px] text-slate-400">{s.key}</code>
              </div>

              <div className="w-full sm:w-80">
                <SettingField row={s} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
