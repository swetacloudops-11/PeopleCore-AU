"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Option = { id: string; name: string };

export type TeamRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  departmentId: string | null;
};

export function TeamActions({
  team,
  departments,
}: {
  team?: TeamRow;
  departments: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: team?.name ?? "",
    code: team?.code ?? "",
    description: team?.description ?? "",
    departmentId: team?.departmentId ?? "",
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      team ? `/api/org/org-units/${team.id}?kind=TEAM` : "/api/org/org-units",
      team ? "PATCH" : "POST",
      { kind: "TEAM", ...form }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success(team ? "Team updated" : "Team created");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={team ? "text-xs font-medium text-slate-600 hover:text-slate-900" : "btn-primary"}
        onClick={() => setOpen(true)}
      >
        {team ? "Edit" : "+ New team"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={team ? `Edit ${team.name}` : "New team"}
        subtitle="Teams sit inside departments and share rosters and work."
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="label">Team name</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            {errors.name && <span className="mt-1 block text-[11px] text-rose-600">{errors.name}</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Code</span>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. TEAM-1"
              />
            </label>
            <label className="block">
              <span className="label">Department</span>
              <select
                className="input"
                value={form.departmentId}
                onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
              >
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {errors.departmentId && (
                <span className="mt-1 block text-[11px] text-rose-600">{errors.departmentId}</span>
              )}
            </label>
          </div>
          <label className="block">
            <span className="label">Description</span>
            <textarea
              rows={3}
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : team ? "Save changes" : "Create team"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteTeamButton({ team }: { team: TeamRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete team "${team.name}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/org/org-units/${team.id}?kind=TEAM`,
      "DELETE"
    );
    setBusy(false);
    if (!res.ok) return;
    toast.success("Team deleted");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="text-xs font-medium text-rose-600 hover:text-rose-800 disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
