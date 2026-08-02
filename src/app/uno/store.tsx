"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DEFAULT_STATE, type DailyLog, type UnoState } from "./types";
import { loadUnoState, saveUnoState } from "./actions";

const STORAGE_KEY = "uno-self-mgmt-v1"; // 오프라인 캐시(서버 저장이 원본)

export type SyncStatus = "loading" | "saved" | "saving" | "offline";

type Ctx = {
  state: UnoState;
  ready: boolean;
  sync: SyncStatus;
  setState: (updater: (prev: UnoState) => UnoState) => void;
  patchLog: (date: string, patch: Partial<DailyLog>) => void;
  replaceAll: (next: UnoState) => void;
  syncNow: () => void;
};

const UnoContext = createContext<Ctx | null>(null);

function migrate(raw: unknown): UnoState {
  if (!raw || typeof raw !== "object") return clone(DEFAULT_STATE);
  const r = raw as Partial<UnoState>;
  return {
    logs: r.logs && typeof r.logs === "object" ? r.logs : {},
    goals: Array.isArray(r.goals) && r.goals.length ? r.goals : clone(DEFAULT_STATE.goals),
    books: Array.isArray(r.books) ? r.books : [],
    schedule: Array.isArray(r.schedule) ? r.schedule : [],
    settings: {
      ...DEFAULT_STATE.settings,
      ...(r.settings || {}),
      targets: { ...DEFAULT_STATE.settings.targets, ...(r.settings?.targets || {}) },
    },
  };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// 실질적 데이터가 있는지(기본 시드와 구분). 로컬→서버 최초 이관 판단용.
function hasRealData(s: UnoState): boolean {
  return Boolean(
    Object.keys(s.logs || {}).length ||
      (s.books || []).length ||
      (s.schedule || []).length ||
      s.settings?.ownerName ||
      s.settings?.calendarEmbedUrl,
  );
}

export function UnoProvider({ children }: { children: React.ReactNode }) {
  const [state, setInternal] = useState<UnoState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus>("loading");

  const hydrated = useRef(false); // 서버 최초 로드 완료 전엔 저장 안 함
  const skipSave = useRef(false); // 프로그래매틱 setState(서버 반영)는 저장 스킵
  const online = useRef(false); // 서버 동기화 가능 여부
  const lastServerAt = useRef<string | undefined>(undefined);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 서버로 저장(디바운스 flush)
  const flushSave = useCallback(async () => {
    if (!online.current) return;
    dirty.current = false;
    setSync("saving");
    const res = await saveUnoState(stateRef.current);
    if (res.ok) {
      lastServerAt.current = res.updatedAt;
      online.current = true;
      setSync(dirty.current ? "saving" : "saved");
    } else {
      online.current = false;
      setSync("offline");
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSave();
    }, 800);
  }, [flushSave]);

  // 다른 기기의 변경을 가져오기(포커스/주기적)
  const pull = useCallback(async () => {
    if (!online.current || dirty.current) return;
    const res = await loadUnoState();
    if (!res.dbReady) return;
    if (res.exists && res.data && res.updatedAt && res.updatedAt !== lastServerAt.current) {
      lastServerAt.current = res.updatedAt;
      skipSave.current = true;
      setInternal(migrate(res.data));
      setSync("saved");
    }
  }, []);

  // 최초 로드: 로컬 캐시 즉시 표시 → 서버와 동기화
  useEffect(() => {
    let localState = DEFAULT_STATE;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        localState = migrate(JSON.parse(raw));
        skipSave.current = true;
        setInternal(localState);
      }
    } catch {
      /* ignore */
    }

    (async () => {
      const res = await loadUnoState();
      if (res.dbReady) {
        online.current = true;
        if (res.exists && res.data) {
          // 서버가 원본. 단, 서버가 비었고 로컬에 데이터가 있으면 로컬을 서버로 이관.
          if (!hasRealData(res.data) && hasRealData(localState)) {
            const save = await saveUnoState(localState);
            lastServerAt.current = save.updatedAt;
          } else {
            lastServerAt.current = res.updatedAt;
            skipSave.current = true;
            setInternal(migrate(res.data));
          }
        } else {
          // 서버에 행 없음 → 로컬(또는 기본)로 시드
          const save = await saveUnoState(localState);
          lastServerAt.current = save.updatedAt;
        }
        setSync("saved");
      } else {
        online.current = false;
        setSync("offline");
      }
      hydrated.current = true;
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 상태 변경 → 로컬 캐시 + 서버 저장 예약
  useEffect(() => {
    if (!hydrated.current) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    if (online.current) {
      dirty.current = true;
      setSync("saving");
      scheduleSave();
    }
  }, [state, scheduleSave]);

  // 포커스 복귀·주기적으로 다른 기기 변경 반영
  useEffect(() => {
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const iv = setInterval(() => void pull(), 30000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(iv);
    };
  }, [pull]);

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
          (next as Record<string, unknown>)[k] = {
            ...((cur as Record<string, unknown>)[k] as object),
            ...(pv as object),
          };
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

  const syncNow = useCallback(() => {
    if (dirty.current) void flushSave();
    else void pull();
  }, [flushSave, pull]);

  return (
    <UnoContext.Provider value={{ state, ready, sync, setState, patchLog, replaceAll, syncNow }}>
      {children}
    </UnoContext.Provider>
  );
}

export function useUno(): Ctx {
  const ctx = useContext(UnoContext);
  if (!ctx) throw new Error("useUno must be used within UnoProvider");
  return ctx;
}
