import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { payrollApi } from "@/lib/payroll-api";
import { answerQuestion, SUGGESTIONS } from "@/app/payroll/assistant/assistant-engine";
import { answerWithAI } from "@/app/payroll/assistant/tools";

const askSchema = z.object({
  question: z.string().min(1, "Ask a question").max(500, "That question is too long"),
});

/**
 * POST /api/payroll/assistant — answer payroll questions with live data.
 *
 * Uses a live LLM when configured, otherwise the built-in deterministic
 * engine. The question text is never persisted or logged.
 */
export async function POST(req: NextRequest) {
  const auth = await payrollApi();
  if (!auth.ok) return auth.response;

  const parsed = askSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid question" },
      { status: 422 }
    );
  }

  const org = await prisma.organisation.findUnique({
    where: { id: auth.ctx.organisationId },
    select: { name: true },
  });

  const firstName = auth.ctx.session.name.split(" ")[0] ?? "there";
  const aiReply = await answerWithAI(
    { organisationId: auth.ctx.organisationId, orgName: org?.name ?? "your organisation", firstName },
    parsed.data.question
  );
  if (aiReply) {
    return NextResponse.json({ ...aiReply, suggestions: SUGGESTIONS });
  }

  const reply = await answerQuestion(auth.ctx.organisationId, parsed.data.question);
  return NextResponse.json({ ...reply, suggestions: SUGGESTIONS });
}
