"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import type { AppData, StoreId } from "./types";
import { SEED } from "./seed";
import { STORES } from "./stores";

const DEFAULT_SCOPE: StoreId = STORES[0].id;

const STORAGE_KEY = "unho-fnb-data-v1";
const STORE_SEL_KEY = "unho-fnb-store-v1";

type Scope = StoreId | "all";

interface Ctx {
  data: AppData;
  ready: boolean;
  scope: Scope; // 현재 선택 매장 (all = 통합)
  setScope: (s: Scope) => void;
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
  const [ready, setReady] = useState(false);

  // 하이드레이션: localStorage → state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppData>;
        // seed 키 누락 시 보정 (스키마 진화 대비)
        setData({ ...clone(SEED), ...parsed });
      }
      const sel = localStorage.getItem(STORE_SEL_KEY) as Scope | null;
      // '전 매장' 폐지 — 저장된 값이 all이면 기본 매장으로.
      if (sel && sel !== "all") setScopeState(sel);
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
    () => ({ data, ready, scope, setScope, update, reset }),
    [data, ready, scope, setScope, update, reset]
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
