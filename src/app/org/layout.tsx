import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OrgConsoleLayout from "@/components/org/OrgConsoleLayout";
import { Toaster } from "@/components/Toaster";

export default async function OrgProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Platform (super admin) accounts have no organisation — send them home
  // rather than letting them into another tenant's data.
  if (!session.organisationId) redirect(homeFor(session));

  // Pure EMPLOYEE accounts are self-service only — their portal is /employee.
  if (session.roles.length === 1 && session.roles[0] === "EMPLOYEE") {
    redirect(homeFor(session));
  }

  const org = await prisma.organisation.findUnique({
    where: { id: session.organisationId },
    select: { name: true, status: true },
  });

  // A disabled organisation is locked out of its own console.
  if (!org || org.status === "DISABLED") {
    redirect("/login?error=organisation_disabled");
  }

  return (
    <OrgConsoleLayout
      user={{ name: session.name, email: session.email, roles: session.roles }}
      orgName={org.name}
    >
      {children}
      <Toaster />
    </OrgConsoleLayout>
  );
}
