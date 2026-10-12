import { employeeContext } from "@/lib/employee";
import { aiStatus } from "@/lib/ai/llm";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import AssistantChat from "./AssistantChat";
import { SUGGESTIONS, CAPABILITIES } from "./assistant-engine";

export const dynamic = "force-dynamic";

export default async function EmployeeAssistantPage() {
  const { employee, org } = await employeeContext();
  const ai = aiStatus();

  return (
    <div>
      <PageHeader
        title="AI Assistant"
        subtitle={
          ai.enabled
            ? `Live AI connected to your own record at ${org.name} — ask anything, in any wording`
            : `Ask about your shifts, leave, payslips, tasks and documents at ${org.name} — answers come from your own record only`
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
        greeting={employee.firstName}
        suggestions={SUGGESTIONS}
        aiEnabled={ai.enabled}
        aiModel={ai.model}
      />
    </div>
  );
}
