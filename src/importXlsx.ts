// 엑셀 가져오기 — 시트마다 종류(내역서·일위대가·총괄표·단가…)를 정하고, 열을 항목에 맞춰(매핑) 읽는다.
import XLSX from 'xlsx-js-style';
import { newId, parseNum, normName, type Line, type Sheet, type Section, type ULine, type UnitDef, type CalcDef, type Wage, type Mat, type CostRates } from './engine';

export type Raw = (string | number | null | undefined)[];
const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '');
const num = (v: unknown) => (typeof v === 'number' ? v : parseNum(String(v ?? '')));
const txt = (v: unknown) => String(v ?? '').trim();

/* ---------- 시트 종류와 항목 ---------- */
export type SheetKind = 'skip' | 'nae' | 'chong' | 'unit' | 'unitSum' | 'calcSum' | 'machSum' | 'mat' | 'labor' | 'cost';
export const KIND_LABEL: Record<SheetKind, string> = {
  skip: '가져오지 않음', nae: '내역서', chong: '내역서 총괄표 (금액 확인용)', unit: '일위대가 (호표 상세)', unitSum: '일위대가 총괄표',
  calcSum: '단가산출 총괄표', machSum: '기계경비 총괄표', mat: '자재단가', labor: '노임단가', cost: '원가계산서 (요율)',
};
export interface Field { k: string; label: string; need?: boolean; words: string[]; sub?: '단가' | '금액' }
const F = (k: string, label: string, words: string[], o: Partial<Field> = {}): Field => ({ k, label, words, ...o });
export const FIELDS: Record<SheetKind, Field[]> = {
  skip: [],
  nae: [
    F('L', 'L (레벨)', ['l', '레벨']), F('mark', '공종 기호', ['공종', '호']), F('name', '품명', ['품명', '공종명', '공사명', '명칭'], { need: true }),
    F('spec', '규격', ['규격']), F('qty', '수량', ['수량']), F('unit', '단위', ['단위']),
    F('lu', '노무비 단가', ['노무비', '노무'], { sub: '단가' }), F('mu', '재료비 단가', ['재료비', '재료'], { sub: '단가' }), F('eu', '경비 단가', ['경비'], { sub: '단가' }),
    F('tu', '합계 단가', ['합계'], { sub: '단가' }), F('la', '노무비 금액', ['노무비', '노무'], { sub: '금액' }), F('ma', '재료비 금액', ['재료비', '재료'], { sub: '금액' }),
    F('ea', '경비 금액', ['경비'], { sub: '금액' }), F('ta', '합계 금액', ['합계'], { sub: '금액' }), F('note', '비고 · 근거', ['비고', '근거']),
  ],
  chong: [F('name', '품명', ['품명', '공종명'], { need: true }), F('ta', '합계', ['합계']), F('la', '노무비', ['노무비']), F('ma', '재료비', ['재료비']), F('ea', '경비', ['경비'])],
  unit: [
    F('no', '호표', ['호표', '호']), F('name', '품명', ['품명'], { need: true }), F('spec', '규격', ['규격']), F('qty', '수량', ['수량']), F('unit', '단위', ['단위']),
    F('lu', '노무비 단가', ['노무비'], { sub: '단가' }), F('mu', '재료비 단가', ['재료비'], { sub: '단가' }), F('eu', '경비 단가', ['경비'], { sub: '단가' }),
    F('la', '노무비 금액', ['노무비'], { sub: '금액' }), F('ma', '재료비 금액', ['재료비'], { sub: '금액' }), F('ea', '경비 금액', ['경비'], { sub: '금액' }),
    F('ta', '합계 금액', ['합계'], { sub: '금액' }), F('note', '비고 · 참조', ['비고']),
  ],
  unitSum: [F('no', '호표', ['호표', '호'], { need: true }), F('name', '품명', ['품명'], { need: true }), F('spec', '규격', ['규격']), F('unit', '단위', ['단위']), F('l', '노무비', ['노무비']), F('m', '재료비', ['재료비']), F('e', '경비', ['경비'])],
  calcSum: [F('no', '번호', ['no', '번호']), F('name', '품명', ['품명'], { need: true }), F('spec', '규격', ['규격']), F('unit', '단위', ['단위']), F('l', '노무비', ['노무비']), F('m', '재료비', ['재료비']), F('e', '경비', ['경비'])],
  machSum: [F('no', '번호', ['no', '번호']), F('name', '품명', ['품명', '명칭'], { need: true }), F('spec', '규격', ['규격']), F('unit', '단위', ['단위']), F('l', '노무비', ['노무비']), F('m', '재료비', ['재료비']), F('e', '경비', ['경비'])],
  mat: [F('name', '품명', ['품명'], { need: true }), F('spec', '규격', ['규격']), F('unit', '단위', ['단위']), F('price', '단가', ['적용단가', '단가'], { need: true })],
  labor: [F('name', '직종', ['품명', '직종'], { need: true }), F('price', '노임', ['적용단가', '노임', '단가'], { need: true })],
  cost: [F('label', '비목', ['비목'], { need: true }), F('rate', '요율', ['요율'], { need: true })],
};

export type Rule = 'auto' | 'mark' | 'indent' | 'noprice' | 'level';
export const RULE_LABEL: Record<Rule, string> = {
  auto: '자동', mark: '공종 기호(● ○ ◈ ■ ㅇ …)가 있으면 공종', indent: '들여쓰기 — 다음 줄이 더 깊으면 공종', noprice: '단가가 없는 줄은 공종', level: 'L(레벨) 열에 값이 있으면 공종',
};

export interface SheetCfg {
  kind: SheetKind;
  head: number;   // 머리글 첫 줄 (0부터)
  head2: boolean; // 머리글이 두 줄 (단가/금액)
  start: number;  // 데이터 첫 줄
  end: number;    // 데이터 마지막 줄 (포함)
  map: Record<string, number>; // 항목 → 열 (-1 = 없음)
  rule: Rule;
  skipSums: boolean; // 계·소계·합계 줄 빼기
  minPrice: boolean; // 자재: 여러 단가 열 중 최저가
}

export interface Book { name: string; sheets: { name: string; rows: Raw[] }[] }

export function readBook(name: string, buf: ArrayBuffer): Book {
  const wb = XLSX.read(buf, { type: 'array', dense: true });
  return {
    name,
    sheets: wb.SheetNames.map((n) => {
      const rows = XLSX.utils.sheet_to_json<Raw>(wb.Sheets[n], { header: 1, raw: true, defval: '' });
      // 끝의 빈 줄 정리 (65536줄짜리 시트)
      let last = rows.length - 1;
      while (last >= 0 && rows[last].every((c) => c === '' || c == null)) last--;
      return { name: n, rows: rows.slice(0, last + 1) };
    }),
  };
}

/* ---------- 자동 판단 ---------- */
export function guessKind(name: string, rows: Raw[]): SheetKind {
  const n = norm(name);
  if (/표지|갑지|대비|기준|적용기준|목차/.test(n)) return 'skip';
  if (n.includes('일위') && n.includes('총괄')) return 'unitSum';
  if (n.includes('일위')) return 'unit';
  if (n.includes('단가산출') && n.includes('총괄')) return 'calcSum';
  if (n.includes('단가산출') || n.includes('단산')) return 'skip';
  if (n.includes('기계경비') && n.includes('총괄')) return 'machSum';
  if (n.includes('기계경비')) return 'skip';
  if (n.includes('자재')) return 'mat';
  if (n.includes('노임')) return 'labor';
  if (n.includes('원가')) return 'cost';
  if (n.includes('총괄')) return n.includes('내역서') ? 'chong' : 'skip';
  if (n.includes('내역')) return 'nae';
  const h = findHead(rows, 'nae');
  if (h >= 0 && rows[h].some((c) => norm(c) === '수량')) return 'nae';
  return 'skip';
}

export function findHead(rows: Raw[], kind: SheetKind): number {
  const keys = FIELDS[kind].filter((f) => f.need).flatMap((f) => f.words);
  const any = keys.length ? keys : ['품명'];
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map((c) => norm(c).toLowerCase());
    if (any.some((w) => cells.some((c) => c === w || (w.length > 1 && c.startsWith(w) && c.length <= w.length + 2)))) return i;
  }
  return -1;
}

/** 위 줄은 합친 칸이 많아 왼쪽 값을 이어 쓰고, 아래 줄(단가/금액)과 함께 열 이름을 만든다 */
export function colNames(rows: Raw[], head: number, head2: boolean): { top: string[]; sub: string[] } {
  const h1 = rows[head] ?? [], h2 = head2 ? rows[head + 1] ?? [] : [];
  const n = Math.max(h1.length, h2.length);
  const top: string[] = [], sub: string[] = [];
  let last = '';
  for (let c = 0; c < n; c++) {
    const t = norm(h1[c]);
    if (t) last = t;
    top[c] = t || (head2 && norm(h2[c]) ? last : '');
    sub[c] = head2 ? norm(h2[c]) : '';
  }
  return { top, sub };
}

export function autoMap(kind: SheetKind, rows: Raw[], head: number, head2: boolean): Record<string, number> {
  const { top, sub } = colNames(rows, head, head2);
  const out: Record<string, number> = {};
  const used = new Set<number>();
  const ok = (f: Field, c: number) => {
    if (f.sub) {
      if (head2 && sub[c] !== f.sub) return false;
      if (!head2 && f.sub === '금액') return false;
    } else if (head2 && sub[c] && (sub[c] === '금액' || sub[c] === 'page')) return false;
    return true;
  };
  // 1차: 열 이름이 꼭 맞는 것
  for (const f of FIELDS[kind]) {
    const c = top.findIndex((t, c) => !used.has(c) && f.words.includes(t.toLowerCase()) && ok(f, c));
    out[f.k] = c;
    if (c >= 0) used.add(c);
  }
  // 2차: 앞부분이 같은 것
  for (const f of FIELDS[kind]) {
    if (out[f.k] >= 0) continue;
    let best = -1;
    for (let c = 0; c < top.length; c++) {
      if (used.has(c)) continue;
      const t = top[c].toLowerCase();
      if (!t) continue;
      const hit = f.words.some((w) => t.startsWith(w));
      if (!hit) continue;
      if (f.sub) {
        if (head2 && sub[c] !== f.sub) continue;
        if (!head2 && f.sub === '금액') continue;
      } else if (head2 && sub[c] && (sub[c] === '금액' || sub[c] === 'page')) continue;
      best = c; break;
    }
    // 합계 단가가 한 줄 머리글에서 '합계' 하나뿐이면 금액으로 본다
    out[f.k] = best;
    if (best >= 0) used.add(best);
  }
  if (!head2 && kind === 'nae' && out.tu >= 0 && out.ta < 0) { out.ta = out.tu; out.tu = -1; }
  return out;
}

export function defaultCfg(rows: Raw[], kind: SheetKind): SheetCfg {
  let head = findHead(rows, kind);
  if (head < 0) head = 0;
  const next = rows[head + 1] ?? [];
  const head2 = next.some((c) => ['단가', '금액'].includes(norm(c)));
  const start = head + (head2 ? 2 : 1);
  return { kind, head, head2, start, end: rows.length - 1, map: autoMap(kind, rows, head, head2), rule: 'auto', skipSums: true, minPrice: kind === 'mat' };
}

/* ---------- 시트 하나 읽기 ---------- */
export interface Preview { tag: string; depth: number; cells: (string | number)[]; warn?: string }
export interface Parsed {
  preview: Preview[];
  note: string[];
  lines?: Record<Section, Line[]>;
  units?: UnitDef[];
  unitTotals?: Record<string, { l: number; m: number; e: number }>;
  calcs?: CalcDef[];
  wages?: Record<string, Wage>;
  mats?: Record<string, Mat>;
  rates?: Partial<CostRates>;
  chong?: { name: string; t: number }[];
}

const SUM_WORDS = /^(계|소계|합계|총계|누계|순공사비계?|공사비계|직접공사비계?)$/;
const MARKS = /^[●○◈■□◆◇▶▷ㅇㆍ·◎※]/;

function cell(r: Raw, c: number | undefined) { return c === undefined || c < 0 ? '' : r[c]; }

export function parseSheet(rows: Raw[], cfg: SheetCfg, ctx: { wages: Record<string, Wage> } = { wages: {} }): Parsed {
  const g = (r: Raw, k: string) => cell(r, cfg.map[k]);
  const body = rows.slice(cfg.start, cfg.end + 1).map((r, i) => ({ r, i: cfg.start + i }));
  switch (cfg.kind) {
    case 'nae': return parseNae(body, cfg, g);
    case 'unit': return parseUnit(body, cfg, g, ctx);
    case 'chong': {
      const chong = body.filter(({ r }) => txt(g(r, 'name'))).map(({ r }) => ({ name: txt(g(r, 'name')).replace(MARKS, '').trim(), t: num(g(r, 'ta')) }));
      return { chong, preview: chong.map((x) => ({ tag: '확인', depth: 0, cells: [x.name, x.t] })), note: ['가져오지 않고, 가져온 내역서의 공종 금액과 비교만 합니다'] };
    }
    case 'unitSum': case 'calcSum': case 'machSum': {
      const calcs: CalcDef[] = [];
      const unitTotals: Record<string, { l: number; m: number; e: number }> = {};
      const pv: Preview[] = [];
      for (const { r } of body) {
        const name = txt(g(r, 'name'));
        if (!name) continue;
        const noRaw = txt(g(r, 'no'));
        const l = num(g(r, 'l')), m = num(g(r, 'm')), e = num(g(r, 'e'));
        if (cfg.kind === 'unitSum') {
          const no = /호표/.test(noRaw) ? noRaw.replace(/\s+/g, '') : noRaw ? `제${noRaw.replace(/\D/g, '')}호표` : '';
          if (!no) continue;
          unitTotals[no] = { l, m, e };
          calcs.push({ no, name: `${name}${txt(g(r, 'spec')) ? ' ' + txt(g(r, 'spec')) : ''}`, unit: txt(g(r, 'unit')), l, m, e });
          pv.push({ tag: no, depth: 0, cells: [name, txt(g(r, 'spec')), txt(g(r, 'unit')), l, m, e] });
        } else {
          const n = noRaw.replace(/\D/g, '') || String(calcs.length + 1);
          const no = cfg.kind === 'calcSum' ? `단산${n}` : `기계${n}`;
          calcs.push({ no, name: `${name}${txt(g(r, 'spec')) ? ' (' + txt(g(r, 'spec')) + ')' : ''}`, unit: txt(g(r, 'unit')), l, m, e });
          pv.push({ tag: no, depth: 0, cells: [name, txt(g(r, 'spec')), txt(g(r, 'unit')), l, m, e] });
        }
      }
      return cfg.kind === 'unitSum'
        ? { unitTotals, calcs, preview: pv, note: ['호표 상세(일위대가 시트)가 없으면 총괄표 금액으로 호표를 만들고, 있으면 상세 합계를 확인하는 데 씁니다'] }
        : { calcs, preview: pv, note: [cfg.kind === 'calcSum' ? '단가산출은 총괄표 금액(노무·재료·경비)으로 들어갑니다 — 산출근거는 단가산출 화면에서 줄로 다시 쓸 수 있습니다' : '기계경비는 시간당 금액으로 들어가고, 일위대가의 "기계N참조" 줄이 이 값을 씁니다'] };
    }
    case 'mat': {
      const mats: Record<string, Mat> = {};
      const { sub } = colNames(rows, cfg.head, cfg.head2);
      const priceCols = cfg.minPrice ? sub.map((s, c) => (s === '단가' ? c : -1)).filter((c) => c >= 0) : [];
      const pv: Preview[] = [];
      for (const { r } of body) {
        const name = txt(g(r, 'name'));
        if (!name) continue;
        const ps = (priceCols.length ? priceCols : [cfg.map.price]).map((c) => num(cell(r, c))).filter((p) => p > 0);
        const price = ps.length ? Math.min(...ps) : 0;
        const spec = txt(g(r, 'spec'));
        const key = `${normName(name)}|${normName(spec)}`;
        mats[key] = { key, name, spec, unit: txt(g(r, 'unit')), price };
        pv.push({ tag: '자재', depth: 0, cells: [name, spec, txt(g(r, 'unit')), price], warn: price ? undefined : '단가 없음' });
      }
      return { mats, preview: pv, note: priceCols.length > 1 ? [`단가 열 ${priceCols.length}개 중 가장 낮은 값을 씁니다`] : [] };
    }
    case 'labor': {
      const wages: Record<string, Wage> = {};
      const pv: Preview[] = [];
      for (const { r } of body) {
        const name = txt(g(r, 'name'));
        const price = num(g(r, 'price'));
        if (!name || !price) continue;
        wages[normName(name)] = { name, unit: '인', old: price, cur: null, use: 'old', code: '' };
        pv.push({ tag: '노임', depth: 0, cells: [name, price] });
      }
      return { wages, preview: pv, note: [] };
    }
    case 'cost': {
      const KEYS: [RegExp, keyof CostRates][] = [
        [/간접노무/, 'il'], [/산재/, 'ind'], [/고용/, 'emp'], [/건강/, 'health'], [/연금/, 'pension'], [/노인장기|요양/, 'care'], [/퇴직/, 'retire'],
        [/건설기계|대여/, 'machGuar'], [/안전/, 'safety'], [/환경/, 'env'], [/기타경비/, 'etc'], [/일반관리/, 'gen'], [/이윤/, 'profit'], [/하도급대금/, 'subGuar'], [/부가가치/, 'vat'],
      ];
      const rates: Partial<CostRates> = {};
      const pv: Preview[] = [];
      for (const { r } of body) {
        // 비목 칸이 여러 칸에 나뉜 양식: 매핑한 열부터 오른쪽 세 칸까지 글을 붙여 본다
        const c0 = cfg.map.label;
        const label = norm([0, 1, 2].map((k) => cell(r, c0 + k)).join('')) || norm(g(r, 'label'));
        const raw = g(r, 'rate');
        if (!label || raw === '' || raw == null) continue;
        let v = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.]/g, ''));
        if (!v) continue;
        if (typeof raw === 'string' && raw.includes('%')) v /= 100;
        else if (v > 1) v /= 100;
        const hit = KEYS.find(([re]) => re.test(label));
        if (!hit || rates[hit[1]] !== undefined) continue;
        rates[hit[1]] = v;
        pv.push({ tag: '요율', depth: 0, cells: [label, `${+(v * 100).toFixed(4)}%`] });
      }
      return { rates, preview: pv, note: ['찾은 요율을 이 공사의 원가계산서 요율로 씁니다'] };
    }
    default: return { preview: [], note: [] };
  }
}

function parseNae(body: { r: Raw; i: number }[], cfg: SheetCfg, g: (r: Raw, k: string) => unknown): Parsed {
  type Row = { r: Raw; name: string; raw: string; indent: number; mark: string; L: number; qty: number; unit: string; spec: string; lu: number; mu: number; eu: number; priced: boolean };
  const rows: Row[] = [];
  const note: string[] = [];
  for (const { r } of body) {
    const raw = String(g(r, 'name') ?? '');
    let name = raw.trim();
    if (!name) continue;
    if (cfg.skipSums && SUM_WORDS.test(norm(name).replace(MARKS, ''))) continue;
    let mark = txt(g(r, 'mark'));
    const mk = name.match(MARKS);
    if (mk) { mark = mark || mk[0]; name = name.replace(MARKS, '').trim(); }
    const qty = num(g(r, 'qty'));
    let lu = num(g(r, 'lu')), mu = num(g(r, 'mu')), eu = num(g(r, 'eu'));
    // 단가가 없고 금액만 있으면 금액 ÷ 수량
    if (!lu && !mu && !eu && qty) {
      const la = num(g(r, 'la')), ma = num(g(r, 'ma')), ea = num(g(r, 'ea'));
      if (la || ma || ea) { lu = la / qty; mu = ma / qty; eu = ea / qty; }
      else { const tu = num(g(r, 'tu')) || num(g(r, 'ta')) / qty; mu = tu || 0; }
    }
    rows.push({ r, name, raw, indent: raw.length - raw.trimStart().length, mark, L: Number(g(r, 'L')) || 0, qty, unit: txt(g(r, 'unit')), spec: txt(g(r, 'spec')), lu, mu, eu, priced: !!(lu || mu || eu) });
  }
  let rule = cfg.rule;
  if (rule === 'auto') {
    const marked = rows.filter((x) => /^[●○◈■□◆◇ㅇ]/.test(x.mark)).length;
    const indented = new Set(rows.map((x) => x.indent)).size > 1;
    // 공종 기호가 맨 위 한두 줄에만 있고 들여쓰기가 있으면 들여쓰기로
    if (marked > 2 || (marked && !indented)) rule = 'mark';
    else if (indented) rule = 'indent';
    else if (cfg.map.L >= 0 && rows.some((x) => x.L)) rule = 'level';
    else rule = 'noprice';
    note.push(`공종 판단: ${RULE_LABEL[rule]}`);
  }
  const indents = [...new Set(rows.map((x) => x.indent))].sort((a, b) => a - b);
  const markDepth = (m: string) => (/^[◈●■◆]/.test(m) ? 0 : /^[○□◇ㅇ]/.test(m) ? 1 : 2);
  const isGroup = (x: Row, k: number): boolean => {
    if (rule === 'mark') return /^[●○◈■□◆◇ㅇ]/.test(x.mark);
    if (rule === 'indent') { const nx = rows[k + 1]; return !!nx && nx.indent > x.indent; }
    if (rule === 'level') return x.L > 0;
    return !x.priced && !x.qty;
  };
  const depthOf = (x: Row, grp: boolean): number => {
    if (rule === 'mark') return grp ? markDepth(x.mark) : 99;
    if (rule === 'indent') return indents.indexOf(x.indent);
    if (rule === 'level') return grp ? Math.max(0, 3 - x.L) : 99;
    return grp ? 1 : 99;
  };
  const sections: Record<Section, Line[]> = { main: [], supplied: [], waste: [] };
  let sec: Section = 'main';
  const stack: { line: Line; d: number }[] = [];
  const preview: Preview[] = [];
  const mk = (x: Row, children?: Line[]): Line => ({
    id: newId(children ? 'g' : 'n'), level: (children ? (x.L || (stack.length === 0 ? 3 : stack.length === 1 ? 2 : 1)) : 0) as Line['level'],
    mark: children ? (stack.length === 0 ? '●' : '○') : x.mark, name: x.name, spec: x.spec, unit: x.unit,
    qty: children ? 0 : x.qty, lu: children ? 0 : x.lu, mu: children ? 0 : x.mu, eu: children ? 0 : x.eu, children,
    note: txt(g(x.r, 'note')) || undefined,
  });
  let roots = 0;
  rows.forEach((x, k) => {
    const key = norm(x.name);
    const grp = isGroup(x, k);
    if (grp && /^관급/.test(key)) { sec = 'supplied'; stack.length = 0; }
    else if (grp && /^폐기물/.test(key) && depthOf(x, true) === 0) { sec = 'waste'; stack.length = 0; }
    const d = depthOf(x, grp);
    while (stack.length && stack[stack.length - 1].d >= d) stack.pop();
    if (grp) {
      const line = mk(x, []);
      if (stack.length) stack[stack.length - 1].line.children!.push(line);
      else { sections[sec].push(line); roots++; }
      stack.push({ line, d });
      preview.push({ tag: '공종', depth: stack.length - 1, cells: [x.name, x.spec, '', '', '', '', ''] });
    } else {
      const line = mk(x);
      if (stack.length) stack[stack.length - 1].line.children!.push(line);
      else sections[sec].push(line);
      preview.push({ tag: '항목', depth: stack.length, cells: [x.name, x.spec, x.qty, x.unit, x.lu, x.mu, x.eu], warn: x.qty ? undefined : '수량 0' });
    }
  });
  if (roots > 1 && sections.main.length > 1) note.push('맨 위 공종이 여러 개라 공사명 아래로 묶습니다');
  return { lines: sections, preview, note };
}

function parseUnit(body: { r: Raw; i: number }[], cfg: SheetCfg, g: (r: Raw, k: string) => unknown, ctx: { wages: Record<string, Wage> }): Parsed {
  const units: UnitDef[] = [];
  const unitTotals: Record<string, { l: number; m: number; e: number }> = {};
  const wages: Record<string, Wage> = {};
  const mats: Record<string, Mat> = {};
  const preview: Preview[] = [];
  let cur: UnitDef | null = null;
  let k = 0;
  for (const { r } of body) {
    const noCell = txt(g(r, 'no'));
    const name = txt(g(r, 'name'));
    const hm = (noCell + ' ' + name).match(/제\s*(\d+)\s*호표/);
    if (hm && (noCell || /^제\s*\d+\s*호표/.test(name))) {
      const no = `제${hm[1]}호표`;
      const nm = noCell ? name : name.replace(/^제\s*\d+\s*호표\s*/, '');
      cur = { no, name: nm, spec: txt(g(r, 'spec')), unit: txt(g(r, 'unit')), lines: [], from: '엑셀 가져오기' };
      units.push(cur);
      unitTotals[no] = { l: num(g(r, 'la')), m: num(g(r, 'ma')), e: num(g(r, 'ea')) };
      preview.push({ tag: no, depth: 0, cells: [nm, cur.spec, '', cur.unit, '', '', ''] });
      continue;
    }
    if (!cur || !name) continue;
    if (cfg.skipSums && SUM_WORDS.test(norm(name))) continue;
    const qty = num(g(r, 'qty'));
    const spec = txt(g(r, 'spec')), unit = txt(g(r, 'unit')), note = txt(g(r, 'note'));
    const lu = num(g(r, 'lu')), mu = num(g(r, 'mu')), eu = num(g(r, 'eu'));
    const la = num(g(r, 'la')), ma = num(g(r, 'ma')), ea = num(g(r, 'ea'));
    const id = `${cur.no}-x${++k}`;
    let ln: ULine;
    let tag = '';
    const ref = note.match(/일위\s*(\d+)/), refC = note.match(/(?:단산|단가)\s*(\d+)/), refM = note.match(/기계\s*(\d+)/);
    if (unit === '%' || /의$/.test(spec)) {
      const col: 'l' | 'm' | 'e' = la ? 'l' : ma ? 'm' : ea ? 'e' : lu ? 'l' : mu ? 'm' : 'e';
      ln = { id, kind: 'pct', name, spec: spec || '노무비의', unit: '%', qty, col }; tag = '%';
    } else if (ref) { ln = { id, kind: 'unit', ref: `제${ref[1]}호표`, name, spec, unit, qty }; tag = `일위${ref[1]}`; }
    else if (refC) { ln = { id, kind: 'calc', ref: `단산${refC[1]}`, name, spec, unit, qty }; tag = `단산${refC[1]}`; }
    else if (refM) { ln = { id, kind: 'calc', ref: `기계${refM[1]}`, name, spec, unit, qty }; tag = `기계${refM[1]}`; }
    else if (lu && !mu && !eu && /인/.test(unit)) {
      const key = normName(name);
      if (!ctx.wages[key] && !wages[key]) wages[key] = { name, unit: '인', old: lu, cur: null, use: 'old', code: '' };
      ln = { id, kind: 'labor', ref: name, name, spec, unit, qty }; tag = '노임';
    } else if (mu && !lu && !eu) {
      const key = `${normName(name)}|${normName(spec)}`;
      if (!mats[key]) mats[key] = { key, name, spec, unit, price: mu };
      ln = { id, kind: 'mat', ref: key, name, spec, unit, qty }; tag = '자재';
    } else {
      // 비목이 섞인 줄은 비목별 금액으로
      const add: ULine[] = [];
      const amt = (p: number, a: number) => a || Math.floor(qty * p * 10) / 10;
      if (lu || la) add.push({ id: id + 'l', kind: 'fixed', col: 'l', name, spec, unit, qty: 1, amt: amt(lu, la) });
      if (mu || ma) add.push({ id: id + 'm', kind: 'fixed', col: 'm', name, spec, unit, qty: 1, amt: amt(mu, ma) });
      if (eu || ea) add.push({ id: id + 'e', kind: 'fixed', col: 'e', name, spec, unit, qty: 1, amt: amt(eu, ea) });
      cur.lines.push(...add);
      preview.push({ tag: '금액', depth: 1, cells: [name, spec, qty, unit, lu, mu, eu] });
      continue;
    }
    cur.lines.push(ln);
    preview.push({ tag, depth: 1, cells: [name, spec, qty, unit, lu, mu, eu] });
  }
  return { units, unitTotals, wages, mats, preview, note: ['노임·자재 줄은 노임단가·자재단가에 연결되고, "일위N참조" · "기계N참조" 줄은 그 호표·기계경비를 씁니다'] };
}

/* ---------- 모두 합치기 ---------- */
export interface ImportOut {
  design?: Sheet;
  units: UnitDef[]; calcs: CalcDef[]; wages: Record<string, Wage>; mats: Record<string, Mat>; rates: Partial<CostRates>;
  report: string[];
}

export function combine(book: Book, cfgs: SheetCfg[], rootName: string, base: { wages: Record<string, Wage> }): ImportOut {
  const parsed = book.sheets.map((s, i) => (cfgs[i].kind === 'skip' ? null : parseSheet(s.rows, cfgs[i], base)));
  const out: ImportOut = { units: [], calcs: [], wages: {}, mats: {}, rates: {}, report: [] };
  // 기초: 노임 · 자재 먼저 (호표 줄이 쓸 수 있게)
  parsed.forEach((p) => { if (p?.wages) Object.assign(out.wages, p.wages); if (p?.mats) Object.assign(out.mats, p.mats); if (p?.rates) Object.assign(out.rates, p.rates); });
  const unitSum: Record<string, { l: number; m: number; e: number; def: CalcDef }> = {};
  parsed.forEach((p, i) => {
    if (!p) return;
    const kind = cfgs[i].kind;
    if (kind === 'unitSum') p.calcs?.forEach((c) => { unitSum[c.no] = { l: c.l, m: c.m, e: c.e, def: c }; });
    if (kind === 'calcSum' || kind === 'machSum') out.calcs.push(...(p.calcs ?? []));
    if (kind === 'unit') out.units.push(...(p.units ?? []));
  });
  // 상세가 없는 호표는 총괄표 금액으로
  for (const [no, v] of Object.entries(unitSum)) {
    if (out.units.some((u) => u.no === no)) continue;
    const lines: ULine[] = (['l', 'm', 'e'] as const).filter((c) => v[c]).map((c) => ({ id: `${no}-${c}`, kind: 'fixed', col: c, name: { l: '노무비', m: '재료비', e: '경비' }[c], spec: '', unit: '식', qty: 1, amt: v[c] }));
    const [name, ...spec] = v.def.name.split(' ');
    out.units.push({ no, name, spec: spec.join(' '), unit: v.def.unit, lines, from: '엑셀 · 일위대가 총괄표 금액' });
  }
  out.units.sort((a, b) => Number(a.no.replace(/\D/g, '')) - Number(b.no.replace(/\D/g, '')));
  // 내역서
  const naeIdx = cfgs.findIndex((c) => c.kind === 'nae');
  if (naeIdx >= 0 && parsed[naeIdx]?.lines) {
    const L = parsed[naeIdx]!.lines!;
    const g = (name: string, children: Line[]): Line => ({ id: newId('g'), level: 3, mark: '●', name, spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children });
    // 맨 위가 공종 하나면 그대로 공사명 줄, 아니면 공사명 아래로 묶는다
    const main = L.main.length === 1 && L.main[0].children ? [{ ...L.main[0], level: 3 as const, mark: '●' }] : [g(rootName, L.main)];
    const wrap = (ls: Line[], name: string) => (ls.length === 1 && ls[0].children ? ls : [g(name, ls)]);
    out.design = { sections: [
      { section: 'main', lines: main },
      { section: 'supplied', lines: L.supplied.length ? wrap(L.supplied, '관급자재대') : [g('관급자재대', [])] },
      { section: 'waste', lines: L.waste.length ? wrap(L.waste, '폐기물처리비') : [g('폐기물처리비', [])] },
    ] };
    // 비고의 근거 (제N호표 · 단산N · 일위N) 를 붙여 둔다 — 연결은 끈 채로 (단가는 엑셀 값 유지)
    const refOf = (n?: string) => { if (!n) return undefined; const a = n.match(/제\s*(\d+)\s*호표|일위\s*(\d+)/); if (a) return `제${a[1] ?? a[2]}호표`; const b = n.match(/단산\s*(\d+)/); return b ? `단산${b[1]}` : undefined; };
    const walk = (ls: Line[]): Line[] => ls.map((l) => (l.children ? { ...l, children: walk(l.children) } : { ...l, ref: refOf(l.note), link: false }));
    out.design = { sections: out.design.sections.map((s) => ({ ...s, lines: walk(s.lines) })) };
  }
  // 보고
  const cnt = (k: SheetKind) => cfgs.filter((c) => c.kind === k).length;
  if (out.design) {
    const items = out.design.sections.flatMap((s) => s.lines).reduce(function n(a: number, l: Line): number { return l.children ? l.children.reduce(n, a) : a + 1; }, 0);
    out.report.push(`내역서 항목 ${items}개`);
  }
  if (out.units.length) out.report.push(`일위대가 ${out.units.length}개`);
  if (out.calcs.length) out.report.push(`단가산출·기계경비 ${out.calcs.length}개`);
  if (Object.keys(out.mats).length) out.report.push(`자재 ${Object.keys(out.mats).length}종`);
  if (Object.keys(out.wages).length) out.report.push(`노임 ${Object.keys(out.wages).length}종`);
  if (Object.keys(out.rates).length) out.report.push(`요율 ${Object.keys(out.rates).length}개`);
  if (!out.report.length) out.report.push(cnt('chong') ? '총괄표만으로는 내역을 만들 수 없습니다 — 내역서 시트를 고르세요' : '가져올 시트를 고르세요');
  return out;
}

/** 수량만 읽기 (기성 일보물량) — 품명·규격으로 맞춘다 */
export function readQtyXlsx(buf: ArrayBuffer): { name: string; spec: string; qty: number }[] {
  const book = readBook('', buf);
  for (const s of book.sheets) {
    const h = findHead(s.rows, 'nae');
    if (h < 0) continue;
    const cfg = defaultCfg(s.rows, 'nae');
    if (cfg.map.qty < 0) continue;
    const out: { name: string; spec: string; qty: number }[] = [];
    for (const r of s.rows.slice(cfg.start)) {
      const name = txt(cell(r, cfg.map.name));
      const q = num(cell(r, cfg.map.qty));
      if (name && q) out.push({ name, spec: txt(cell(r, cfg.map.spec)), qty: q });
    }
    return out;
  }
  return [];
}

/** 파일 고르기 창을 열어 ArrayBuffer 로 읽는다 */
export function pickFile(accept: string): Promise<{ name: string; buf: ArrayBuffer } | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      resolve({ name: f.name, buf: await f.arrayBuffer() });
    };
    inp.click();
  });
}

/** 열 번호 → A, B, … */
export const colLetter = (c: number) => XLSX.utils.encode_col(c);
