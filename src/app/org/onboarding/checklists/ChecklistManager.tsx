"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

type ChecklistForm = {
  name: string;
  description: string;
  roleCategory: string;
  isDefault: boolean;
  stage: "ONBOARDING" | "OFFBOARDING";
  taskTitles: string;
};

const EMPTY: ChecklistForm = {
  name: "",
  description: "",
  roleCategory: "",
  isDefault: false,
  stage: "ONBOARDING",
  taskTitles: "",
};

function ChecklistFields({
  form,
  setForm,
  showTasks,
}: {
  form: ChecklistForm;
  setForm: (f: ChecklistForm) => void;
  showTasks: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label">Name</label>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Warehouse Onboarding"
        />
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          className="input min-h-20"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What is this checklist for?"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Role category</label>
          <input
            className="input"
            value={form.roleCategory}
            onChange={(e) => setForm({ ...form, roleCategory: e.target.value })}
            placeholder="e.g. Warehouse"
          />
        </div>
        <div>
          <label className="label">Stage</label>
          <select
            className="input"
            value={form.stage}
            onChange={(e) =>
              setForm({ ...form, stage: e.target.value as "ONBOARDING" | "OFFBOARDING" })
            }
          >
            <option value="ONBOARDING">Onboarding</option>
            <option value="OFFBOARDING">Offboarding</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300"
        />
        Use as the default checklist for new starters
      </label>

      {showTasks && (
        <div>
          <label className="label">Task titles — one per line</label>
          <textarea
            className="input min-h-32 font-mono text-xs"
            value={form.taskTitles}
            onChange={(e) => setForm({ ...form, taskTitles: e.target.value })}
            placeholder={"Send signed contract\nCollect TFN declaration\nOrder laptop"}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Each line becomes an OnboardingTask template row you can assign later.
          </p>
        </div>
      )}
    </div>
  );
}

/** "New checklist" button + create modal (creates template task rows too). */
export default function ChecklistManager() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ChecklistForm>(EMPTY);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Checklist name is required");
      return;
    }
    const titles = form.taskTitles
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/org/checklists",
      "POST",
      {
        name: form.name.trim(),
        description: form.description.trim() || null,
        roleCategory: form.roleCategory.trim() || null,
        isDefault: form.isDefault,
        stage: form.stage,
        tasks: titles,
      }
    );
    setBusy(false);
    if (res.ok) {
      toast.success(`Checklist created${titles.length ? ` with ${titles.length} tasks` : ""}`);
      setOpen(false);
      setForm(EMPTY);
      router.refresh();
    }
  };

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New checklist
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New onboarding checklist"
        subtitle="Templates are stored against this organisation only."
        width="max-w-xl"
      >
        <ChecklistFields form={form} setForm={setForm} showTasks />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? "Creating…" : "Create checklist"}
          </button>
        </div>
      </Modal>
    </>
  );
}

/** Edit / delete actions for a checklist row. */
export function ChecklistRowActions({
  id,
  initial,
}: {
  id: string;
  initial: {
    name: string;
    description: string | null;
    roleCategory: string | null;
    isDefault: boolean;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState<ChecklistForm>({
    ...EMPTY,
    name: initial.name,
    description: initial.description ?? "",
    roleCategory: initial.roleCategory ?? "",
    isDefault: initial.isDefault,
  });

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Checklist name is required");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/checklists/${id}`, "PATCH", {
      name: form.name.trim(),
      description: form.description.trim() || null,
      roleCategory: form.roleCategory.trim() || null,
      isDefault: form.isDefault,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Checklist updated");
      setOpen(false);
      router.refresh();
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/checklists/${id}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      toast.success("Checklist deleted");
      setConfirming(false);
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn-secondary !px-2 !py-1 text-[11px]"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit checklist"
        subtitle="Task templates are managed from the Tasks list."
        width="max-w-xl"
      >
        <ChecklistFields form={form} setForm={setForm} showTasks={false} />

        <div className="mt-5 flex items-center justify-between gap-2">
          {!confirming ? (
            <button
              type="button"
              className="btn-danger !py-1.5 text-xs"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-600">Delete permanently?</span>
              <button
                type="button"
                className="btn-danger !py-1.5 text-xs"
                disabled={busy}
                onClick={remove}
              >
                Yes, delete
              </button>
              <button
                type="button"
                className="btn-secondary !py-1.5 text-xs"
                onClick={() => setConfirming(false)}
              >
                Keep
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
