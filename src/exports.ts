import { flatten, lineAmount, unitTotal, sectionAmount, type CostResult, type Line, type Sheet } from './engine';
import type { Cell, SheetSpec } from './xlsx';

const HEAD = ['L', '공종', '품명', '규격', '수량', '단위', '합계 단가', '합계 금액', '노무비 단가', '노무비 금액', '재료비 단가', '재료비 금액', '경비 단가', '경비 금액', '비고'];
const W = [4, 5, 40, 24, 10, 6, 12, 14, 12, 14, 12, 14, 12, 14, 12];

function lineRow(l: Line, depth: number): Cell[] {
  const a = lineAmount(l);
  const g = !!l.children;
  const pad = '  '.repeat(depth);
  return [l.level || '', l.mark, pad + l.name, l.spec, g ? '' : l.qty, l.unit,
    g ? '' : unitTotal(l), a.t, g ? '' : l.lu, a.l, g ? '' : l.mu, a.m, g ? '' : l.eu, a.e, l.ref ?? ''];
}

/** 표준 내역서 양식 (순공사비 · 관급자재대 · 폐기물처리비) */
export function sheetRows(title: string, sheet: Sheet): SheetSpec {
  const rows: Cell[][] = [[title], [], HEAD];
  for (const sec of sheet.sections) {
    for (const r of flatten(sec.lines)) rows.push(lineRow(r.line, r.depth));
    if (sec.section === 'main') {
      const m = sectionAmount(sheet, 'main');
      rows.push([], ['', '', '순 공 사 비', '', '', '', '', m.t, '', m.l, '', m.m, '', m.e, ''], []);
    } else rows.push([]);
  }
  return { name: '내역서', rows, widths: W };
}

/** 원가계산서 (1~18, A~L) */
export function costRows(title: string, c: CostResult, compare?: { label: string; cost: CostResult }[]): SheetSpec {
  const head = ['구분', '비목', compare ? '' : '금액', '요율', '산출근거'];
  const rows: Cell[][] = [[title], []];
  if (compare) {
    rows.push(['구분', '비목', ...compare.map((x) => x.label), '요율', '산출근거']);
    for (const r of c.rows) {
      if (['mat', 'scrap', 'perfGuar'].includes(r.key)) continue;
      rows.push([r.no, r.label, ...compare.map((x) => x.cost.rows.find((y) => y.key === r.key)?.amount ?? ''), r.rate ?? '', r.basis ?? '']);
    }
    return { name: '원가계산서', rows, widths: [6, 30, ...compare.map(() => 16), 10, 30] };
  }
  rows.push(head);
  for (const r of c.rows) rows.push([r.no, (r.group ? `${r.group} · ` : '') + r.label, r.amount ?? '', r.rate ?? '', r.basis ?? '']);
  return { name: '원가계산서', rows, widths: [6, 36, 16, 10, 30] };
}

/** 원·하도급 대비내역서 */
export function compareRows(start: Line[], target: Line[], sub: Line[]): SheetSpec {
  const tMap = new Map(flatten(target).map((x) => [x.line.id, x]));
  const sMap = new Map(flatten(sub).map((x) => [x.line.id, x]));
  const rows: Cell[][] = [['원·하도급 대비내역서'], [], ['공종명', '규격', '단위', '도급 수량', '도급 단가', '도급 금액', '대상 수량', '대상 금액', '하도급 단가', '하도급 금액', '비율']];
  for (const r of flatten(start)) {
    const l = r.line, g = !!l.children, t = tMap.get(l.id), s = sMap.get(l.id);
    rows.push(['  '.repeat(r.depth) + `${l.mark} ${l.name}`, l.spec, l.unit, g ? '' : l.qty, g ? '' : unitTotal(l), r.amount.t,
      t && !g ? l.qty : '', t ? t.amount.t : '', s && !g ? unitTotal(s.line) : '', s ? s.amount.t : '', s && t && t.amount.t ? s.amount.t / t.amount.t : '']);
  }
  return { name: '대비내역서', rows, widths: [40, 22, 6, 10, 12, 14, 10, 14, 12, 14, 8] };
}
