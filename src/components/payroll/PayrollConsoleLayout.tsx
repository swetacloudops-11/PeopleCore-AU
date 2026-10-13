"use client";

import { useState } from "react";
import PayrollSidebar from "@/components/payroll/PayrollSidebar";
import PayrollTopbar from "@/components/payroll/PayrollTopbar";

export default function PayrollConsoleLayout({
  children,
  user,
  orgName,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; roles: string[] };
  orgName: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <div className="hidden md:block">
        <PayrollSidebar orgName={orgName} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10">
            <PayrollSidebar orgName={orgName} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <PayrollTopbar
          user={user}
          orgName={orgName}
          onToggleMobile={() => setMobileOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
