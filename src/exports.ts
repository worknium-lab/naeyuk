import { flatten, lineAmount, unitTotal, sectionAmount, type CostResult, type Line, type Sheet, type RoundMode, type SubcontractResult } from './engine';
import { FMT_QTY, type Cell, type SheetSpec } from './xlsx';

const W = [4, 5, 40, 24, 10, 6, 12, 15, 12, 15, 12, 15, 12, 15, 12];
export const qs = (name: string) => `'${name.slice(0, 31).replace(/'/g, "''")}'`;
export const fl = (expr: string) => `INT(ROUND(${expr},6))`;

/** 표준 내역서 양식 머리글 (2줄) */
function naeHead(rows: Cell[][]) {
  const r0 = rows.length;
  rows.push(['L', '공종', '품    명', '규    격', '수 량', '단위', '합    계', '', '노 무 비', '', '재 료 비', '', '경    비', '', '비 고']);
  rows.push(['', '', '', '', '', '', '단 가', '금 액', '단 가', '금 액', '단 가', '금 액', '단 가', '금 액', '']);
  const merges = [0, 1, 2, 3, 4, 5, 14].map((c) => ({ s: { r: r0, c }, e: { r: r0 + 1, c } }));
  for (const c of [6, 8, 10, 12]) merges.push({ s: { r: r0, c }, e: { r: r0, c: c + 1 } });
  return { head: [r0, r0 + 1], merges };
}

/** 내역서에서 원가계산서가 끌어 쓸 칸 (수식 문자열) */
export interface SheetLink { l: string; m: string; e: string; supplied?: string; waste?: string }
export interface SheetOpts {
  /** 단가 칸 수식: 엑셀 줄 번호·열 글자(I/K/M) → 수식 */
  price?: (R: number, col: 'I' | 'K' | 'M') => string;
  /** 제목 아래 줄 (예: 하도급율 칸) */
  note?: Cell[];
}

/** 표준 내역서 양식 (순공사비 · 관급자재대 · 폐기물처리비) — 금액은 수식 */
export function sheetRows(title: string, sheet: Sheet, sheetName = '내역서', opts: SheetOpts = {}): SheetSpec & { link: SheetLink; rowOf: Record<string, number> } {
  const rows: Cell[][] = [[title], opts.note ?? []];
  const rowOf: Record<string, number> = {};
  const { head, merges } = naeHead(rows);
  const rowStyle: Record<number, 'group' | 'group2' | 'total'> = {};
  const q = `'${sheetName.replace(/'/g, "''")}'`;
  const link: SheetLink = { l: '0', m: '0', e: '0' };
  for (const sec of sheet.sections) {
    const flat = flatten(sec.lines);
    const start = rows.length;
    flat.forEach((r, k) => {
      const l = r.line, a = lineAmount(l), R = rows.length + 1; // 엑셀 줄 번호
      const pad = '  '.repeat(r.depth);
      rowOf[l.id] = R;
      if (l.children) {
        let end = k;
        while (end + 1 < flat.length && flat[end + 1].depth > r.depth) end++;
        const from = R + 1, to = R + (end - k);
        const sub = (c: string, v: number) => (to >= from ? { f: `SUBTOTAL(9,${c}${from}:${c}${to})`, v } : v);
        rows.push([l.level || '', l.mark, pad + l.name, l.spec, '', l.unit, '', sub('H', a.t), '', sub('J', a.l), '', sub('L', a.m), '', sub('N', a.e), l.ref ?? '']);
        rowStyle[rows.length - 1] = r.depth === 0 ? 'group' : 'group2';
      } else {
        rows.push([l.level || '', l.mark, pad + l.name, l.spec, l.qty, l.unit,
          { f: `I${R}+K${R}+M${R}`, v: unitTotal(l) }, { f: `J${R}+L${R}+N${R}`, v: a.t },
          opts.price ? { f: opts.price(R, 'I'), v: l.lu } : l.lu, { f: fl(`E${R}*I${R}`), v: a.l },
          opts.price ? { f: opts.price(R, 'K'), v: l.mu } : l.mu, { f: fl(`E${R}*K${R}`), v: a.m },
          opts.price ? { f: opts.price(R, 'M'), v: l.eu } : l.eu, { f: fl(`E${R}*M${R}`), v: a.e }, l.ref ?? '']);
      }
    });
    const from = start + 1, to = rows.length;
    const tot = (c: string) => `SUBTOTAL(9,${c}${from}:${c}${to})`;
    if (sec.section === 'main') {
      const m = sectionAmount(sheet, 'main');
      rows.push([]);
      const R = rows.length + 1;
      rows.push(['', '', '순   공   사   비', '', '', '', '', { f: tot('H'), v: m.t }, '', { f: tot('J'), v: m.l }, '', { f: tot('L'), v: m.m }, '', { f: tot('N'), v: m.e }, '']);
      rowStyle[rows.length - 1] = 'total';
      Object.assign(link, { l: `${q}!J${R}`, m: `${q}!L${R}`, e: `${q}!N${R}` });
      rows.push([]);
    } else {
      if (sec.section === 'supplied') link.supplied = `SUBTOTAL(9,${q}!H${from}:H${to})`;
      if (sec.section === 'waste') link.waste = `SUBTOTAL(9,${q}!H${from}:H${to})`;
      rows.push([]);
    }
  }
  return { name: sheetName, rows, widths: W, head, merges, rowStyle, colFmt: { 4: FMT_QTY }, colAlign: { 0: 'center', 1: 'center', 5: 'center' }, link, rowOf };
}

/** "(A + 4 + 6) × 0.009" 같은 산출근거를 엑셀 수식으로 */
export function basisFormula(basis: string, ref: (no: string) => string | undefined): string | null {
  if (/[가-힣]/.test(basis)) return null;
  let ok = true;
  let f = basis.replace(/(\d+\.\d+)|(\d{1,3}(?:,\d{3})+)|\b([A-L])\b|\b(\d{1,2})\b/g, (m, dec, comma, letter, int) => {
    if (dec) return dec;
    if (comma) return comma.replace(/,/g, '');
    const r = ref(letter ?? int);
    if (!r) { ok = false; return m; }
    return r;
  });
  f = f.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  f = f.replace(/\(([A-Z]+\d+)~([A-Z]+\d+)\)/g, 'SUM($1:$2)');
  return ok ? f : null;
}

/** 원가계산서 (1~18, A~L) — 비목은 수식, link 가 있으면 내역서 순공사비를 끌어온다 */
export interface CostOpts {
  /** 공급가액(H) 맞춤 — 자기 시트의 D·E·G 와 계산 이윤으로 만든 목표 공급가액 수식. "{P}" 자리에 끝수 정리 전 공급가액이 들어간다 */
  target?: string;
  /** 제목 아래 줄 */
  note?: Cell[];
}
export function costRows(title: string, c: CostResult, compare?: { label: string; cost: CostResult; ref?: { name: string; keyRow: Record<string, number> } }[], link?: SheetLink, opts: CostOpts = {}): SheetSpec & { at: Map<string, string>; keyRow: Record<string, number> } {
  const rows: Cell[][] = [[title], opts.note ?? []];
  const keyRow: Record<string, number> = {};
  const rowStyle: Record<number, 'sum' | 'total'> = {};
  if (compare) {
    rows.push(['구분', '비목', ...compare.map((x) => x.label), '요율', '산출근거']);
    for (const r of c.rows) {
      if (['mat', 'scrap', 'perfGuar'].includes(r.key)) continue;
      rows.push([r.no, r.label, ...compare.map((x): Cell => {
        const v = x.cost.rows.find((y) => y.key === r.key)?.amount;
        if (v === null || v === undefined) return '';
        const kr = x.ref?.keyRow[r.key];
        return x.ref && kr ? { f: `${qs(x.ref.name)}!C${kr}`, v } : v;
      }), r.rate ?? '', r.basis ?? '']);
      if (r.total) rowStyle[rows.length - 1] = 'sum';
    }
    return { name: '원가계산서', rows, widths: [6, 30, ...compare.map(() => 16), 10, 30], rowStyle, at: new Map(), keyRow, head: [2] };
  }
  rows.push(['구분', '비    목', '금    액', '요 율', '산 출 근 거']);
  const first = rows.length;
  const at = new Map(c.rows.map((r, i) => [r.no, `C${first + i + 1}`]));
  const LINKED: Record<string, keyof SheetLink> = { indMat: 'm', dl: 'l', exp: 'e', supplied: 'supplied', waste: 'waste' };
  for (const r of c.rows) {
    let amt: Cell = r.amount ?? '';
    if (r.amount !== null) {
      const lk = link && LINKED[r.key] ? link[LINKED[r.key]] : undefined;
      if (lk) amt = { f: lk, v: r.amount };
      else if (r.key === 'profit' && r.roundAdj !== undefined && !opts.target) {
        // 이윤 = 원래 이윤 수식 + TRUNC(단수정리값 / 1.1, 0)
        const auto = (r.basis ?? '').match(/×\s*[\d.]+\s*([+−-])\s*([\d,]+)\s*\+\s*TRUNC/);
        const base = basisFormula((r.basis ?? '').replace(/\s*\+\s*TRUNC.*$/, '').replace(/\s*[+−-]\s*[\d,]+$/, ''), (no) => at.get(no));
        if (base) amt = { f: `${fl(base)}${auto ? (auto[1] === '+' ? '+' : '-') + auto[2].replace(/,/g, '') : ''}+TRUNC(${r.roundAdj}/1.1,0)`, v: r.amount };
      } else if (r.key === 'profit' && opts.target) {
        // 이윤 = 목표 공급가액 − (D + E + G) : 끝수 정리 차이를 이윤에서 정산
        const base = basisFormula((r.basis ?? '').replace(/\s*[+−-]\s*[\d,]+$/, ''), (no) => at.get(no));
        const D = at.get('D'), E = at.get('E'), G = at.get('G');
        // 순공사원가 다음에 추가한 비목도 총원가에 들어간다
        const X = c.rows.filter((q) => q.extra && !q.group && q.amount !== null).map((q) => at.get(q.no)).filter(Boolean);
        if (base && D && E && G) {
          const xs = X.map((x) => `+${x}`).join('');
          const pre = `(${D}+${E}+${fl(base)}+${G}${xs})`;
          amt = { f: `${opts.target.replace(/\{P\}/g, pre)}-${D}-${E}-${G}${X.map((x) => `-${x}`).join('')}`, v: r.amount };
        }
      } else if (r.basis) {
        const f = basisFormula(r.basis, (no) => at.get(no));
        if (f) amt = { f: r.total ? f.replace(/^\((.*)\)$/, '$1') : fl(f), v: r.amount };
      }
    }
    keyRow[r.key] = rows.length + 1;
    rows.push([{ v: r.no, align: 'center' }, (r.group ? `${r.group} · ` : '') + r.label, amt, { v: r.rate ?? '', align: 'right' }, r.basis ?? '']);
    if (r.key === 'J' || r.key === 'L') rowStyle[rows.length - 1] = 'total';
    else if (r.total) rowStyle[rows.length - 1] = 'sum';
  }
  return { name: '원가계산서', rows, widths: [6, 38, 17, 10, 34], rowStyle, at, keyRow, head: [2] };
}

/** 내역서 + 원가계산서를 서로 수식으로 이어서 */
export function docBook(title: string, sheet: Sheet, cost: CostResult, names = { sheet: '내역서', cost: '원가계산서' }): SheetSpec[] {
  const n = sheetRows(title, sheet, names.sheet);
  return [{ ...costRows(`${title} 원가계산서`, cost, undefined, n.link), name: names.cost }, n];
}

/** 원·하도급 대비내역서 — refs 가 있으면 대상·하도급 칸은 각 내역서 시트를 끌어온다 */
export function compareRows(start: Line[], target: Line[], sub: Line[], refs?: { t: { name: string; rowOf: Record<string, number> }; s: { name: string; rowOf: Record<string, number> } }): SheetSpec {
  const tMap = new Map(flatten(target).map((x) => [x.line.id, x]));
  const sMap = new Map(flatten(sub).map((x) => [x.line.id, x]));
  const rows: Cell[][] = [['원·하도급 대비내역서'], [], ['공종명', '규격', '단위', '도급 수량', '도급 단가', '도급 금액', '대상 수량', '대상 금액', '하도급 단가', '하도급 금액', '비율']];
  const rowStyle: Record<number, 'group' | 'group2'> = {};
  for (const r of flatten(start)) {
    const l = r.line, g = !!l.children, t = tMap.get(l.id), s = sMap.get(l.id);
    const R = rows.length + 1;
    const tr = refs?.t.rowOf[l.id], sr = refs?.s.rowOf[l.id];
    const ref = (name: string | undefined, row: number | undefined, col: string, v: number): Cell => (name && row ? { f: `${qs(name)}!${col}${row}`, v } : v);
    rows.push(['  '.repeat(r.depth) + `${l.mark} ${l.name}`, l.spec, l.unit, g ? '' : l.qty, g ? '' : unitTotal(l), r.amount.t,
      t && !g ? ref(refs?.t.name, tr, 'E', l.qty) : '', t ? ref(refs?.t.name, tr, 'H', t.amount.t) : '',
      s && !g ? ref(refs?.s.name, sr, 'G', unitTotal(s.line)) : '', s ? ref(refs?.s.name, sr, 'H', s.amount.t) : '',
      s && t && t.amount.t ? { f: `IF(H${R}=0,"",J${R}/H${R})`, v: s.amount.t / t.amount.t } : '']);
    if (g) rowStyle[rows.length - 1] = r.depth === 0 ? 'group' : 'group2';
  }
  return { name: '대비내역서', rows, rowStyle, widths: [40, 22, 6, 10, 12, 14, 10, 14, 12, 14, 8], colFmt: { 3: FMT_QTY, 6: FMT_QTY, 10: '0.00%' }, colAlign: { 2: 'center' } };
}

const roundF = (x: string, mode: RoundMode) => (mode === 'floor1000' ? `ROUNDDOWN(${x},-3)` : mode === 'floor10000' ? `ROUNDDOWN(${x},-4)` : mode === 'ceil1000' ? `ROUNDUP(${x},-3)` : `INT(${x})`);
const mainOnly = (lines: Line[]): Sheet => ({ sections: [{ section: 'main', lines }] });

/**
 * 하도급 묶음 — 대상 내역서(착공 단가) → 하도급 내역서(단가 = 대상 단가 × 하도급율) →
 * 대상 원가계산서(공급가액 천원 미만 버림) → 하도급 원가계산서(공급가액 = 대상 공급가액 × 하도급율, 끝수는 이윤에서)
 */
export function subBook(o: { vendor: string; trade: string; rate: number; round: RoundMode; r: SubcontractResult; label?: string }) {
  const N = { t: '하도급대상', s: '하도급내역서', tc: '대상 원가계산서', sc: '하도급 원가계산서' };
  const t = sheetRows(`하도급대상 내역서 — ${o.vendor} · ${o.trade} (착공 단가)`, mainOnly(o.r.targetLines), N.t, { note: [''] });
  const sh = sheetRows(`하도급내역서 — ${o.vendor} · ${o.trade}${o.label ? ` (${o.label})` : ''}`, mainOnly(o.r.subLines), N.s, {
    note: ['', '', { v: '하도급율 (이 칸을 고치면 단가·금액·원가계산서가 다시 계산됩니다)', align: 'right', bold: true }, { v: o.rate, z: '0.000%', bold: true, color: '1F4E8C' }],
    price: (R, col) => fl(`${qs(N.t)}!${col}${R}*$D$2`),
  });
  const tc = costRows(`하도급대상 원가계산서 — ${o.vendor}`, o.r.target, undefined, t.link, { target: 'ROUNDDOWN({P},-3)' });
  const tH = tc.at.get('H')!;
  const sc = costRows(`하도급 원가계산서 — ${o.vendor}`, o.r.sub, undefined, sh.link, { target: roundF(`${qs(N.tc)}!${tH}*${qs(N.s)}!$D$2`, o.round) });
  return {
    sheets: [{ ...sh, name: N.s }, { ...sc, name: N.sc }, { ...t, name: N.t }, { ...tc, name: N.tc }] as SheetSpec[],
    refs: { t: { name: N.t, rowOf: t.rowOf }, s: { name: N.s, rowOf: sh.rowOf } },
    costRef: { tc: { name: N.tc, keyRow: tc.keyRow }, sc: { name: N.sc, keyRow: sc.keyRow } },
  };
}
