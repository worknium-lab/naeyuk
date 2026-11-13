import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyRate, flatten, mapSheet, splitByRatio, SUB_DEFAULT_EXCLUDE, newId, resolveSheet, computeUnits, changeSheet,
  type Basis, type UnitCalc, type ChangeOrder, type CostKey, type CostRates, type Line, type PhaseAlloc, type Progress, type RoundMode, type Sheet,
} from './engine';
import { designSheet, PROJECT } from './data/project';
import { basisData } from './data/basisData';
import { remoteStore, type Remote } from './platform';
import { DEFAULT_FMT, type ChangeFmt } from './changeForms';
import { useRef } from 'react';

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
  changeConfirmed: boolean;
  rates: Partial<CostRates>;
  basis: Basis;
  change: ChangeOrder;
  changeFmt: ChangeFmt;
}

const KEY = 'naeyuk.v2';

function initial(): State {
  const design = designSheet();
  const basis = basisData();
  const start = applyRate(resolveSheet(design, basis), PROJECT.bidRate, { skipSupplied: true });
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
    changeConfirmed: false,
    rates: {},
    basis,
    change: { name: '변경 1회', qty: { L24: 760, L27: 92, L31: 28 }, added: [] },
    changeFmt: DEFAULT_FMT,
  };
}

/** 예전에 저장한 상태에 새로 생긴 근거 정보(기계경비, 단산의 노임·장비 줄 등)를 채워 넣는다 */
export function migrate(st: State): State {
  const fresh = basisData();
  const b = st.basis ?? fresh;
  return {
    ...st,
    basis: {
      ...b,
      machines: b.machines ?? fresh.machines,
      fuel: b.fuel ?? fresh.fuel,
      calcs: b.calcs.map((c) => {
        const f = fresh.calcs.find((x) => x.no === c.no);
        return f ? { ...c, laborLines: c.laborLines ?? f.laborLines, pctOfLabor: c.pctOfLabor ?? f.pctOfLabor, machineLines: c.machineLines ?? f.machineLines } : c;
      }),
    },
  };
}

function load(): State {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return migrate({ ...initial(), ...JSON.parse(s) });
  } catch {
    /* 저장된 값이 없거나 깨졌으면 처음 값 */
  }
  return initial();
}

interface Ctx {
  s: State;
  set: (fn: (s: State) => State) => void;
  reset: () => void;
  /** 근거를 반영한 설계내역서 */
  design: Sheet;
  start: Sheet;
  /** 차수·기성의 기준 — 설계변경을 확정하면 변경 내역서 */
  contract: Sheet;
  units: Map<string, UnitCalc>;
  toast: (msg: string) => void;
  editLine: (id: string, patch: Partial<Line>) => void;
  /** 어디에 저장되는지 */
  saveWhere: 'local' | 'account' | 'saving';
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
  // claude.ai에서 열면 내 계정 저장소에도 둔다 (다른 기기에서도 이어서)
  const remote = useRef<Remote | null>(null);
  const written = useRef<Record<string, string>>({});
  const [saveWhere, setSaveWhere] = useState<'local' | 'account' | 'saving'>('local');
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await remoteStore(Object.keys(initial()));
      if (!alive || !r) return;
      try {
        const got = await r.load();
        if (got) {
          for (const [k, v] of Object.entries(got)) written.current[k] = JSON.stringify(v);
          setS((cur) => migrate({ ...cur, ...(got as Partial<State>) }));
        }
        remote.current = r;
        setSaveWhere('account');
      } catch {
        /* 계정 저장소를 못 쓰면 이 브라우저에만 */
      }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const r = remote.current;
    if (!r) return;
    const t = setTimeout(async () => {
      const dirty = Object.entries(s).filter(([k, v]) => written.current[k] !== JSON.stringify(v));
      if (!dirty.length) return;
      setSaveWhere('saving');
      for (const [k, v] of dirty) {
        const j = JSON.stringify(v);
        try { await r.save(k, v); written.current[k] = j; } catch { /* 다음 변경 때 다시 */ }
      }
      setSaveWhere('account');
    }, 1500);
    return () => clearTimeout(t);
  }, [s, saveWhere === 'local']); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const units = useMemo(() => computeUnits(s.basis), [s.basis]);
  const design = useMemo(() => resolveSheet(s.design, s.basis, units), [s.design, s.basis, units]);
  const start = useMemo(() => applyRate(design, s.bidRate, { skipSupplied: true }), [design, s.bidRate]);
  const contract = useMemo(() => (s.changeConfirmed ? changeSheet(start, s.change, s.bidRate) : start), [start, s.changeConfirmed, s.change, s.bidRate]);
  const set = useCallback((fn: (s: State) => State) => setS(fn), []);
  const editLine = useCallback((id: string, patch: Partial<Line>) => {
    setS((st) => ({ ...st, design: mapSheet(st.design, (l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }, []);
  const value: Ctx = {
    s, set, design, start, contract, units, editLine, saveWhere,
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
