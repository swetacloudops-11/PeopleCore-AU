"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ORG_NAV } from "@/lib/org-nav";
import { cx } from "@/lib/format";

export default function OrgSidebar({
  orgName,
  onNavigate,
}: {
  orgName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string[]>(() => {
    const active = ORG_NAV.find((i) =>
      i.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"))
    );
    return active ? [active.label] : [];
  });

  const toggle = (label: string) =>
    setOpen((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );

  const isActive = (href: string) =>
    href === "/org/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-slate-900 text-slate-200">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500 text-sm font-bold text-white">
          {orgName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-white">{orgName}</div>
          <div className="text-[11px] text-slate-400">Organisation Admin</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {ORG_NAV.map((item) => {
            if (!item.children) {
              const active = isActive(item.href!);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href!}
                    onClick={onNavigate}
                    className={cx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-emerald-500/20 font-medium text-white"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <span className="text-base leading-none">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            }

            const expanded = open.includes(item.label);
            const childActive = item.children.some((c) => isActive(c.href));

            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => toggle(item.label)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    childActive ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  <svg
                    className={cx(
                      "h-3.5 w-3.5 text-slate-400 transition-transform",
                      expanded && "rotate-90"
                    )}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.2 4.3a1 1 0 011.4 0l4.6 4.6a1 1 0 010 1.4l-4.6 4.6a1 1 0 11-1.4-1.4L11.08 9.6 7.2 5.7a1 1 0 010-1.4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {expanded && (
                  <ul className="mt-1 ml-6 space-y-0.5 border-l border-white/10 pl-3">
                    {item.children.map((child) => {
                      const active = isActive(child.href);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            className={cx(
                              "block rounded-md px-3 py-1.5 text-[13px] transition-colors",
                              active
                                ? "bg-emerald-500/20 font-medium text-white"
                                : "text-slate-400 hover:text-white"
                            )}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-500">
        PeopleCore AU · Organisation Console
      </div>
    </aside>
  );
}
