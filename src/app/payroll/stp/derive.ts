/**
 * Single Touch Payroll is derived from pay-run status — there is no dedicated
 * table (see the payroll build contract). These helpers are shared by the three
 * STP pages and any payroll report that needs to show lodgement state.
 */

export type StpState = "ACCEPTED" | "READY" | "NOT_READY";

export type StpInfo = {
  /** Machine state used for grouping and chart tones. */
  state: StpState;
  /** Human label shown in tables and cards. */
  label: string;
  /** ATO lodgement reference — only present once a run is PAID. */
  reference?: string;
  /** When the run was lodged — taken from the run's paidAt. */
  lodgedAt?: Date;
};

/** The minimal pay-run shape the derivation needs. */
export type StpRunLike = {
  id: string;
  status: string;
  paidAt: Date | null;
};

/**
 * Derive STP lodgement state from a pay run:
 *   PAID                                   → Accepted (reference + paidAt)
 *   APPROVED                               → Ready to lodge
 *   PENDING_APPROVAL / DRAFT / FAILED      → Not ready
 */
export function stpState(run: StpRunLike): StpInfo {
  if (run.status === "PAID") {
    return {
      state: "ACCEPTED",
      label: "Accepted",
      reference: `STP-${run.id.slice(-8).toUpperCase()}`,
      lodgedAt: run.paidAt ?? undefined,
    };
  }
  if (run.status === "APPROVED") {
    return { state: "READY", label: "Ready to lodge" };
  }
  return { state: "NOT_READY", label: "Not ready" };
}

/** Badge tone per derived STP state. */
export const STP_BADGE: Record<StpState, string> = {
  ACCEPTED: "green",
  READY: "blue",
  NOT_READY: "slate",
};

/** Chart tone per derived STP state. */
export const STP_TONE: Record<StpState, "emerald" | "sky" | "slate"> = {
  ACCEPTED: "emerald",
  READY: "sky",
  NOT_READY: "slate",
};
