"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export type LocationRow = {
  id: string;
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  timezone: string;
  isRemote: boolean;
  isDefault: boolean;
};

const TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Australia/Darwin",
  "Australia/Hobart",
];

export function LocationActions({ location }: { location?: LocationRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: location?.name ?? "",
    addressLine1: location?.addressLine1 ?? "",
    city: location?.city ?? "",
    state: location?.state ?? "",
    postcode: location?.postcode ?? "",
    timezone: location?.timezone ?? "Australia/Sydney",
    isRemote: location?.isRemote ?? false,
    isDefault: location?.isDefault ?? false,
  });

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const res = await apiCall<{ error?: string; fields?: Record<string, string> }>(
      location ? `/api/org/org-units/${location.id}?kind=LOCATION` : "/api/org/org-units",
      location ? "PATCH" : "POST",
      { kind: "LOCATION", ...form }
    );
    setBusy(false);
    if (!res.ok) {
      setErrors(res.data?.fields ?? {});
      return;
    }
    toast.success(location ? "Location updated" : "Location created");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={location ? "text-xs font-medium text-slate-600 hover:text-slate-900" : "btn-primary"}
        onClick={() => setOpen(true)}
      >
        {location ? "Edit" : "+ New location"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={location ? `Edit ${location.name}` : "New location"}
        subtitle="Work sites and remote regions your employees are based at."
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="label">Location name</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            {errors.name && <span className="mt-1 block text-[11px] text-rose-600">{errors.name}</span>}
          </label>
          <label className="block">
            <span className="label">Address</span>
            <input
              className="input"
              value={form.addressLine1}
              onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
              placeholder="Street address"
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="label">City</span>
              <input
                className="input"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="label">State</span>
              <input
                className="input"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                placeholder="WA"
              />
            </label>
            <label className="block">
              <span className="label">Postcode</span>
              <input
                className="input"
                value={form.postcode}
                onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Timezone</span>
            <select
              className="input"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isRemote}
                onChange={(e) => setForm((f) => ({ ...f, isRemote: e.target.checked }))}
              />
              Remote location
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              Default for new employees
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : location ? "Save changes" : "Create location"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteLocationButton({ location }: { location: LocationRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete location "${location.name}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await apiCall<{ error?: string }>(
      `/api/org/org-units/${location.id}?kind=LOCATION`,
      "DELETE"
    );
    setBusy(false);
    if (!res.ok) return;
    toast.success("Location deleted");
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
