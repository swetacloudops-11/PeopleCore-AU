"use client";

import { useState } from "react";
import OrgSidebar from "@/components/org/OrgSidebar";
import OrgTopbar from "@/components/org/OrgTopbar";

export default function OrgConsoleLayout({
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
        <OrgSidebar orgName={orgName} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10">
            <OrgSidebar orgName={orgName} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <OrgTopbar
          user={user}
          orgName={orgName}
          onToggleMobile={() => setMobileOpen((v) => !v)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
