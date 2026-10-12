"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Org = { id: string; name: string; status: string };
type Integration = { id: string; name: string; status: string };

export default function MappingCreateButton({
  organisations,
  integrations,
}: {
  organisations: Org[];
  integrations: Integration[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [organisationId, setOrganisationId] = useState("");
  const [integrationId, setIntegrationId] = useState("");
  const [status, setStatus] = useState("CONNECTED");
  const [externalAccountName, setExternalAccountName] = useState("");
  const [scopes, setScopes] = useState("read, write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setOrganisationId("");
    setIntegrationId("");
    setStatus("CONNECTED");
    setExternalAccountName("");
    setScopes("read, write");
    setError(null);
    setFieldErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      "/api/mappings",
      "POST",
      {
        organisationId,
        integrationId,
        status,
        externalAccountName: externalAccountName.trim() || null,
        externalAccountId: externalAccountName.trim() || null,
        scopes: scopes.split(",").map((s) => s.trim()).filter(Boolean),
      },
      { silent: true }
    );

    if (res.ok) {
      toast.success("Mapping created");
      setOpen(false);
      reset();
      router.refresh();
      return;
    }

    if (res.data?.fields) setFieldErrors(res.data.fields);
    setError(res.data?.error ?? "Could not create mapping");
    setBusy(false);
  }

  const err = (k: string) =>
    fieldErrors[k] ? <p className="mt-1 text-xs text-rose-600">{fieldErrors[k]}</p> : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="btn-primary"
      >
        + New mapping
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create integration mapping"
        subtitle="Connect an organisation to an integration provider."
      >
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="m-org">Organisation *</label>
            <select
              id="m-org"
              className="input"
              value={organisationId}
              onChange={(e) => setOrganisationId(e.target.value)}
              required
            >
              <option value="">Select an organisation…</option>
              {organisations.map((o) => (
                <option key={o.id} value={o.id} disabled={o.status === "DISABLED"}>
                  {o.name}
                  {o.status === "DISABLED" ? " (disabled)" : ""}
                </option>
              ))}
            </select>
            {err("organisationId")}
          </div>

          <div>
            <label className="label" htmlFor="m-int">Integration *</label>
            <select
              id="m-int"
              className="input"
              value={integrationId}
              onChange={(e) => setIntegrationId(e.target.value)}
              required
            >
              <option value="">Select an integration…</option>
              {integrations.map((i) => (
                <option key={i.id} value={i.id} disabled={i.status === "INACTIVE"}>
                  {i.name} — {i.status}
                </option>
              ))}
            </select>
            {err("integrationId")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="m-status">Initial status</label>
              <select
                id="m-status"
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="CONNECTED">Connected</option>
                <option value="PENDING">Pending</option>
                <option value="DISCONNECTED">Disconnected</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="m-acc">External account</label>
              <input
                id="m-acc"
                className="input"
                placeholder="e.g. Xero — Harbour Co"
                value={externalAccountName}
                onChange={(e) => setExternalAccountName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="m-scopes">Scopes</label>
            <input
              id="m-scopes"
              className="input"
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-400">Comma-separated list.</p>
          </div>

          <div className="flex gap-3 border-t border-slate-100 pt-4">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Creating…" : "Create mapping"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
