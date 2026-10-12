import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { employeeApi } from "@/lib/employee-api";
import { answerQuestion, SUGGESTIONS } from "@/app/employee/assistant/assistant-engine";
import { answerWithAI } from "@/app/employee/assistant/tools";

const askSchema = z.object({
  question: z.string().min(1, "Ask a question").max(500, "That question is too long"),
});

async function employeeBrief(userId: string, organisationId: string) {
  const [employee, org] = await Promise.all([
    prisma.employee.findFirst({
      where: { userId, organisationId },
      select: { firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { name: true },
    }),
  ]);
  return {
    firstName: employee?.firstName ?? (userId ? "there" : "there"),
    lastName: employee?.lastName ?? "",
    employeeNumber: employee?.employeeNumber ?? "",
    orgName: org?.name ?? "your organisation",
  };
}

/**
 * POST /api/employee/assistant — answer a natural-language question using ONLY
 * the signed-in employee's own record.
 *
 * When an LLM provider is configured (AI_API_KEY / OPENAI_API_KEY /
 * ANTHROPIC_API_KEY) the question is answered by a live model with tools that
 * query this employee's data. Otherwise the built-in deterministic engine
 * answers, so the assistant works with or without a key.
 */
export async function POST(req: NextRequest) {
  const auth = await employeeApi();
  if (!auth.ok) return auth.response;

  const parsed = askSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid question" },
      { status: 422 }
    );
  }

  const session = auth.ctx.session;
  const brief = await employeeBrief(session.id, auth.ctx.organisationId);

  // Question text is never persisted or logged — only the answer is returned.
  const aiReply = await answerWithAI(
    {
      employeeId: auth.ctx.employeeId,
      userId: session.id,
      organisationId: auth.ctx.organisationId,
      orgName: brief.orgName,
      firstName: brief.firstName,
      lastName: brief.lastName,
      employeeNumber: brief.employeeNumber,
    },
    parsed.data.question
  );
  if (aiReply) {
    return NextResponse.json({ ...aiReply, suggestions: SUGGESTIONS });
  }

  const reply = await answerQuestion(
    {
      employeeId: auth.ctx.employeeId,
      userId: session.id,
      organisationId: auth.ctx.organisationId,
      firstName: brief.firstName,
    },
    parsed.data.question
  );
  return NextResponse.json({ ...reply, suggestions: SUGGESTIONS });
}
