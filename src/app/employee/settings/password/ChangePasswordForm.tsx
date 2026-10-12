"use client";

import { useState } from "react";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFields({});

    // Client-side checks before hitting the API.
    const local: Record<string, string> = {};
    if (newPassword.length < 8) {
      local.newPassword = "New password must be at least 8 characters";
    }
    if (newPassword !== confirmPassword) {
      local.confirmPassword = "Passwords do not match";
    }
    if (currentPassword && newPassword === currentPassword) {
      local.newPassword = "New password must differ from your current password";
    }
    if (Object.keys(local).length > 0) {
      setFields(local);
      return;
    }

    setBusy(true);
    const res = await apiCall<{ fields?: Record<string, string>; error?: string }>(
      "/api/employee/password",
      "PATCH",
      { currentPassword, newPassword }
    );
    setBusy(false);

    if (res.ok) {
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else if (res.data?.fields) {
      setFields(res.data.fields);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">Change your password</h2>
      <p className="mt-1 text-xs text-slate-500">
        Enter your current password once, then choose a new one.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="pw-current">
            Current password
          </label>
          <input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          {fields.currentPassword && (
            <p className="mt-1 text-xs text-rose-600">{fields.currentPassword}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="pw-new">
            New password
          </label>
          <input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            className="input"
            value={newPassword}
            placeholder="At least 8 characters"
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          {fields.newPassword && (
            <p className="mt-1 text-xs text-rose-600">{fields.newPassword}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="pw-confirm">
            Confirm new password
          </label>
          <input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            className="input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          {fields.confirmPassword && (
            <p className="mt-1 text-xs text-rose-600">{fields.confirmPassword}</p>
          )}
        </div>
      </div>

      {fields.form && <p className="mt-3 text-xs text-rose-600">{fields.form}</p>}

      <div className="mt-5 flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
