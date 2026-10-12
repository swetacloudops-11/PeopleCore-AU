"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Props = {
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Label shown on the button at rest. */
  children: React.ReactNode;
  /** Optional confirmation prompt before firing. */
  confirm?: string;
  /** Toast shown on success. */
  successMessage?: string;
  className?: string;
  disabled?: boolean;
  /** Refresh the current route after a successful call. */
  refresh?: boolean;
  onDone?: () => void;
};

/**
 * Self-contained button that performs an API mutation with optional
 * confirmation, busy state, toast feedback and router refresh.
 */
export default function ActionButton({
  url,
  method = "PATCH",
  body,
  children,
  confirm: confirmText,
  successMessage,
  className = "btn-secondary",
  disabled,
  refresh = true,
  onDone,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;

    setBusy(true);
    try {
      const res = await apiCall(url, method, body);
      if (res.ok) {
        if (successMessage) toast.success(successMessage);
        if (refresh) router.refresh();
        onDone?.();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || disabled}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {busy ? (
        <span className="inline-flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Working…
        </span>
      ) : (
        children
      )}
    </button>
  );
}
