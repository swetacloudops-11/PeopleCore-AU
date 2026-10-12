"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import { Badge } from "@/components/ui";

export type LeaveRuleDto = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  value: string;
  dataType: string;
  unit: string | null;
  isEnabled: boolean;
};

type State = "idle" | "saving" | "saved" | "error";

function RuleRow({ rule }: { rule: LeaveRuleDto }) {
  const router = useRouter();
  const [val, setVal] = useState(rule.value);
  const [state, setState] = useState<State>("idle");

  async function save(next: string) {
    if (next === rule.value) return;
    setState("saving");
    const res = await apiCall(`/api/org/leave-rules/${rule.id}`, "PATCH", { value: next });
    setState(res.ok ? "saved" : "error");
    if (res.ok) {
      toast.success(`Updated '${rule.name}'`);
      router.refresh();
    }
    setTimeout(() => setState("idle"), 1500);
  }

  async function toggle() {
    const res = await apiCall(`/api/org/leave-rules/${rule.id}`, "PATCH", {
      isEnabled: !rule.isEnabled,
    });
    if (res.ok) {
      toast.success(`${rule.isEnabled ? "Disabled" : "Enabled"} '${rule.name}'`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3.5 sm:px-5">
      <div className="min-w-[240px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{rule.name}</span>
          <Badge tone={rule.isEnabled ? "green" : "slate"}>
            {rule.isEnabled ? "ENABLED" : "DISABLED"}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{rule.description}</p>
        <code className="text-[11px] text-slate-400">{rule.key}</code>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="input !w-32"
          type={rule.dataType === "number" ? "number" : "text"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => save(val)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label={rule.name}
        />
        {rule.unit && <span className="text-xs text-slate-400">{rule.unit}</span>}
        <span className="w-10 shrink-0 text-right text-[11px] text-slate-400">
          {state === "saving" ? "…" : state === "saved" ? "✓" : state === "error" ? "✗" : ""}
        </span>
      </div>

      <button
        type="button"
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          rule.isEnabled ? "bg-emerald-500" : "bg-slate-300"
        }`}
        aria-pressed={rule.isEnabled}
        aria-label={`${rule.isEnabled ? "Disable" : "Enable"} ${rule.name}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            rule.isEnabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/** Editable list of this organisation's LeaveRule rows. */
export default function LeaveRuleList({ rules }: { rules: LeaveRuleDto[] }) {
  if (rules.length === 0) {
    return (
      <div className="card px-4 py-8 text-center text-sm text-slate-500">
        No leave rules have been configured for this organisation.
      </div>
    );
  }

  const enabled = rules.filter((r) => r.isEnabled).length;

  return (
    <div className="card divide-y divide-slate-100">
      <div className="flex items-center justify-between px-4 py-3 sm:px-5">
        <span className="text-xs text-slate-500">
          {enabled} of {rules.length} rules enabled
        </span>
        <span className="text-[11px] text-slate-400">Edit a value and click away to save</span>
      </div>
      {rules.map((r) => (
        <RuleRow key={r.id} rule={r} />
      ))}
    </div>
  );
}
