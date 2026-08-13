"use client";

// UNO 자기 관리 — 공용 UI 프리미티브 (외부 차트 라이브러리 없이 인라인 SVG).
import { round1 } from "./lib";

export function StatCard({
  emoji,
  label,
  value,
  unit,
  sub,
  tone = "default",
  onClick,
}: {
  emoji?: string;
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: "default" | "accent" | "ok" | "warn";
  onClick?: () => void;
}) {
  const color =
    tone === "accent" ? "var(--accent)" : tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--ink)";
  return (
    <div
      className={`card uno-stat${onClick ? " uno-stat-click" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="uno-stat-lbl">
        {emoji && <span aria-hidden>{emoji}</span>} {label}
        {onClick && <span className="uno-stat-edit" aria-hidden>✎</span>}
      </div>
      <div className="uno-stat-n" style={{ color }}>
        {value}
        {unit && <span className="uno-stat-unit">{unit}</span>}
      </div>
      {sub && <div className="uno-stat-sub">{sub}</div>}
    </div>
  );
}

// 진행률 바
export function Progress({ ratio, tone = "accent" }: { ratio: number; tone?: "accent" | "ok" | "warn" }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const color = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <div className="uno-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="uno-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// 별점(1~5) 입력/표시
export function Stars({
  value,
  onChange,
  readOnly,
}: {
  value?: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <span className="uno-stars" role={readOnly ? undefined : "radiogroup"} aria-label="평점">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          aria-label={`${n}점`}
          aria-checked={value === n}
          role={readOnly ? undefined : "radio"}
          className={`uno-star${(value || 0) >= n ? " on" : ""}`}
          onClick={() => onChange?.(value === n ? 0 : n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// 라벨 + 필드 래퍼
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="uno-field">
      <span className="uno-field-lbl">
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

// 세그먼트 선택
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="uno-seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`uno-seg-btn${value === o.value ? " on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 막대 차트 (일별)
export function BarChart({
  data,
  height = 140,
  unit,
  target,
  color = "var(--accent)",
}: {
  data: { label: string; value: number; hint?: string }[];
  height?: number;
  unit?: string;
  target?: number;
  color?: string;
}) {
  const max = Math.max(target || 0, ...data.map((d) => d.value), 1);
  return (
    <div className="uno-chart">
      <div className="uno-bars" style={{ height }}>
        {target ? (
          <div
            className="uno-target-line"
            style={{ bottom: `${(target / max) * 100}%` }}
            title={`목표 ${target}${unit || ""}`}
          />
        ) : null}
        {data.map((d, i) => (
          <div className="uno-bar-col" key={i} title={d.hint || `${d.label}: ${round1(d.value)}${unit || ""}`}>
            <div className="uno-bar-track">
              <div
                className="uno-bar-val"
                style={{ height: `${(d.value / max) * 100}%`, background: d.value > 0 ? color : "var(--line-2)" }}
              />
            </div>
            <div className="uno-bar-x">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 도넛 링 (단일 진행률)
export function Ring({
  ratio,
  size = 92,
  label,
  center,
  color = "var(--accent)",
}: {
  ratio: number;
  size?: number;
  label?: string;
  center?: string;
  color?: string;
}) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <div className="uno-ring" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={9} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="uno-ring-center">
          {center ?? `${Math.round(pct * 100)}%`}
        </text>
      </svg>
      {label && <div className="uno-ring-lbl">{label}</div>}
    </div>
  );
}

// 숫자 입력
export function NumInput({
  value,
  onChange,
  placeholder,
  step,
  min,
  max,
  suffix,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <span className="uno-num">
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}
