"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";

/**
 * A single editable settings row. `entity` lets the row point at either an
 * OrgSetting or a LeaveRule — the API resolves which table the id belongs to.
 */
export type SettingRow = {
  id: string;
  key: string;
  label: string;
  value: string;
  dataType: string;
  isSecret?: boolean;
  description?: string | null;
  unit?: string | null;
  entity?: "setting" | "leaveRule";
  enabled?: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

/** Batch PATCH helper — never echoes secrets back from the server. */
async function patchUpdates(updates: Array<{ id: string; value: string }>) {
  const res = await fetch("/api/hr/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  const data = (await res.json().catch(() => ({}))) as { fields?: Record<string, string> };
  return { ok: res.ok, fields: data.fields };
}

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
  const [val, setVal] = useState(isSecret ? "" : row.value);
  const [state, setState] = useState<SaveState>("idle");

  async function save(next: string) {
    if (!isSecret && next === row.value) return;
    if (isSecret && next === "") return;
    setState("saving");
    const res = await patchUpdates([{ id: row.id, value: next }]);
    setState(res.ok ? "saved" : "error");
    if (res.ok) {
      if (isSecret) setVal("");
      router.refresh();
    }
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
            on ? "bg-sky-500" : "bg-slate-300"
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
        <span className={`text-xs font-medium ${on ? "text-sky-700" : "text-slate-400"}`}>
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
      {row.unit && <span className="text-xs text-slate-400">{row.unit}</span>}
      <StatusDot state={state} />
    </div>
  );
}

function AddSetting({ group }: { group: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [dataType, setDataType] = useState("string");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    const res = await fetch("/api/hr/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ create: { group, key, label, value, dataType } }),
    });
    const data = (await res.json().catch(() => ({}))) as { fields?: Record<string, string> };
    setBusy(false);
    if (res.ok) {
      setKey("");
      setLabel("");
      setValue("");
      setOpen(false);
      router.refresh();
    } else if (data.fields) {
      setFields(data.fields);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary !py-1.5 text-xs" onClick={() => setOpen(true)}>
        + Add setting
      </button>
    );
  }

  return (
    <form onSubmit={create} className="card space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label">Key</label>
          <input
            className="input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="hr:my_setting"
          />
          {fields.key && <p className="mt-1 text-xs text-rose-600">{fields.key}</p>}
        </div>
        <div>
          <label className="label">Label</label>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My setting"
          />
          {fields.label && <p className="mt-1 text-xs text-rose-600">{fields.label}</p>}
        </div>
        <div>
          <label className="label">Value</label>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} />
          {fields.value && <p className="mt-1 text-xs text-rose-600">{fields.value}</p>}
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={dataType} onChange={(e) => setDataType(e.target.value)}>
            <option value="string">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Toggle</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy || !key || !label}>
          {busy ? "Adding…" : "Add setting"}
        </button>
      </div>
    </form>
  );
}

/**
 * Shared editor for the HR console. Boolean settings render as toggles,
 * secrets are masked and never echoed back after a save. Rows may be either
 * OrgSetting or LeaveRule records.
 */
export default function SettingsForm({
  settings,
  group,
  allowAdd = true,
}: {
  settings: SettingRow[];
  group: string;
  allowAdd?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {settings.length} setting{settings.length === 1 ? "" : "s"} in group{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{group}</code>
        </p>
        {allowAdd && <AddSetting group={group} />}
      </div>

      {settings.length === 0 ? (
        <div className="card px-4 py-8 text-center text-sm text-slate-500">
          No settings in this group yet{allowAdd ? " — add the first one above." : "."}
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
                  {s.entity === "leaveRule" && (
                    <Badge tone={s.enabled ? "green" : "slate"}>
                      {s.enabled ? "ENABLED" : "DISABLED"}
                    </Badge>
                  )}
                </div>
                {s.description && <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>}
                <code className="mt-0.5 block text-[11px] text-slate-400">{s.key}</code>
              </div>

              <div className="w-full sm:w-80">
                <SettingField row={s} />
                {s.isSecret && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Stored securely — masked on screen, never echoed back.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
