"use client";

import { useRef, useState } from "react";
import { apiCall } from "@/lib/client-api";
import { toast } from "@/components/Toaster";

type Table = { headers: string[]; rows: string[][] } | null;

type Message = {
  role: "user" | "assistant";
  text: string;
  table?: Table;
  intent?: string;
};

type Reply = {
  answer?: string;
  table?: Table;
  intent?: string;
  error?: string;
};

const OPENING_TEXT_ON = (greeting: string) =>
  `Hi ${greeting}! I'm your employee assistant, powered by a live AI model connected to your own record. ` +
  "Ask me about your shifts, attendance, timesheets, leave balance, payslips, expenses, documents and tasks — " +
  "in any wording you like.\n\nI can also show you where things live in the portal — try \"Where do I apply for leave?\".";

const OPENING_TEXT_OFF =
  "Hi! I'm your employee assistant. Ask me about your own details — shifts, attendance, " +
  "timesheets, leave balance, payslips, expenses, documents and tasks.\n\n" +
  "I can also tell you where any portal feature lives — try \"Where do I apply for leave?\" " +
  "or \"How do I request a shift swap?\".";

export default function AssistantChat({
  greeting,
  suggestions,
  aiEnabled,
  aiModel,
}: {
  greeting: string;
  suggestions: string[];
  aiEnabled?: boolean;
  aiModel?: string | null;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: aiEnabled ? OPENING_TEXT_ON(greeting) : OPENING_TEXT_OFF },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setBusy(true);

    const res = await apiCall<Reply>(
      "/api/employee/assistant",
      "POST",
      { question: q },
      { silent: true }
    );
    setBusy(false);

    if (res.ok && res.data?.answer) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.data!.answer!,
          table: res.data!.table ?? null,
          intent: res.data!.intent,
        },
      ]);
    } else if (!res.ok && res.status !== 0) {
      toast.error(res.data?.error ?? "I couldn't process that question");
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  return (
    <div className="card flex h-[min(680px,72vh)] flex-col overflow-hidden">
      {/* Status header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 sm:px-6">
        <span className="text-xs font-semibold text-slate-700">🤖 Assistant</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            aiEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {aiEnabled ? `Live AI${aiModel ? ` · ${aiModel}` : ""}` : "Quick answers mode"}
        </span>
      </div>

      {/* Message list */}
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[min(680px,90%)] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-violet-600 text-white"
                  : "bg-slate-50 text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {m.role === "assistant" && i > 0 && (
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  🤖 Assistant
                  {m.intent && m.intent !== "unknown" && (
                    <span className="rounded-full bg-slate-200 px-1.5 py-0.5 normal-case tracking-normal text-slate-500">
                      {m.intent.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              )}
              <div className="whitespace-pre-line">{m.text}</div>

              {m.table && m.table.rows.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        {m.table.headers.map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {m.table.rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-slate-50/70">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 text-xs text-slate-600">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-400 ring-1 ring-slate-200">
              <span className="inline-flex gap-1">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce [animation-delay:.15s]">●</span>
                <span className="animate-bounce [animation-delay:.3s]">●</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      <div className="border-t border-slate-100 px-4 pb-2 pt-3 sm:px-6">
        <div className="flex flex-wrap gap-1.5">
          <span className="py-1 text-[11px] text-slate-400">Try:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              disabled={busy}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-6"
      >
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask something, ${greeting}…`}
          aria-label="Your question"
          disabled={busy}
        />
        <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
