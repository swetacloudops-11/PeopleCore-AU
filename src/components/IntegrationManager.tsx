"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

const CATEGORIES = ["ACCOUNTING", "BANKING", "PAYROLL", "HRIS", "IDENTITY", "CUSTOM"] as const;
const STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"] as const;

export type Integration = {
  id: string;
  key: string;
  name: string;
  provider: string;
  category: string;
  description: string | null;
  websiteUrl: string | null;
  docsUrl: string | null;
  isOfficial: boolean;
  status: string;
};

type Mode = { kind: "create" } | { kind: "edit"; integration: Integration };

const EMPTY = {
  key: "",
  name: "",
  provider: "",
  category: "CUSTOM" as string,
  description: "",
  websiteUrl: "",
  docsUrl: "",
  isOfficial: false,
  status: "ACTIVE" as string,
};

/**
 * Create/edit/deactivate dialog for integration connectors.
 *
 * Rows on the page dispatch `pc-integration-action` with
 * `{ kind: "edit" | "toggle", integration }` to drive this modal.
 */
export default function IntegrationManager({ showCreate }: { showCreate?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openCreate() {
    setForm(EMPTY);
    setError(null);
    setFieldErrors({});
    setMode({ kind: "create" });
  }

  function openEdit(i: Integration) {
    setForm({
      key: i.key,
      name: i.name,
      provider: i.provider,
      category: i.category,
      description: i.description ?? "",
      websiteUrl: i.websiteUrl ?? "",
      docsUrl: i.docsUrl ?? "",
      isOfficial: i.isOfficial,
      status: i.status,
    });
    setError(null);
    setFieldErrors({});
    setMode({ kind: "edit", integration: i });
  }

  async function toggle(i: Integration) {
    const next = i.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    const prompt =
      next === "ACTIVE"
        ? `Activate "${i.name}"?`
        : `Set "${i.name}" to INACTIVE?\n\nExisting mappings are preserved.`;
    if (!window.confirm(prompt)) return;

    const res = await apiCall(`/api/integrations/${i.id}`, "PATCH", { status: next });
    if (res.ok) {
      toast.success(next === "ACTIVE" ? `"${i.name}" activated` : `"${i.name}" deactivated`);
      router.refresh();
    }
  }

  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<{ kind: string; integration: Integration }>).detail;
      if (!detail?.integration) return;
      if (detail.kind === "edit") openEdit(detail.integration);
      else void toggle(detail.integration);
    };
    window.addEventListener("pc-integration-action", listener);
    return () => window.removeEventListener("pc-integration-action", listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      name: form.name.trim(),
      provider: form.provider.trim(),
      category: form.category,
      description: form.description.trim() || null,
      websiteUrl: form.websiteUrl.trim() || null,
      docsUrl: form.docsUrl.trim() || null,
      isOfficial: form.isOfficial,
      status: form.status,
      ...(mode?.kind === "create" ? { key: form.key.trim() } : {}),
    };

    const url =
      mode?.kind === "edit" ? `/api/integrations/${mode.integration.id}` : "/api/integrations";
    const method = mode?.kind === "edit" ? "PATCH" : "POST";

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      url,
      method,
      payload,
      { silent: true }
    );

    if (res.ok) {
      toast.success(mode?.kind === "edit" ? "Integration updated" : "Integration created");
      setMode(null);
      router.refresh();
      return;
    }

    if (res.data?.fields) setFieldErrors(res.data.fields);
    setError(res.data?.error ?? "Could not save integration");
    setBusy(false);
  }

  const err = (k: string) =>
    fieldErrors[k] ? <p className="mt-1 text-xs text-rose-600">{fieldErrors[k]}</p> : null;

  const set = (k: keyof typeof EMPTY) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const input = (k: keyof typeof EMPTY) => ({
    value: String(form[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value),
  });

  return (
    <>
      {showCreate && (
        <button type="button" onClick={openCreate} className="btn-primary">
          + New integration
        </button>
      )}

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode?.kind === "edit" ? `Edit ${mode.integration.name}` : "Create integration"}
        subtitle="Register a connector that organisations can map to."
        width="max-w-2xl"
      >
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="i-name">Display name *</label>
              <input id="i-name" className="input" {...input("name")} required />
              {err("name")}
            </div>
            <div>
              <label className="label" htmlFor="i-provider">Provider *</label>
              <input id="i-provider" className="input" placeholder="Xero" {...input("provider")} required />
              {err("provider")}
            </div>
          </div>

          {mode?.kind === "create" && (
            <div>
              <label className="label" htmlFor="i-key">Key *</label>
              <input
                id="i-key"
                className="input lowercase"
                placeholder="xero"
                {...input("key")}
                required
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Unique identifier. Lowercase letters, numbers and dashes.
              </p>
              {err("key")}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="i-cat">Category</label>
              <select
                id="i-cat"
                className="input"
                value={form.category}
                onChange={(e) => set("category")(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="i-status">Status</label>
              <select
                id="i-status"
                className="input"
                value={form.status}
                onChange={(e) => set("status")(e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="i-desc">Description</label>
            <textarea
              id="i-desc"
              className="input min-h-[70px] resize-y"
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="i-web">Website URL</label>
              <input id="i-web" type="url" className="input" placeholder="https://…" {...input("websiteUrl")} />
              {err("websiteUrl")}
            </div>
            <div>
              <label className="label" htmlFor="i-docs">Docs URL</label>
              <input id="i-docs" type="url" className="input" placeholder="https://…" {...input("docsUrl")} />
              {err("docsUrl")}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isOfficial}
              onChange={(e) => set("isOfficial")(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
            />
            Mark as an officially supported connector
          </label>

          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : mode?.kind === "edit" ? "Save changes" : "Create integration"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
