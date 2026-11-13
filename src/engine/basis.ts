import type { Line, Sheet } from './types';
import { mapSheet } from './estimate';
import { floor } from './num';

/**
 * 근거 데이터 — 노임 · 자재 · 일위대가 호표 · 단가산출.
 * 호표는 노임·자재·다른 호표·단가산출을 수량으로 묶고, 값은 비목별로 원 미만 버림.
 */

export interface Wage { name: string; unit: string; old: number; cur: number | null; use: 'old' | 'cur'; code: string }
export interface Mat { key: string; name: string; spec: string; unit: string; price: number }

export type ULineKind = 'labor' | 'mat' | 'unit' | 'calc' | 'pct' | 'fixed';
export interface ULine {
  id: string;
  kind: ULineKind;
  name: string;
  spec: string;
  qty: number;
  unit: string;
  /** labor: 노임 이름 · mat: 자재 key · unit: 제N호표 · calc: 단산N */
  ref?: string;
  /** pct/fixed가 들어갈 비목 */
  col?: 'l' | 'm' | 'e';
  /** fixed 금액 */
  amt?: number;
  note?: string;
}
export interface UnitDef { no: string; name: string; spec: string; unit: string; note?: string; lines: ULine[]; from?: string }
export interface CalcDef {
  no: string; name: string; unit: string;
  /** 산출 당시 값 (원 미만 버림 전 합계와 같음) */
  l: number; m: number; e: number;
  /** 산출근거에서 읽은 노임 줄 — 노임이 바뀌면 그 차이만큼 노무비를 고친다 */
  laborLines?: { wage: string; mult: number }[];
  /** 노무비의 % 를 다른 비목에 넣는 줄 (공구손료 등) */
  pctOfLabor?: { col: 'm' | 'e'; pct: number };
}

/** 단가산출 값 — 노임이 갱신되면 연결된 노임 줄의 차이를 반영 */
export function calcPrice(b: Basis, c: CalcDef): Price {
  if (!c.laborLines?.length) return { l: c.l, m: c.m, e: c.e };
  const wages = new Map(Object.values(b.wages).map((w) => [normName(w.name), w]));
  let dl = 0;
  for (const ln of c.laborLines) {
    const w = wages.get(normName(ln.wage));
    if (w) dl += (wageOf(w) - w.old) * ln.mult;
  }
  const r1 = (x: number) => Math.floor(x * 10 + 1e-6) / 10;
  dl = r1(dl);
  const l = floor(c.l + dl);
  let m = c.m, e = c.e;
  if (c.pctOfLabor) {
    const d = floor(r1((dl * c.pctOfLabor.pct) / 100));
    if (c.pctOfLabor.col === 'm') m += d; else e += d;
  }
  return { l, m, e };
}

export interface Basis {
  wages: Record<string, Wage>;
  mats: Record<string, Mat>;
  units: UnitDef[];
  calcs: CalcDef[];
}

export interface Price { l: number; m: number; e: number }
export interface LineCalc { line: ULine; price: number; l: number; m: number; e: number }
export interface UnitCalc { def: UnitDef; total: Price; lines: LineCalc[]; error?: string }

export const normName = (s: string) => s.replace(/\s+/g, '');
export const wageOf = (w: Wage) => (w.use === 'cur' && w.cur ? w.cur : w.old);

/** 모든 호표를 계산 (하위 호표 먼저, 순환 참조는 0으로 막음) */
export function computeUnits(b: Basis): Map<string, UnitCalc> {
  const defs = new Map(b.units.map((u) => [u.no, u]));
  const calcs = new Map(b.calcs.map((c) => [c.no, c]));
  const wages = new Map(Object.values(b.wages).map((w) => [normName(w.name), w]));
  const out = new Map<string, UnitCalc>();
  const busy = new Set<string>();

  const unit = (no: string): UnitCalc | undefined => {
    if (out.has(no)) return out.get(no);
    const def = defs.get(no);
    if (!def) return undefined;
    if (busy.has(no)) return { def, total: { l: 0, m: 0, e: 0 }, lines: [], error: '순환 참조' };
    busy.add(no);
    const lines: LineCalc[] = [];
    let sl = 0, sm = 0, se = 0;
    for (const ln of def.lines) {
      let l = 0, m = 0, e = 0, price = 0;
      if (ln.kind === 'labor') {
        const w = wages.get(normName(ln.ref ?? ln.name));
        price = w ? wageOf(w) : 0;
        l = ln.qty * price;
      } else if (ln.kind === 'mat') {
        price = b.mats[ln.ref ?? '']?.price ?? 0;
        m = ln.qty * price;
      } else if (ln.kind === 'unit') {
        const u = unit(ln.ref ?? '');
        const p = u?.total ?? { l: 0, m: 0, e: 0 };
        price = p.l + p.m + p.e;
        l = ln.qty * p.l; m = ln.qty * p.m; e = ln.qty * p.e;
      } else if (ln.kind === 'calc') {
        const c = calcs.get(ln.ref ?? '');
        const p = c ? calcPrice(b, c) : { l: 0, m: 0, e: 0 };
        price = p.l + p.m + p.e;
        l = ln.qty * p.l; m = ln.qty * p.m; e = ln.qty * p.e;
      } else if (ln.kind === 'pct') {
        price = sl; // 노무비의 %
        const v = (sl * ln.qty) / 100;
        if (ln.col === 'm') m = v; else if (ln.col === 'l') l = v; else e = v;
      } else {
        const v = ln.amt ?? 0;
        price = v;
        if (ln.col === 'm') m = v; else if (ln.col === 'l') l = v; else e = v;
      }
      // 금액은 소수 첫째 자리까지 (호표 양식 관례)
      const r1 = (x: number) => Math.floor(x * 10 + 1e-6) / 10;
      l = r1(l); m = r1(m); e = r1(e);
      sl += l; sm += m; se += e;
      lines.push({ line: ln, price, l, m, e });
    }
    busy.delete(no);
    const res: UnitCalc = { def, total: { l: floor(sl), m: floor(sm), e: floor(se) }, lines };
    out.set(no, res);
    return res;
  };
  for (const u of b.units) unit(u.no);
  return out;
}

export function basisPrice(b: Basis, units: Map<string, UnitCalc>, ref?: string): Price | undefined {
  if (!ref) return undefined;
  const u = units.get(ref);
  if (u) return u.total;
  const c = b.calcs.find((x) => x.no === ref);
  return c ? calcPrice(b, c) : undefined;
}

/** 근거에 연결된 내역 줄의 단가를 근거 값으로 바꾼다 (설계내역서) */
export function resolveSheet(sheet: Sheet, b: Basis, units = computeUnits(b)): Sheet {
  return mapSheet(sheet, (l: Line) => {
    if (l.children || !l.link) return l;
    const p = basisPrice(b, units, l.ref);
    if (!p) return l;
    if (l.asExpense) return { ...l, lu: 0, mu: 0, eu: p.l + p.m + p.e };
    return { ...l, lu: p.l, mu: p.m, eu: p.e };
  });
}

/** 이 근거를 쓰는 곳 (호표 → 상위 호표, 내역 줄) */
export function usages(b: Basis, sheet: Sheet, ref: string): string[] {
  const out: string[] = [];
  for (const u of b.units) if (u.lines.some((x) => x.ref === ref)) out.push(u.no);
  const walk = (ls: Line[]) => ls.forEach((l) => { if (l.ref === ref) out.push(`내역 · ${l.name}`); if (l.children) walk(l.children); });
  sheet.sections.forEach((s) => walk(s.lines));
  return out;
}
