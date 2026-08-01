"use client";

import React from "react";

// ── 배지 ──────────────────────────────────────────
type Tone = "gray" | "green" | "amber" | "red" | "blue" | "brand";
export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

// ── 통계 카드 ──────────────────────────────────────
export function Stat({
  label,
  value,
  foot,
  icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  icon?: string;
  accent?: string;
}) {
  return (
    <div className="stat">
      <div className="label">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className="value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

// ── 진행바 ──────────────────────────────────────────
export function Bar({ value, color }: { value: number; color?: string }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className="bar">
      <span style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

// ── 카드 ────────────────────────────────────────────
export function Card({
  title,
  action,
  children,
  pad = true,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  pad?: boolean;
}) {
  return (
    <div className="card">
      {title && (
        <div className="card-head">
          <h3>{title}</h3>
          {action}
        </div>
      )}
      <div className={pad ? "card-pad" : ""}>{children}</div>
    </div>
  );
}

// ── 모달 ────────────────────────────────────────────
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ── 폼 필드 ─────────────────────────────────────────
export function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "full" : undefined}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ── 필터 칩 ─────────────────────────────────────────
export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o.value}
          className={`chip ${value === o.value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
