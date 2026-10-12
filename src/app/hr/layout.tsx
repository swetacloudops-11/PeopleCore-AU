import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUseHrConsole } from "@/lib/hr";
import HrConsoleLayout from "@/components/hr/HrConsoleLayout";
import { Toaster } from "@/components/Toaster";

export default async function HrProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Platform (super admin) accounts and org accounts without an HR-capable
  // role have no business here — send each to their own console.
  if (!session.organisationId) redirect(homeFor(session));
  if (!canUseHrConsole(session)) redirect(homeFor(session));

  const org = await prisma.organisation.findUnique({
    where: { id: session.organisationId },
    select: { name: true, status: true },
  });

  // A disabled organisation is locked out of its own console.
  if (!org || org.status === "DISABLED") {
    redirect("/login?error=organisation_disabled");
  }

  return (
    <HrConsoleLayout
      user={{ name: session.name, email: session.email, roles: session.roles }}
      orgName={org.name}
    >
      {children}
      <Toaster />
    </HrConsoleLayout>
  );
}
