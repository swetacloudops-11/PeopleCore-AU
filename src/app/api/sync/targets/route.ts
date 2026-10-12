import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

/** Returns a small batch of active organisations eligible for a sync run. */
export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const organisations = await prisma.organisation.findMany({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, name: true },
  });

  return NextResponse.json({ organisations });
}
