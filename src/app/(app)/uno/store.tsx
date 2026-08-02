"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DEFAULT_STATE, type DailyLog, type UnoState } from "./types";

const STORAGE_KEY = "uno-self-mgmt-v1";

type Ctx = {
  state: UnoState;
  ready: boolean;
  setState: (updater: (prev: UnoState) => UnoState) => void;
  // 특정 날짜의 로그를 부분 갱신(깊은 병합 1단계)
  patchLog: (date: string, patch: Partial<DailyLog>) => void;
  replaceAll: (next: UnoState) => void;
};

const UnoContext = createContext<Ctx | null>(null);

function migrate(raw: unknown): UnoState {
  if (!raw || typeof raw !== "object") return structuredCloneSafe(DEFAULT_STATE);
  const r = raw as Partial<UnoState>;
  return {
    logs: r.logs && typeof r.logs === "object" ? r.logs : {},
    goals: Array.isArray(r.goals) && r.goals.length ? r.goals : structuredCloneSafe(DEFAULT_STATE.goals),
    books: Array.isArray(r.books) ? r.books : [],
    schedule: Array.isArray(r.schedule) ? r.schedule : [],
    settings: { ...DEFAULT_STATE.settings, ...(r.settings || {}), targets: { ...DEFAULT_STATE.settings.targets, ...(r.settings?.targets || {}) } },
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function UnoProvider({ children }: { children: React.ReactNode }) {
  const [state, setInternal] = useState<UnoState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const skipNextSave = useRef(true);

  // 최초 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setInternal(migrate(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  // 변경 시 저장 (최초 로드분은 건너뜀)
  useEffect(() => {
    if (!ready) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, ready]);

  const setState = useCallback((updater: (prev: UnoState) => UnoState) => {
    setInternal((prev) => updater(prev));
  }, []);

  const patchLog = useCallback((date: string, patch: Partial<DailyLog>) => {
    setInternal((prev) => {
      const cur = prev.logs[date] || { date };
      const next: DailyLog = { ...cur, date };
      for (const k of Object.keys(patch) as (keyof DailyLog)[]) {
        const pv = patch[k];
        if (pv && typeof pv === "object" && !Array.isArray(pv)) {
          // 중첩 객체는 병합
          (next as Record<string, unknown>)[k] = { ...(cur as Record<string, unknown>)[k] as object, ...(pv as object) };
        } else {
          (next as Record<string, unknown>)[k] = pv;
        }
      }
      return { ...prev, logs: { ...prev.logs, [date]: next } };
    });
  }, []);

  const replaceAll = useCallback((next: UnoState) => {
    setInternal(migrate(next));
  }, []);

  return (
    <UnoContext.Provider value={{ state, ready, setState, patchLog, replaceAll }}>
      {children}
    </UnoContext.Provider>
  );
}

export function useUno(): Ctx {
  const ctx = useContext(UnoContext);
  if (!ctx) throw new Error("useUno must be used within UnoProvider");
  return ctx;
}
