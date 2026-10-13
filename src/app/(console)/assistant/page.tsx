import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { aiStatus } from "@/lib/ai/llm";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import AssistantChat from "./AssistantChat";
import { SUGGESTIONS, CAPABILITIES } from "./assistant-engine";

export const dynamic = "force-dynamic";

export default async function PlatformAssistantPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Platform-only: organisation accounts belong in their own console.
  if (session.organisationId) redirect(homeFor(session));

  const ai = aiStatus();
  const greeting = session.name.split(" ")[0];

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        subtitle={
          ai.enabled
            ? "Live AI across every tenant — organisations, subscriptions, integrations, errors and platform health"
            : "Ask about the whole platform — organisations, subscriptions, revenue, integrations, errors, jobs and audit activity"
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span>{formatDate(new Date())}</span>
        <span>·</span>
        <span className="text-slate-500">Capable of answering:</span>
        {CAPABILITIES.slice(0, 6).map((c) => (
          <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
            {c}
          </span>
        ))}
      </div>

      <AssistantChat
        greeting={greeting}
        suggestions={SUGGESTIONS}
        aiEnabled={ai.enabled}
        aiModel={ai.model}
      />
    </div>
  );
}
