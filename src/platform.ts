/**
 * claude.ai 아티팩트로 띄웠을 때 쓰는 기능 (계정별 저장, 파일 내려받기).
 * 일반 브라우저나 데스크톱에서는 모두 null — 그때는 localStorage와 직접 내려받기를 쓴다.
 */
type Use = (name: string) => Promise<unknown>;

export async function capability<T = any>(name: string): Promise<T | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = (window as unknown as { claude?: { use?: Use } }).claude;
  if (!c?.use) return null;
  try {
    return (await Promise.race([c.use(name), new Promise((r) => setTimeout(() => r(null), 10_000))])) as T | null;
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Remote {
  load(): Promise<Record<string, unknown> | null>;
  save(key: string, value: unknown): Promise<void>;
}

/** 내 계정에만 보이는 저장소 (data/users/<id>/…) — 상태의 큰 항목마다 문서 하나 */
export async function remoteStore(keys: string[]): Promise<Remote | null> {
  const db = await capability<any>('db');
  const user = await capability<any>('user');
  if (!db || !user) return null;
  let id: string | null = null;
  try { id = await user.id(); } catch { id = null; }
  if (!id) return null;
  const col = db.collection(`data/users/${id}`);
  return {
    async load() {
      const out: Record<string, unknown> = {};
      let any = false;
      for (const k of keys) {
        const snap = await col.doc(`naeyuk-${k}`).get();
        if (snap.exists) {
          const v = snap.data()?.v;
          if (typeof v === 'string') { out[k] = JSON.parse(v); any = true; }
        }
      }
      return any ? out : null;
    },
    async save(k, value) {
      await col.doc(`naeyuk-${k}`).set({ v: JSON.stringify(value), at: new Date().toISOString() });
    },
  };
}

/** 파일 내려받기: 일반 브라우저는 바로, 아티팩트는 downloads 기능으로. 둘 다 안 되면 false */
export async function saveFile(filename: string, text: string, top: boolean): Promise<boolean> {
  if (top) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename;
    a.click();
    return true;
  }
  const dl = await capability<any>('downloads');
  if (!dl) return false;
  try {
    await dl.save({ filename, data: text });
    return true;
  } catch {
    return false;
  }
}
