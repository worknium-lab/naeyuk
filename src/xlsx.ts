// xlsx-js-style: SheetJS와 같은 API + 칸 서식(글자색·굵게)
import XLSX from 'xlsx-js-style';
import { saveFile } from './platform';
import { canPrint } from './ui/Ask';

export type Cell = string | number | null | undefined;
export interface SheetSpec {
  name: string;
  rows: Cell[][];
  widths?: number[];
  /** 줄 번호 → 글자색 (예: 당초 줄 빨강) */
  rowColor?: Record<number, string>;
  /** 굵게 할 줄 */
  bold?: number[];
}

/** 표를 엑셀(.xlsx)로 내려받는다 — 숫자는 숫자 칸, #,##0 서식 */
export async function exportXlsx(filename: string, sheets: SheetSpec[]): Promise<boolean> {
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c))));
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.t === 'n') cell.z = Number.isInteger(cell.v) ? '#,##0' : '#,##0.####';
        if (cell) {
          const color = sh.rowColor?.[R];
          const bold = sh.bold?.includes(R);
          if (color || bold) cell.s = { font: { ...(color ? { color: { rgb: color } } : {}), ...(bold ? { bold: true } : {}) } };
        }
      }
    }
    if (sh.widths) ws['!cols'] = sh.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return saveFile(filename, blob, canPrint());
}
