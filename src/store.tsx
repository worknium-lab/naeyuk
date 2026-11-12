import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyRate, flatten, mapSheet, splitByRatio, SUB_DEFAULT_EXCLUDE, newId,
  type CostKey, type CostRates, type Line, type PhaseAlloc, type Progress, type RoundMode, type Sheet,
} from './engine';
import { designSheet, PROJECT } from './data/project';

export interface Subcontract {
  id: string;
  vendor: string;
  trade: string;
  pick: string[];
  rate: number;
  exclude: CostKey[];
  round: RoundMode;
  confirmed: boolean;
}

export interface ImportedUnit {
  no: string;
  name: string;
  spec: string;
  unit: string;
  l: number;
  m: number;
  e: number;
  from: string;
}

export interface State {
  design: Sheet;
  bidRate: number;
  phaseOn: boolean;
  progressOn: boolean;
  phases: { name: string; year: string; status: string }[];
  alloc: PhaseAlloc;
  rounds: { name: string; status: '확정' | '작성 중' }[];
  progress: Progress;
  subs: Subcontract[];
  imported: ImportedUnit[];
  changeConfirmed: boolean;
  rates: Partial<CostRates>;
}

const KEY = 'naeyuk.v1';

function initial(): State {
  const design = designSheet();
  const start = applyRate(design, PROJECT.bidRate, { skipSupplied: true });
  const alloc = splitByRatio(start, [0.48, 0.52]);
  alloc['L17'] = [0, 0]; // 조인트부 실란트보수 — 아직 미배정
  const progress: Progress = {};
  for (const s of start.sections) {
    for (const r of flatten(s.lines)) {
      if (r.line.children) continue;
      const q = r.line.qty;
      const f = (x: number) => Math.floor(q * x * 100) / 100;
      progress[r.line.id] = [f(0.2), f(0.25), f(0.16)];
    }
  }
  return {
    design,
    bidRate: PROJECT.bidRate,
    phaseOn: true,
    progressOn: true,
    phases: [
      { name: '1차분', year: '2026', status: '계약' },
      { name: '2차분', year: '2027', status: '분개 중' },
    ],
    alloc,
    rounds: [
      { name: '제1회', status: '확정' },
      { name: '제2회', status: '확정' },
      { name: '제3회', status: '작성 중' },
    ],
    progress,
    subs: [
      { id: 's1', vendor: '○○포장(주)', trade: '포장면', pick: ['G23'], rate: 0.82, exclude: [...SUB_DEFAULT_EXCLUDE], round: 'floor1000', confirmed: true },
      { id: 's2', vendor: '○○건설(주)', trade: '기타 보수공', pick: ['G26'], rate: 0.82, exclude: [...SUB_DEFAULT_EXCLUDE], round: 'floor1000', confirmed: false },
    ],
    imported: [],
    changeConfirmed: false,
    rates: {},
  };
}

function load(): State {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...initial(), ...JSON.parse(s) };
  } catch {
    /* 저장된 값이 없거나 깨졌으면 처음 값 */
  }
  return initial();
}

interface Ctx {
  s: State;
  set: (fn: (s: State) => State) => void;
  reset: () => void;
  start: Sheet;
  toast: (msg: string) => void;
  editLine: (id: string, patch: Partial<Line>) => void;
}

const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(load);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* 저장 못 해도 화면은 계속 */
    }
  }, [s]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const start = useMemo(() => applyRate(s.design, s.bidRate, { skipSupplied: true }), [s.design, s.bidRate]);
  const set = useCallback((fn: (s: State) => State) => setS(fn), []);
  const editLine = useCallback((id: string, patch: Partial<Line>) => {
    setS((st) => ({ ...st, design: mapSheet(st.design, (l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }, []);
  const value: Ctx = {
    s, set, start, editLine,
    reset: () => setS(initial()),
    toast: (m) => setMsg(m),
  };
  return (
    <C.Provider value={value}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </C.Provider>
  );
}

export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error('StoreProvider 밖에서 사용');
  return c;
}

export { newId };
