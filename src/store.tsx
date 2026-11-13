import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyRate, flatten, mapSheet, splitByRatio, costSheet, sectionAmount, SUB_DEFAULT_EXCLUDE, newId, resolveSheet, computeUnits, changeSheet,
  type Basis, type UnitCalc, type ExtraItem, type ChangeOrder, type CostKey, type CostRates, type Line, type PhaseAlloc, type Progress, type RoundMode, type Sheet,
} from './engine';
import { designSheet, PROJECT, REFS } from './data/project';
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
  /** 설계변경 신규 항목 중 이 하도급에 넣을 것 */
  pickNew?: string[];
  /** 하도급 변경 확정 */
  changeConfirmed?: boolean;
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

/** 공사 기본 정보 */
export interface ProjectInfo { id: string; name: string; client: string; kind: string; created: string }
/** 공사 목록에 보이는 요약 */
export interface ProjectMeta { id: string; name: string; client: string; kind: string; amount: number; phase: string; updated: string }

export interface State {
  info: ProjectInfo;
  /** 원가계산서에서 끈 비목 (설계·착공 등 모든 문서) */
  exclude?: CostKey[];
  /** 설계가 고정 비목 (착공·설계변경에서 설계 금액 그대로) */
  fixedKeys?: CostKey[];
  /** 원가계산서에 추가한 비목 (모든 문서) */
  extraCost?: ExtraItem[];
  /** 문서별 단수정리값 (부가세 포함) — 이윤에 TRUNC(값 ÷ 1.1) */
  roundAdj?: Record<string, number>;
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

/** 낙찰 후에도 설계 금액으로 고정하는 비목 (국민건강·국민연금·노인장기요양·퇴직공제부금·산업안전보건관리비) */
export const FIXED_DEFAULT: CostKey[] = ['health', 'pension', 'care', 'retire', 'safety'];
export const EXAMPLE_ID = 'p-yongam';
const IDX = 'naeyuk.projects';
const CUR = 'naeyuk.cur';
const keyOf = (id: string) => (id === EXAMPLE_ID ? 'naeyuk.v2' : `naeyuk.p.${id}`);
const today = () => new Date().toISOString().slice(0, 10);
export const EXAMPLE_INFO: ProjectInfo = { id: EXAMPLE_ID, name: PROJECT.name, client: PROJECT.client, kind: '교량 보수', created: '2026-11-12' };

/** 빈 공사 — 기초자료(노임·자재·기계경비)는 자료실 값을 가져오고, 내역서·호표·단산은 비어 있다 */
export function blankState(info: ProjectInfo, bidRate: number): State {
  const lib = basisData();
  const g = (name: string, mark: string, level: Line['level'], children: Line[] = []): Line => ({ id: newId('g'), level, mark, name, spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children });
  const first = g('공종 1', '○', 2, [{ id: newId('n'), level: 0, mark: 'a.', name: '새 항목', spec: '', unit: '식', qty: 1, lu: 0, mu: 0, eu: 0 }]);
  return {
    info,
    design: { sections: [
      { section: 'main', lines: [g(info.name, '●', 3, [first])] },
      { section: 'supplied', lines: [g('관급자재대', '●', 3)] },
      { section: 'waste', lines: [g('폐기물처리비', '●', 3)] },
    ] },
    bidRate,
    phaseOn: false,
    progressOn: false,
    phases: [{ name: '1차분', year: today().slice(0, 4), status: '분개 중' }],
    alloc: {},
    rounds: [{ name: '제1회', status: '작성 중' }],
    progress: {},
    subs: [],
    changeConfirmed: false,
    rates: {},
    exclude: [],
    basis: { ...lib, units: [], calcs: [], quotes: [] },
    change: { name: '변경 1회', qty: {}, added: [] },
    changeFmt: DEFAULT_FMT,
  };
}

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
    info: EXAMPLE_INFO,
    exclude: [],
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
    design: !st.info || st.info.id === EXAMPLE_ID ? mapSheet(st.design, (l) => (!l.children && !l.ref && REFS[l.name] ? { ...l, ref: REFS[l.name], link: true } : l)) : st.design,
    basis: {
      ...b,
      machines: b.machines ?? fresh.machines,
      fuel: b.fuel ?? fresh.fuel,
      quotes: b.quotes ?? fresh.quotes,
      mats: { ...fresh.mats, ...b.mats },
      calcs: b.calcs.map((c) => {
        const f = fresh.calcs.find((x) => x.no === c.no);
        return f ? { ...c, laborLines: c.laborLines ?? f.laborLines, pctOfLabor: c.pctOfLabor ?? f.pctOfLabor, machineLines: c.machineLines ?? f.machineLines, lines: c.lines ?? f.lines } : c;
      }),
    },
  };
}

function readState(id: string): State | null {
  try {
    const raw = localStorage.getItem(keyOf(id));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<State>;
    const base = id === EXAMPLE_ID ? initial() : blankState({ id, name: j.info?.name ?? '새 공사', client: '', kind: '', created: today() }, j.bidRate ?? 0.88);
    return migrate({ ...base, ...j, info: { ...(j.info ?? (id === EXAMPLE_ID ? EXAMPLE_INFO : base.info)), id } });
  } catch {
    return null;
  }
}
function writeState(st: State) {
  try { localStorage.setItem(keyOf(st.info.id), JSON.stringify(st)); } catch { /* 저장 못 해도 화면은 계속 */ }
}
export function readIndex(): ProjectMeta[] {
  try {
    const j = JSON.parse(localStorage.getItem(IDX) ?? 'null') as ProjectMeta[] | null;
    if (j?.length) return j;
  } catch { /* 처음 */ }
  return [{ id: EXAMPLE_ID, name: EXAMPLE_INFO.name, client: EXAMPLE_INFO.client, kind: EXAMPLE_INFO.kind, amount: 0, phase: '당초', updated: today() }];
}
function writeIndex(list: ProjectMeta[]) {
  try { localStorage.setItem(IDX, JSON.stringify(list)); } catch { /* */ }
}
/** 다른 공사의 상태 (참고 창 · 복사용) */
export function peekProject(id: string): State | null {
  return id === EXAMPLE_ID ? readState(id) ?? initial() : readState(id);
}

function load(): State {
  const cur = localStorage.getItem(CUR) ?? EXAMPLE_ID;
  return readState(cur) ?? (cur === EXAMPLE_ID ? initial() : readState(EXAMPLE_ID) ?? initial());
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
  /** 공사 목록 */
  projects: ProjectMeta[];
  openProject: (id: string) => void;
  /** 새 공사 — from: 'blank' 빈 공사 · 공사 id 를 주면 그 공사를 복사 · State 를 주면 그 내용으로 */
  createProject: (info: Omit<ProjectInfo, 'id' | 'created'>, bidRate: number, from?: 'blank' | string | State) => string;
  deleteProject: (id: string) => void;
}

const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(load);
  const [projects, setProjects] = useState<ProjectMeta[]>(readIndex);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { writeState(s); try { localStorage.setItem(CUR, s.info.id); } catch { /* */ } }, [s]);
  // claude.ai에서 열면 내 계정 저장소에도 둔다 (다른 기기에서도 이어서)
  const remote = useRef<Remote | null>(null);
  const written = useRef<Record<string, string>>({});
  const [saveWhere, setSaveWhere] = useState<'local' | 'account' | 'saving'>('local');
  useEffect(() => {
    let alive = true;
    const pid = s.info.id;
    remote.current = null;
    written.current = {};
    (async () => {
      const r = await remoteStore(Object.keys(initial()), s.info.id === EXAMPLE_ID ? '' : `${s.info.id}-`);
      if (!alive || !r) return;
      try {
        const got = await r.load();
        if (got) {
          for (const [k, v] of Object.entries(got)) written.current[k] = JSON.stringify(v);
          setS((cur) => (cur.info.id === pid ? migrate({ ...cur, ...(got as Partial<State>), info: cur.info }) : cur));
        }
        remote.current = r;
        setSaveWhere('account');
      } catch {
        /* 계정 저장소를 못 쓰면 이 브라우저에만 */
      }
    })();
    return () => { alive = false; };
  }, [s.info.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // 공사 목록의 요약 (도급액 · 단계) 을 맞춰 둔다
  useEffect(() => {
    const t = setTimeout(() => {
      const total = costSheet({ direct: sectionAmount(design, 'main'), waste: sectionAmount(design, 'waste').t, supplied: sectionAmount(design, 'supplied').t, rates: s.rates, exclude: new Set(s.exclude ?? []) }).total;
      const meta: ProjectMeta = { id: s.info.id, name: s.info.name, client: s.info.client, kind: s.info.kind, amount: total, phase: s.changeConfirmed ? `${s.change.name} 확정` : s.progressOn ? `기성 ${s.rounds[s.rounds.length - 1].name}` : '당초', updated: today() };
      setProjects((list) => {
        const old = list.find((x) => x.id === meta.id);
        if (old && JSON.stringify({ ...old, updated: '' }) === JSON.stringify({ ...meta, updated: '' })) return list;
        const next = old ? list.map((x) => (x.id === meta.id ? meta : x)) : [...list, meta];
        writeIndex(next);
        return next;
      });
    }, 600);
    return () => clearTimeout(t);
  }, [s, design]);
  const openProject = (id: string) => {
    if (id === s.info.id) return;
    writeState(s);
    const next = readState(id) ?? (id === EXAMPLE_ID ? initial() : null);
    if (!next) { setMsg('이 공사의 저장된 내용을 찾지 못했습니다'); return; }
    setS(next);
  };
  const createProject: Ctx['createProject'] = (meta, bidRate, from = 'blank') => {
    const id = 'p' + Date.now().toString(36);
    const info: ProjectInfo = { ...meta, id, created: today() };
    let st: State;
    if (from === 'blank') st = blankState(info, bidRate);
    else if (typeof from === 'string') { const src = peekProject(from); st = src ? { ...structuredClone(src), info, bidRate } : blankState(info, bidRate); }
    else st = migrate({ ...blankState(info, bidRate), ...from, info, bidRate });
    writeState(s);
    writeState(st);
    const m: ProjectMeta = { id, name: info.name, client: info.client, kind: info.kind, amount: 0, phase: '당초', updated: today() };
    setProjects((list) => { const next = [...list, m]; writeIndex(next); return next; });
    setS(st);
    return id;
  };
  const deleteProject = (id: string) => {
    try { localStorage.removeItem(keyOf(id)); } catch { /* */ }
    setProjects((list) => { const next = list.filter((x) => x.id !== id); writeIndex(next.length ? next : readIndex()); return next.length ? next : readIndex(); });
    if (id === s.info.id) setS(readState(EXAMPLE_ID) ?? initial());
  };
  const value: Ctx = {
    s, set, design, start, contract, units, editLine, saveWhere, projects, openProject, createProject, deleteProject,
    reset: () => setS(s.info.id === EXAMPLE_ID ? initial() : blankState(s.info, s.bidRate)),
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
