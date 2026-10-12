"use client";

import { useEffect, useState } from "react";
import PlanManager from "@/components/PlanManager";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: unknown;
  priceAnnual: unknown;
  maxEmployees: number;
  maxOrganisations: number;
  trialDays: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};

/**
 * Listens for `pc-edit-plan` events (fired by PlanRowActions) and opens the
 * shared PlanManager modal pre-filled with that plan.
 */
export default function PlanEditListener({ plans }: { plans: Plan[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      setActiveId((e as CustomEvent<string>).detail);
    };
    window.addEventListener("pc-edit-plan", handler);
    return () => window.removeEventListener("pc-edit-plan", handler);
  }, []);

  const plan = plans.find((p) => p.id === activeId);
  if (!plan) return null;

  return <PlanManager key={plan.id} plan={plan} />;
}
