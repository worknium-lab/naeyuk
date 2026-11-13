import { flatten, findLine, lineAmount, unitTotal, sectionAmount, type CostResult, type Line, type Sheet } from './engine';
import type { Cell, SheetSpec } from './xlsx';

/**
 * 설계변경 양식 (계약내역서 · 내역서총괄표 · 계약원가계산서 · 공사비 증감대비표).
 * 한 항목을 두 줄로 — 당초 줄과 변경 줄. 어느 줄을 위에 둘지, 위 줄을 빨강/검정 중 무엇으로 할지는 설정.
 */
export interface ChangeFmt { top: 'before' | 'after'; topColor: 'red' | 'black' }
export const DEFAULT_FMT: ChangeFmt = { top: 'before', topColor: 'red' };

export interface PairRow {
  key: string;
  kind: 'ns' | 'grp' | 'item' | 'blank' | 'total';
  before: Cell[];
  after: Cell[];
  /** 변경 줄에서 수량을 고칠 수 있는 항목 */
  edit?: { id: string; isNew: boolean; qty: number };
  depth?: number;
  changed?: boolean;
}

export function colorOf(fmt: ChangeFmt, which: 'before' | 'after'): 'red' | 'black' {
  const isTop = fmt.top === which;
  return isTop ? fmt.topColor : fmt.topColor === 'red' ? 'black' : 'red';
}
export function legend(fmt: ChangeFmt): string {
  const k = (c: 'red' | 'black') => (c === 'red' ? '빨강' : '검정');
  return `당초 : ${k(colorOf(fmt, 'before'))} / 변경 : ${k(colorOf(fmt, 'after'))}`;
}

const n = (v: number) => (v ? v : '');

function lineCells(l: Line | undefined, ref: Line, depth: number): Cell[] {
  const pad = '  '.repeat(depth);
  if (!l) return [ref.mark, pad + ref.name, ref.spec, '', ref.unit, '', '', '', '', '', '', '', '', ''];
  const a = lineAmount(l);
  const g = !!l.children;
  return [l.mark, pad + l.name, l.spec, g ? '' : n(l.qty), l.unit,
    g ? '' : n(unitTotal(l)), n(a.t), g ? '' : n(l.lu), n(a.l), g ? '' : n(l.mu), n(a.m), g ? '' : n(l.eu), n(a.e), l.ref ?? ''];
}

/** 계약내역서 (두 줄) — 순공사비가 맨 위 */
export function naeRows(before: Sheet, after: Sheet, opts: { groupsOnly?: boolean; maxDepth?: number } = {}): PairRow[] {
  const out: PairRow[] = [];
  const bm = sectionAmount(before, 'main'), am = sectionAmount(after, 'main');
  const nsCells = (m: typeof bm, tag: string): Cell[] => ['', '순 공 사 비', '', '', '', '', m.t, '', m.l, '', m.m, '', m.e, tag];
  out.push({ key: 'ns', kind: 'ns', before: nsCells(bm, '당초'), after: nsCells(am, '변경'), changed: bm.t !== am.t });
  for (const sec of after.sections) {
    const bsec = before.sections.find((x) => x.section === sec.section);
    for (const r of flatten(sec.lines)) {
      const l = r.line;
      if (opts.groupsOnly && !l.children) continue;
      if (opts.maxDepth !== undefined && r.depth > opts.maxDepth) continue;
      const b = bsec ? findLine(bsec.lines, l.id) : undefined;
      const changed = !b || lineAmount(b).t !== r.amount.t;
      out.push({
        key: l.id, kind: l.children ? 'grp' : 'item', depth: r.depth, changed,
        before: lineCells(b, l, r.depth), after: lineCells(l, l, r.depth),
        edit: l.children ? undefined : { id: l.id, isNew: !b, qty: l.qty },
      });
    }
    if (sec.section !== 'main') continue;
    out.push({ key: 'blank-main', kind: 'blank', before: [], after: [] });
  }
  return out;
}

/** 총괄표 칸만 (공종 · 품명 · 규격 · 수량 · 단위 · 합계 · 노무비 · 재료비 · 경비 · 비고) */
export function chongCells(c: Cell[]): Cell[] {
  return [c[0], c[1], c[2], c[3], c[4], c[6], c[8], c[10], c[12], c[13]];
}

/** 계약원가계산서 (두 줄) */
export function wonRows(before: CostResult, after: CostResult): PairRow[] {
  return before.rows.map((r) => {
    const a = after.rows.find((x) => x.key === r.key)!;
    const cells = (x: typeof r): Cell[] => [x.no, (x.group ? `${x.group} · ` : '') + x.label, x.amount ?? '', x.rate ?? '', x.basis ?? ''];
    return { key: r.key, kind: r.total ? 'total' : 'item', before: cells(r), after: cells(a), changed: (r.amount ?? 0) !== (a.amount ?? 0) };
  });
}

/** 공사비 증·감대비표 */
export function jeungRows(before: CostResult, after: CostResult): Cell[][] {
  const pick = ['A', 'B', 'exp', 'il', 'ind', 'emp', 'health', 'pension', 'care', 'retire', 'machGuar', 'safety', 'env', 'subGuar', 'etc', 'C', 'D', 'gen', 'profit', 'waste', 'H', 'vat', 'J', 'supplied', 'L'];
  const label: Record<string, string> = { A: '재료비', B: '노무비', exp: '산출경비', C: '경비 소계', D: '순공사원가', H: '총원가', J: '도급액', L: '총공사비' };
  const out: Cell[][] = [];
  const ns0 = before.get('A') + before.get('dl') + before.get('exp');
  const ns1 = after.get('A') + after.get('dl') + after.get('exp');
  out.push(['순 공 사 비', ns0, ns1, ns1 - ns0]);
  for (const k of pick) {
    const r = before.rows.find((x) => x.key === k);
    if (!r) continue;
    const a = before.get(r.key), b = after.get(r.key);
    if (!a && !b) continue;
    out.push([label[k] ?? r.label, a, b, b - a]);
  }
  return out;
}

/* ---------- 엑셀 (빨강/검정 그대로) ---------- */
const RED = 'C00000';

const fl = (x: string) => `INT(ROUND(${x},6))`;
const num0 = (c: Cell) => (typeof c === 'number' ? c : 0);

function pairSheet(name: string, title: string, head: Cell[][], rows: PairRow[], fmt: ChangeFmt, map: (c: Cell[]) => Cell[] = (c) => c, widths?: number[], formulas = false): SheetSpec {
  const out: Cell[][] = [[title], [legend(fmt)], ...head];
  const rowColor: Record<number, string> = {};
  const order: ('before' | 'after')[] = fmt.top === 'before' ? ['before', 'after'] : ['after', 'before'];
  // 엑셀 줄 번호 (1부터) — 수식에서 쓴다
  const at: { before: number; after: number }[] = [];
  const cellsOf: Cell[][][] = [];
  for (const r of rows) {
    if (r.kind === 'blank') { out.push([]); at.push({ before: 0, after: 0 }); cellsOf.push([]); continue; }
    const pos = { before: 0, after: 0 };
    const pair: Cell[][] = [];
    for (const w of order) {
      if (colorOf(fmt, w) === 'red') rowColor[out.length] = RED;
      pos[w] = out.length + 1;
      const c = map(r[w]);
      pair.push(c);
      out.push(c);
    }
    at.push(pos); cellsOf.push(pair);
  }
  if (formulas) {
    // 항목: 금액 = 수량 × 단가 (원 미만 버림) · 공종/순공사비: 바로 아래 항목·공종의 합
    rows.forEach((r, i) => {
      if (r.kind === 'blank') return;
      for (const w of order) {
        const R = at[i][w];
        const c = out[R - 1];
        if (r.kind === 'item' && typeof c[3] === 'number') {
          for (const k of [7, 9, 11]) c[k] = num0(c[k]);
          c[8] = { f: fl(`D${R}*H${R}`), v: num0(c[8]) };
          c[10] = { f: fl(`D${R}*J${R}`), v: num0(c[10]) };
          c[12] = { f: fl(`D${R}*L${R}`), v: num0(c[12]) };
          c[5] = { f: `H${R}+J${R}+L${R}`, v: num0(c[5]) };
          c[6] = { f: `I${R}+K${R}+M${R}`, v: num0(c[6]) };
        } else if (r.kind === 'grp' || r.kind === 'ns') {
          const kids: number[] = [];
          if (r.kind === 'ns') { for (let k = i + 1; k < rows.length && rows[k].kind !== 'blank'; k++) if (rows[k].depth === 0) kids.push(at[k][w]); }
          else for (let k = i + 1; k < rows.length && rows[k].kind !== 'blank' && (rows[k].depth ?? 0) > (r.depth ?? 0); k++) if (rows[k].depth === (r.depth ?? 0) + 1) kids.push(at[k][w]);
          if (!kids.length) continue;
          for (const [k, col] of [[6, 'G'], [8, 'I'], [10, 'K'], [12, 'M']] as const) c[k] = { f: `SUM(${kids.map((x) => col + x).join(',')})`, v: num0(c[k]) };
        }
      }
    });
  }
  return { name, rows: out, rowColor, widths, head: head.map((_, k) => 2 + k), colFmt: { 3: '#,##0.####;"△"#,##0.####;""' }, colAlign: { 0: 'center', 4: 'center' } };
}

export function changeWorkbook(before: { sheet: Sheet; cost: CostResult }, after: { sheet: Sheet; cost: CostResult }, fmt: ChangeFmt, name: string): SheetSpec[] {
  const nae = naeRows(before.sheet, after.sheet);
  const head1: Cell[][] = [['공종', '품명', '규격', '수량', '단위', '합계 단가', '합계 금액', '노무비 단가', '노무비 금액', '재료비 단가', '재료비 금액', '경비 단가', '경비 금액', '비고']];
  const chong = naeRows(before.sheet, after.sheet, { groupsOnly: true, maxDepth: 2 });
  const head2: Cell[][] = [['공종', '품명', '규격', '수량', '단위', '합계', '노무비', '재료비', '경비', '비고']];
  const won = wonRows(before.cost, after.cost);
  const head3: Cell[][] = [['구분', '비목', '금액', '요율', '산출근거']];
  const jeung = jeungRows(before.cost, after.cost);
  return [
    pairSheet('계약내역서', `계약내역서 — ${name}`, head1, nae, fmt, undefined, [5, 40, 22, 10, 6, 12, 15, 12, 15, 12, 15, 12, 15, 12], true),
    pairSheet('내역서총괄표', `내역서총괄표 — ${name}`, head2, chong, fmt, chongCells, [5, 36, 16, 8, 6, 16, 16, 16, 16, 10]),
    pairSheet('계약원가계산서', `계약 원가계산서 — ${name}`, head3, won, fmt, undefined, [6, 34, 16, 10, 30]),
    { name: '공사비 증감대비', rows: [[`공사비 증·감대비표 — ${name}`], [], ['품명', '당초', '변경', '증·감'], ...jeung.map((r, i) => [r[0], r[1], r[2], { f: `C${i + 4}-B${i + 4}`, v: r[3] as number }])], widths: [24, 16, 16, 16] },
  ];
}
