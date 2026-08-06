// 녹음 조각(청크)을 IndexedDB에 계속 저장 → 앱이 백그라운드에서 종료돼도
// 다음에 열 때 그때까지 녹음된 부분을 복구할 수 있게 한다. (브라우저 전용)
const DB_NAME = "uno-rec";
const STORE = "chunks";
const MIME_KEY = "uno-rec-mime";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export function recSetMime(mime: string) {
  try {
    localStorage.setItem(MIME_KEY, mime || "audio/webm");
  } catch {
    /* ignore */
  }
}
export function recMime(): string {
  try {
    return localStorage.getItem(MIME_KEY) || "audio/webm";
  } catch {
    return "audio/webm";
  }
}

export async function recAppend(chunk: Blob): Promise<void> {
  try {
    await tx("readwrite", (s) => s.add(chunk));
  } catch {
    /* 저장 실패는 무시(녹음 자체는 계속) */
  }
}

export async function recGetAll(): Promise<Blob[]> {
  try {
    const all = await tx<unknown[]>("readonly", (s) => s.getAll());
    return (all as Blob[]).filter((b) => b instanceof Blob && b.size > 0);
  } catch {
    return [];
  }
}

export async function recClear(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {
    /* ignore */
  }
}

// 복구용: 저장된 조각을 하나의 Blob으로 합친다. 없으면 null.
export async function recRecover(): Promise<Blob | null> {
  const chunks = await recGetAll();
  if (chunks.length === 0) return null;
  return new Blob(chunks, { type: recMime() });
}
