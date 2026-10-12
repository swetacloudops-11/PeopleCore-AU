"use client";

import { toast } from "@/components/Toaster";

/**
 * Shared fetch helper for console mutations. Returns the parsed body and
 * surfaces failures as toasts so callers stay terse.
 */
export async function apiCall<T = unknown>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  opts?: { silent?: boolean }
): Promise<{ ok: boolean; status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (!opts?.silent) toast.error("Network error — please try again");
    return { ok: false, status: 0, data: undefined as T };
  }

  const data = (await res.json().catch(() => ({}))) as T;

  if (!res.ok && !opts?.silent) {
    const msg = (data as { error?: string })?.error;
    toast.error(msg ?? `Request failed (${res.status})`);
  }

  return { ok: res.ok, status: res.status, data };
}
