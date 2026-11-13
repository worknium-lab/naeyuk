import unitRows from './unitcost.rows.json';
import calcRows from './calc.rows.json';
import tables from './tables.json';
import { parseNum, normName, type Basis, type ULine, type UnitDef, type Wage, type Mat } from '../engine';

type R = string[];

/** 노임 — 공사 작성 당시(2022 상반기) 적용, 2026 하반기 공표 노임은 cur */
function wages(): Record<string, Wage> {
  const body = (tables as Record<string, R[][]>).Labor[0].slice(2);
  const out: Record<string, Wage> = {};
  for (const r of body) {
    out[normName(r[1])] = { name: r[1], unit: r[2], old: parseNum(r[3]), cur: r[6] ? parseNum(r[6]) : null, use: 'old', code: r[5] };
  }
  return out;
}

export const matKey = (name: string, spec: string) => `${normName(name)}|${normName(spec)}`;

/** 일위대가 호표 — 용암교 xls 기준 줄을 근거 종류별로 나눈다 */
export function basisData(): Basis {
  const W = wages();
  const mats: Record<string, Mat> = {};
  const units: UnitDef[] = [];
  const rows = unitRows as R[];
  let cur: UnitDef | null = null;
  rows.forEach((r, i) => {
    if (r[0] === 'grp') {
      cur = { no: r[1], name: r[3], spec: r[4], unit: r[6], note: r[15] || undefined, lines: [] };
      units.push(cur);
      return;
    }
    if (!cur) return;
    const name = r[3], spec = r[4], unit = r[6], note = r[15];
    const qty = parseNum(r[5]);
    const la = parseNum(r[10]), ma = parseNum(r[12]), ea = parseNum(r[14]);
    const col: 'l' | 'm' | 'e' = la ? 'l' : ma ? 'm' : 'e';
    const base = { id: `${cur.no}-${i}`, name, spec, qty, unit, note: note || undefined };
    let ln: ULine;
    const u = note.match(/일위(\d+)참조/);
    const c = note.match(/단산(\d+)참조/);
    if (u) ln = { ...base, kind: 'unit', ref: `제${u[1]}호표` };
    else if (c) ln = { ...base, kind: 'calc', ref: `단산${c[1]}` };
    else if (unit === '%') ln = { ...base, kind: 'pct', col };
    else if (name === '단위조정') ln = { ...base, kind: 'fixed', col, amt: la || ma || ea };
    else if (W[normName(name)]) ln = { ...base, kind: 'labor', ref: normName(name) };
    else {
      const key = matKey(name, spec);
      mats[key] = { key, name, spec, unit, price: parseNum(r[11]) };
      ln = { ...base, kind: 'mat', ref: key };
    }
    cur.lines.push(ln);
  });
  const crow = calcRows as R[];
  const calcs = crow.filter((r) => r[0] === 'grp').map((r) => {
    const name = r[4].replace(/^\d+\./, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
    const unit = (r[4].match(/\[([^\]]*)\]\s*$/) ?? [])[1] ?? '';
    // "특별인부 : 187,435 × 3 인 ÷ 15 m = …" 같은 노임 줄
    const laborLines: { wage: string; mult: number }[] = [];
    let pctOfLabor: { col: 'm' | 'e'; pct: number } | undefined;
    for (const x of crow.filter((y) => y[1] === r[1] && y[0] !== 'grp')) {
      const m = x[4].match(/^(.+?)\s*:\s*[\d,]+\s*×\s*([\d.]+)\s*인(?:\s*÷\s*([\d.]+))?/);
      if (m && W[normName(m[1])]) laborLines.push({ wage: m[1], mult: Number(m[2]) / (m[3] ? Number(m[3]) : 1) });
      const p = x[4].match(/노무비의\s*([\d.]+)\s*%/);
      if (p) pctOfLabor = { col: 'm', pct: Number(p[1]) };
    }
    return { no: `단산${r[1].slice(1)}`, name, unit, l: parseNum(r[6]), m: parseNum(r[7]), e: parseNum(r[8]), laborLines, pctOfLabor };
  });
  return { wages: W, mats, units, calcs };
}
