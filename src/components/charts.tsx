/**
 * Lightweight presentational charts for the Organisation console.
 *
 * Pure SVG/CSS — no chart library, no client JS, safe to render in server
 * components. Keep them dumb: they take numbers and draw.
 */

export type Tone =
  | "indigo"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "violet"
  | "slate"
  | "teal"
  | "fuchsia";

const TONE_HEX: Record<Tone, string> = {
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  slate: "#64748b",
  teal: "#14b8a6",
  fuchsia: "#d946ef",
};

/** Rotation used when a chart doesn't specify its own colours. */
const PALETTE: Tone[] = ["indigo", "emerald", "amber", "sky", "violet", "rose", "teal", "fuchsia", "slate"];

export function toneHex(tone: Tone): string {
  return TONE_HEX[tone] ?? TONE_HEX.indigo;
}

export function paletteAt(i: number): string {
  return TONE_HEX[PALETTE[i % PALETTE.length]];
}

// ─────────────────────────── Donut ───────────────────────────

export type DonutSegment = {
  label: string;
  value: number;
  tone?: Tone;
  color?: string;
};

export function Donut({
  segments,
  size = 148,
  thickness = 18,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue?: string | number;
  centerLabel?: string;
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center">
        <div
          className="grid place-items-center rounded-full bg-slate-100"
          style={{ width: size, height: size }}
        >
          <span className="text-xs text-slate-400">No data</span>
        </div>
        <span className="mt-2 text-[11px] text-slate-400">{centerLabel}</span>
      </div>
    );
  }

  // Segment lengths around the ring, with running prefix sums for the dash offset.
  const lengths = segments.map((s) => (Math.max(0, s.value) / total) * circumference);
  const starts = lengths.reduce<number[]>(
    (acc, len) => [...acc, (acc[acc.length - 1] ?? 0) + len],
    [0],
  );
  const arcs = segments.map((s, i) => ({
    key: `${s.label}-${i}`,
    dash: `${lengths[i]} ${circumference - lengths[i]}`,
    offset: -starts[i],
    color: s.color ?? (s.tone ? toneHex(s.tone) : paletteAt(i)),
    fraction: lengths[i] / circumference,
  }));

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={centerLabel ?? "chart"}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={thickness}
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-slate-900">
            {centerValue ?? total.toLocaleString()}
          </span>
          {centerLabel && (
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      <ul className="mt-3 flex w-full flex-wrap justify-center gap-x-3 gap-y-1.5">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color ?? (s.tone ? toneHex(s.tone) : paletteAt(i)) }}
            />
            <span className="max-w-[120px] truncate">{s.label}</span>
            <span className="font-medium text-slate-800">
              {Math.round((Math.max(0, s.value) / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────── Horizontal bars ───────────────────────

export type BarItem = {
  label: string;
  value: number;
  hint?: string;
  tone?: Tone;
  color?: string;
  href?: string;
};

export function BarList({
  items,
  tone,
  valueFormat = (v) => v.toLocaleString(),
  showPercents = true,
}: {
  items: BarItem[];
  tone?: Tone;
  valueFormat?: (v: number) => string;
  showPercents?: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, i) => a + i.value, 0);

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">No data yet</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => {
        const pct = max === 0 ? 0 : (item.value / max) * 100;
        const color = item.color ?? (item.tone ? toneHex(item.tone) : tone ? toneHex(tone) : paletteAt(i));
        const Wrapper = item.href ? "a" : "div";
        const wrapperProps = item.href ? { href: item.href } : {};
        return (
          <li key={item.label}>
            <Wrapper {...wrapperProps} className="block group">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] text-slate-600 group-hover:text-slate-900">
                  {item.label}
                </span>
                <span className="shrink-0 text-[13px] font-medium tabular-nums text-slate-800">
                  {valueFormat(item.value)}
                  {showPercents && total > 0 && (
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                      {Math.round((item.value / total) * 100)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color }}
                />
              </div>
              {item.hint && (
                <div className="mt-0.5 text-[11px] text-slate-400">{item.hint}</div>
              )}
            </Wrapper>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────── Column chart ───────────────────────

export type ColumnPoint = {
  label: string;
  value: number;
  tone?: Tone;
  color?: string;
};

/** Vertical bars — good for trends across days, weeks or pay runs. */
export function ColumnChart({
  points,
  tone = "indigo",
  height = 132,
  valueFormat = (v) => v.toLocaleString(),
  showValues = true,
}: {
  points: ColumnPoint[];
  tone?: Tone;
  height?: number;
  valueFormat?: (v: number) => string;
  showValues?: boolean;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));

  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">No data yet</p>;
  }

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {points.map((p, i) => {
          const h = Math.max(3, (p.value / max) * 100);
          const color = p.color ?? (p.tone ? toneHex(p.tone) : toneHex(tone));
          return (
            <div
              key={`${p.label}-${i}`}
              className="group flex flex-1 flex-col items-center justify-end"
              title={`${p.label}: ${valueFormat(p.value)}`}
            >
              {showValues && (
                <span className="mb-1 text-[9px] tabular-nums text-slate-400 opacity-0 transition group-hover:opacity-100">
                  {valueFormat(p.value)}
                </span>
              )}
              <div
                className="w-full rounded-t-sm transition-all group-hover:opacity-80"
                style={{ height: `${h}%`, backgroundColor: color }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-slate-100 pt-1.5">
        {points.map((p, i) => (
          <div
            key={`lbl-${p.label}-${i}`}
            className="flex-1 truncate text-center text-[9px] text-slate-400"
          >
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────── Progress ───────────────────────

export function ProgressBar({
  value,
  max = 100,
  tone = "indigo",
  showLabel = true,
  label,
  size = "md",
}: {
  value: number;
  max?: number;
  tone?: Tone;
  showLabel?: boolean;
  label?: string;
  size?: "sm" | "md";
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const color = toneHex(tone);
  const barH = size === "sm" ? "h-1.5" : "h-2";
  return (
    <div className="w-full">
      {(showLabel || label) && (
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">{label}</span>
          <span className="font-medium tabular-nums text-slate-700">{pct}%</span>
        </div>
      )}
      <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${barH}`}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─────────────────────── Stacked bar ───────────────────────

export function StackedBar({
  segments,
  height = 12,
  showLegend = true,
}: {
  segments: DonutSegment[];
  height?: number;
  showLegend?: boolean;
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total === 0) {
    return <div className="h-3 w-full rounded-full bg-slate-100" />;
  }
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-full bg-slate-100" style={{ height }}>
        {segments.map((s, i) => {
          const pct = (Math.max(0, s.value) / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={`${s.label}-${i}`}
              title={`${s.label}: ${s.value}`}
              style={{
                width: `${pct}%`,
                backgroundColor: s.color ?? (s.tone ? toneHex(s.tone) : paletteAt(i)),
              }}
            />
          );
        })}
      </div>
      {showLegend && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color ?? (s.tone ? toneHex(s.tone) : paletteAt(i)) }}
              />
              {s.label} · <span className="font-medium text-slate-700">{s.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────── Sparkline ───────────────────────

export function Sparkline({
  values,
  tone = "indigo",
  height = 36,
  width = 120,
}: {
  values: number[];
  tone?: Tone;
  height?: number;
  width?: number;
}) {
  if (values.length < 2) {
    return <div className="text-[11px] text-slate-400">Not enough data</div>;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const color = toneHex(tone);
  const area = `0,${height} ${points.join(" ")} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible" role="img" aria-hidden>
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={height - ((values[values.length - 1] - min) / range) * height}
        r={3}
        fill={color}
      />
    </svg>
  );
}

// ─────────────────────── Card shell ───────────────────────

/** Standard chart container so every panel lines up. */
export function ChartPanel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
