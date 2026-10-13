import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { answerQuestion, SUGGESTIONS } from "@/app/(console)/assistant/assistant-engine";
import { answerWithAI } from "@/app/(console)/assistant/tools";

const askSchema = z.object({
  question: z.string().min(1, "Ask a question").max(500, "That question is too long"),
});

/**
 * POST /api/assistant — answer platform-wide questions for a super admin.
 *
 * Uses a live LLM when configured, otherwise the built-in deterministic
 * engine. The question text is never persisted or logged.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (session.organisationId) {
    return NextResponse.json(
      { error: "This assistant is only available to platform administrators" },
      { status: 403 }
    );
  }

  const parsed = askSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid question" },
      { status: 422 }
    );
  }

  const firstName = session.name.split(" ")[0] ?? "there";
  const aiReply = await answerWithAI({ firstName }, parsed.data.question);
  if (aiReply) {
    return NextResponse.json({ ...aiReply, suggestions: SUGGESTIONS });
  }

  const reply = await answerQuestion(parsed.data.question);
  return NextResponse.json({ ...reply, suggestions: SUGGESTIONS });
}
