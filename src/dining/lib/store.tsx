"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import type { AppData, StoreId } from "./types";
import { SEED } from "./seed";
import { STORES } from "./stores";

const DEFAULT_SCOPE: StoreId = STORES[0].id;

const STORAGE_KEY = "unho-dining-data-v1";
const STORE_SEL_KEY = "unho-dining-store-v1";

type Scope = StoreId | "all";

// 호스트(서브도메인)로 단일 매장 전용 앱인지 판별한다.
//  • sinmi.* → 신미집(smjp) 전용, daeun.* → 대운목장(dwmc) 전용.
//  • 그 외(unho-dining 등)는 null → 두 매장 스위처 노출(통합 관리).
export function detectLockedStore(): StoreId | null {
  if (typeof window === "undefined") return null;
  const label = window.location.hostname.toLowerCase().split(".")[0];
  if (label.includes("sinmi")) return "smjp";
  if (label.includes("daeun")) return "dwmc";
  return null;
}

interface Ctx {
  data: AppData;
  ready: boolean;
  scope: Scope; // 현재 선택 매장 (all = 통합)
  setScope: (s: Scope) => void;
  locked: StoreId | null; // 서브도메인 단일 매장 잠금(신미집/대운목장 전용 앱)
  update: (fn: (d: AppData) => AppData) => void;
  reset: () => void;
}

const DataContext = createContext<Ctx | null>(null);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(SEED);
  const [scope, setScopeState] = useState<Scope>(DEFAULT_SCOPE);
  const [locked, setLocked] = useState<StoreId | null>(null);
  const [ready, setReady] = useState(false);

  // 하이드레이션: localStorage → state
  useEffect(() => {
    const lock = detectLockedStore();
    if (lock) setLocked(lock);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppData>;
        // seed 키 누락 시 보정 (스키마 진화 대비)
        setData({ ...clone(SEED), ...parsed });
      }
      if (lock) {
        // 단일 매장 전용 앱(신미집/대운목장) — 저장값 무시하고 해당 매장으로 고정.
        setScopeState(lock);
      } else {
        const sel = localStorage.getItem(STORE_SEL_KEY) as Scope | null;
        // '전 매장' 폐지 — 저장된 값이 all이면 기본 매장으로.
        if (sel && sel !== "all") setScopeState(sel);
      }
    } catch {
      /* 무시하고 시드 사용 */
    }
    setReady(true);
  }, []);

  // 저장
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 용량 초과 등 무시 */
    }
  }, [data, ready]);

  const setScope = useCallback((s: Scope) => {
    // 단일 매장 전용 앱에서는 매장 전환을 막는다.
    if (detectLockedStore()) return;
    setScopeState(s);
    try {
      localStorage.setItem(STORE_SEL_KEY, s);
    } catch {
      /* 무시 */
    }
  }, []);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((prev) => fn(clone(prev)));
  }, []);

  const reset = useCallback(() => {
    setData(clone(SEED));
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 무시 */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ data, ready, scope, setScope, locked, update, reset }),
    [data, ready, scope, setScope, locked, update, reset]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

// 현재 scope에 맞춰 배열을 필터링하는 헬퍼
export function inScope<T extends { storeId: StoreId | "all" }>(items: T[], scope: Scope): T[] {
  if (scope === "all") return items;
  return items.filter((i) => i.storeId === scope || i.storeId === "all");
}
