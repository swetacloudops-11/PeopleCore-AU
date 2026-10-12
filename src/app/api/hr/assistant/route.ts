import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { orgApi } from "@/lib/org-api";
import { answerQuestion, SUGGESTIONS } from "@/app/hr/assistant/assistant-engine";
import { answerWithAI } from "@/app/hr/assistant/tools";

const askSchema = z.object({
  question: z.string().min(1, "Ask a question").max(500, "That question is too long"),
});

/**
 * POST /api/hr/assistant — answer HR questions with live organisation data.
 *
 * Uses a live LLM when configured (AI_API_KEY / OPENAI_API_KEY /
 * ANTHROPIC_API_KEY), otherwise the built-in deterministic engine.
 * Question text is never persisted or logged — only the answer is returned.
 */
export async function POST(req: NextRequest) {
  const auth = await hrApiWithUser();
  if (!auth.ok) return auth.response;

  const parsed = askSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid question" },
      { status: 422 }
    );
  }

  const firstName = auth.session.name.split(" ")[0] ?? "there";
  const aiReply = await answerWithAI(
    { organisationId: auth.organisationId, orgName: auth.orgName, firstName },
    parsed.data.question
  );
  if (aiReply) {
    return NextResponse.json({ ...aiReply, suggestions: SUGGESTIONS });
  }

  const reply = await answerQuestion(auth.organisationId, parsed.data.question);
  return NextResponse.json({ ...reply, suggestions: SUGGESTIONS });
}

/** orgApi guard + the org name for the system prompt. */
async function hrApiWithUser() {
  const auth = await orgApi();
  if (!auth.ok) return auth;
  const org = await prisma.organisation.findUnique({
    where: { id: auth.ctx.organisationId },
    select: { name: true },
  });
  return {
    ok: true as const,
    organisationId: auth.ctx.organisationId,
    session: auth.ctx.session,
    orgName: org?.name ?? "your organisation",
  };
}
