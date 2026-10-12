"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (next.length < 10) {
      setMsg({ type: "err", text: "New password must be at least 10 characters." });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "err", text: "New passwords do not match." });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/users/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data?.error ?? "Could not update password" });
        return;
      }
      setMsg({ type: "ok", text: "Password updated successfully." });
      setCurrent("");
      setNext("");
      setConfirm("");
      router.refresh();
    } catch {
      setMsg({ type: "err", text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-3">
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input
          id="current"
          type="password"
          className="input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="new">New password</label>
          <input
            id="new"
            type="password"
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
