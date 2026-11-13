// 엑셀 내역서 가져오기 — 이 프로그램이 내보낸 양식은 물론, "품명·규격·수량·단위·단가" 머리글이 있는 일반 내역서도 읽는다.
import XLSX from 'xlsx-js-style';
import { newId, parseNum, type Line, type Sheet, type Section } from './engine';

type Raw = (string | number | null | undefined)[];
const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '');
const num = (v: unknown) => (typeof v === 'number' ? v : parseNum(String(v ?? '')));

export interface ImportResult { sheet: Sheet; items: number; groups: number; sheetName: string; note: string[] }

/** 머리글 줄 찾기 — '품명' 칸이 있는 줄 */
function findHead(rows: Raw[]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) if (rows[i].some((c) => norm(c) === '품명' || norm(c) === '공종명' || norm(c) === '공사명')) return i;
  return -1;
}

/** 열 이름 → 열 번호 (두 줄 머리글: 위 줄은 합친 칸이라 왼쪽 값을 이어 쓴다) */
function columns(h1: Raw, h2: Raw | undefined) {
  const top: string[] = [];
  let last = '';
  for (let c = 0; c < Math.max(h1.length, h2?.length ?? 0); c++) {
    const t = norm(h1[c]);
    if (t) last = t;
    top[c] = t || (h2 && norm(h2[c]) ? last : '');
  }
  const sub = (c: number) => norm(h2?.[c]);
  const find = (pred: (t: string, s: string) => boolean) => top.findIndex((t, c) => pred(t, sub(c)));
  const two = !!h2 && h2.some((c) => norm(c) === '단가');
  const price = (word: string) => (two ? find((t, s) => t.includes(word) && s === '단가') : find((t) => t.includes(word) && t.includes('단가')));
  return {
    L: find((t) => t === 'L' || t === '레벨'),
    mark: find((t) => t === '공종' || t === '호'),
    name: find((t) => t === '품명' || t === '공종명' || t === '공사명'),
    spec: find((t) => t === '규격'),
    qty: find((t) => t === '수량'),
    unit: find((t) => t === '단위'),
    lu: price('노무'),
    mu: price('재료'),
    eu: price('경비'),
    tu: price('합계'),
    note: find((t) => t === '비고'),
    two,
  };
}

export function readEstimateXlsx(buf: ArrayBuffer, rootName: string): ImportResult {
  const wb = XLSX.read(buf, { type: 'array' });
  // 내역서로 보이는 첫 시트
  let sheetName = wb.SheetNames[0];
  let rows: Raw[] = [];
  let h = -1;
  for (const n of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json<Raw>(wb.Sheets[n], { header: 1, raw: true, defval: '' });
    const k = findHead(r);
    if (k >= 0) { sheetName = n; rows = r; h = k; break; }
  }
  if (h < 0) throw new Error('"품명" 머리글이 있는 시트를 찾지 못했습니다');
  const col = columns(rows[h], rows[h + 1]);
  if (col.name < 0) throw new Error('품명 열을 찾지 못했습니다');
  const note: string[] = [];
  if (col.lu < 0 && col.mu < 0 && col.eu < 0) note.push(col.tu >= 0 ? '비목별 단가가 없어 합계 단가를 재료비로 넣었습니다' : '단가 열이 없어 수량만 가져왔습니다');
  const get = (r: Raw, c: number) => (c >= 0 ? r[c] : '');

  const sections: Record<Section, Line[]> = { main: [], supplied: [], waste: [] };
  const mkGroup = (name: string, level: Line['level'], mark = ''): Line => ({ id: newId('g'), level, mark, name, spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children: [] });
  const root = mkGroup(rootName, 3, '●');
  sections.main.push(root);
  let sec: Section = 'main';
  // 깊이별 현재 공종 (0 = 루트)
  let stack: Line[] = [root];
  let items = 0, groups = 0;
  for (let i = h + (col.two ? 2 : 1); i < rows.length; i++) {
    const r = rows[i];
    const rawName = String(get(r, col.name) ?? '');
    const name = rawName.trim();
    const key = norm(name);
    if (!key) continue;
    if (key.includes('순공사비') || key === '합계' || key === '총계') continue;
    if (key.startsWith('관급자재') && !num(get(r, col.qty))) { sec = 'supplied'; const g = mkGroup(name, 3, '●'); sections.supplied.push(g); stack = [g]; continue; }
    if (key.startsWith('폐기물처리비') && !num(get(r, col.qty))) { sec = 'waste'; const g = mkGroup(name, 3, '●'); sections.waste.push(g); stack = [g]; continue; }
    const qty = num(get(r, col.qty));
    let lu = num(get(r, col.lu)), mu = num(get(r, col.mu)), eu = num(get(r, col.eu));
    if (!lu && !mu && !eu && col.tu >= 0) mu = num(get(r, col.tu));
    const unit = String(get(r, col.unit) ?? '').trim();
    const isItem = qty !== 0 || lu !== 0 || mu !== 0 || eu !== 0 || (!!unit && col.qty >= 0 && get(r, col.qty) !== '');
    // 들여쓰기(앞 공백 2칸 = 한 단계) 또는 L 레벨로 깊이를 정한다
    const indent = Math.floor((rawName.length - rawName.trimStart().length) / 2);
    const L = Number(get(r, col.L)) || 0;
    if (!isItem) {
      if (sec === 'main' && stack.length === 1 && L >= 3 && !indent) { root.name = name; continue; } // 공사명 줄
      const depth = indent ? indent : L ? Math.max(1, 4 - L) : 1;
      while (stack.length > Math.max(1, depth)) stack.pop();
      const g = mkGroup(name, (L || Math.max(1, 3 - depth)) as Line['level'], String(get(r, col.mark) ?? '').trim() || '○');
      stack[stack.length - 1].children!.push(g);
      stack.push(g);
      groups++;
      continue;
    }
    if (indent) while (stack.length > indent) stack.pop();
    const parent = stack[stack.length - 1];
    parent.children!.push({
      id: newId('n'), level: 0, mark: String(get(r, col.mark) ?? '').trim(), name, spec: String(get(r, col.spec) ?? '').trim(),
      unit, qty, lu, mu, eu, note: String(get(r, col.note) ?? '').trim() || undefined,
    });
    items++;
  }
  if (!sections.supplied.length) sections.supplied.push(mkGroup('관급자재대', 3, '●'));
  if (!sections.waste.length) sections.waste.push(mkGroup('폐기물처리비', 3, '●'));
  return { sheet: { sections: (['main', 'supplied', 'waste'] as Section[]).map((s) => ({ section: s, lines: sections[s] })) }, items, groups, sheetName, note };
}

/** 수량만 읽기 (기성 일보물량) — 품명·규격으로 맞춘다 */
export function readQtyXlsx(buf: ArrayBuffer): { name: string; spec: string; qty: number }[] {
  const wb = XLSX.read(buf, { type: 'array' });
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Raw>(wb.Sheets[n], { header: 1, raw: true, defval: '' });
    const h = findHead(rows);
    if (h < 0) continue;
    const col = columns(rows[h], rows[h + 1]);
    const qc = col.qty;
    if (qc < 0) continue;
    const out: { name: string; spec: string; qty: number }[] = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i];
      const name = String(r[col.name] ?? '').trim();
      const q = num(r[qc]);
      if (name && q) out.push({ name, spec: col.spec >= 0 ? String(r[col.spec] ?? '').trim() : '', qty: q });
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
