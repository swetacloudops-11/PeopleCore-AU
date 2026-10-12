"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";
import Modal from "@/components/Modal";

type PolicyForm = {
  title: string;
  category: string;
  content: string;
  version: string;
  effectiveDate: string;
  reviewDate: string;
  isMandatory: boolean;
};

const CATEGORIES = ["Governance", "Safety", "Employment", "Finance", "IT", "General"];

const EMPTY: PolicyForm = {
  title: "",
  category: "General",
  content: "",
  version: "1.0",
  effectiveDate: "",
  reviewDate: "",
  isMandatory: false,
};

function PolicyFields({ form, setForm }: { form: PolicyForm; setForm: (f: PolicyForm) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Remote Working Policy"
          />
        </div>
        <div>
          <label className="label">Category</label>
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Content</label>
        <textarea
          className="input min-h-40 font-mono text-xs"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder={"# Policy title\n\nDescribe the policy…"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Version</label>
          <input
            className="input"
            value={form.version}
            onChange={(e) => setForm({ ...form, version: e.target.value })}
            placeholder="1.0"
          />
        </div>
        <div>
          <label className="label">Effective date</label>
          <input
            type="date"
            className="input"
            value={form.effectiveDate}
            onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Review date</label>
          <input
            type="date"
            className="input"
            value={form.reviewDate}
            onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={form.isMandatory}
          onChange={(e) => setForm({ ...form, isMandatory: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300"
        />
        Mandatory — every employee must acknowledge it
      </label>
    </div>
  );
}

/** "New policy" button + create modal. */
export function NewPolicyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<PolicyForm>(EMPTY);

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim() || !form.effectiveDate) {
      toast.error("Title, content and effective date are required");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ error?: string }>("/api/org/policies", "POST", {
      title: form.title.trim(),
      category: form.category,
      content: form.content,
      version: form.version.trim() || "1.0",
      effectiveDate: form.effectiveDate,
      reviewDate: form.reviewDate || null,
      isMandatory: form.isMandatory,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Policy created");
      setOpen(false);
      setForm(EMPTY);
      router.refresh();
    }
  };

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + New policy
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create policy"
        subtitle="Publish it to generate acknowledgement tasks for staff."
        width="max-w-2xl"
      >
        <PolicyFields form={form} setForm={setForm} />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? "Creating…" : "Create policy"}
          </button>
        </div>
      </Modal>
    </>
  );
}

/** Edit / publish / delete actions for a policy row. */
export function PolicyRowActions({
  id,
  initial,
  ackCount,
}: {
  id: string;
  initial: {
    title: string;
    category: string;
    content: string;
    version: string;
    effectiveDate: string;
    reviewDate: string;
    isMandatory: boolean;
  };
  ackCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState<PolicyForm>({ ...EMPTY, ...initial });

  const save = async () => {
    if (!form.title.trim() || !form.content.trim() || !form.effectiveDate) {
      toast.error("Title, content and effective date are required");
      return;
    }
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/policies/${id}`, "PATCH", {
      action: "update",
      title: form.title.trim(),
      category: form.category,
      content: form.content,
      version: form.version.trim() || "1.0",
      effectiveDate: form.effectiveDate,
      reviewDate: form.reviewDate || null,
      isMandatory: form.isMandatory,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Policy updated");
      setOpen(false);
      router.refresh();
    }
  };

  const publish = async () => {
    setBusy(true);
    const res = await apiCall<{ error?: string; created?: number }>(
      `/api/org/policies/${id}`,
      "PATCH",
      { action: "publish" }
    );
    setBusy(false);
    if (res.ok) {
      toast.success(
        res.data?.created
          ? `Published — ${res.data.created} acknowledgements issued`
          : "Published — no new acknowledgements needed"
      );
      router.refresh();
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await apiCall<{ error?: string }>(`/api/org/policies/${id}`, "DELETE");
    setBusy(false);
    if (res.ok) {
      toast.success("Policy deleted");
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
      <button
        type="button"
        className="btn-primary !px-2 !py-1 text-[11px]"
        disabled={busy}
        onClick={publish}
      >
        Publish
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit policy"
        subtitle="Bump the version when you change the content."
        width="max-w-2xl"
      >
        <PolicyFields form={form} setForm={setForm} />

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
              <span className="text-xs text-rose-600">
                Delete and drop {ackCount} acknowledgement{ackCount === 1 ? "" : "s"}?
              </span>
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
