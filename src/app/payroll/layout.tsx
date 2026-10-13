import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUsePayrollConsole } from "@/lib/payroll";
import PayrollConsoleLayout from "@/components/payroll/PayrollConsoleLayout";
import { Toaster } from "@/components/Toaster";

export default async function PayrollProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.organisationId) redirect(homeFor(session));
  if (!canUsePayrollConsole(session)) redirect(homeFor(session));

  const org = await prisma.organisation.findUnique({
    where: { id: session.organisationId },
    select: { name: true, status: true },
  });
  if (!org || org.status === "DISABLED") redirect("/login?error=organisation_disabled");

  return (
    <PayrollConsoleLayout
      user={{ name: session.name, email: session.email, roles: session.roles }}
      orgName={org.name}
    >
      {children}
      <Toaster />
    </PayrollConsoleLayout>
  );
}
