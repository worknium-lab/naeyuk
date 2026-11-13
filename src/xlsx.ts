// xlsx-js-style: SheetJS와 같은 API + 칸 서식(테두리·채우기·글꼴·표시형식)
import XLSX from 'xlsx-js-style';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { saveFile } from './platform';
import { canPrint } from './ui/Ask';

/** 칸 — 값만 넣거나, 수식(f)과 그 계산값(v)을 함께 넣는다 */
export interface CellObj { v?: string | number; f?: string; z?: string; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' }
export type Cell = string | number | null | undefined | CellObj;
export type RowStyle = 'group' | 'group2' | 'total' | 'sum';

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  widths?: number[];
  /** 줄 번호 → 글자색 (예: 당초 줄 빨강) */
  rowColor?: Record<number, string>;
  /** 굵게 할 줄 */
  bold?: number[];
  /** 머리글 줄 (지정하지 않으면 제목·빈 줄 다음 줄) */
  head?: number[];
  /** 칸 합치기 */
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
  /** 줄 모양 — 공종 · 합계 줄 */
  rowStyle?: Record<number, RowStyle>;
  /** 열 표시형식 (예: 수량 열은 소수) */
  colFmt?: Record<number, string>;
  /** 열 맞춤 */
  colAlign?: Record<number, 'left' | 'center' | 'right'>;
  /** 인쇄: 가로 방향 (기본은 열이 8개 넘으면 가로) */
  landscape?: boolean;
}

const FONT = '맑은 고딕';
const LINE = { style: 'thin', color: { rgb: '9AA4B1' } };
const BORDER = { top: LINE, bottom: LINE, left: LINE, right: LINE };
export const FMT_WON = '#,##0;"△"#,##0;""';
export const FMT_QTY = '#,##0.####;"△"#,##0.####;""';
const FILL: Record<RowStyle, string> = { group: 'EEF2F7', group2: 'F7F9FB', total: 'FFF2CC', sum: 'F2F2F2' };

const isObj = (c: Cell): c is CellObj => typeof c === 'object' && c !== null;

/** 표를 엑셀(.xlsx)로 내려받는다 — 머리글·테두리·표시형식·수식 */
export async function exportXlsx(filename: string, sheets: SheetSpec[]): Promise<boolean> {
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) XLSX.utils.book_append_sheet(wb, buildSheet(sh), sh.name.slice(0, 31));
  const buf = pageSetup(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, sheets);
  const blob = new Blob([buf as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return saveFile(filename, blob, canPrint());
}

export function buildSheet(sh: SheetSpec) {
  const ws: Record<string, unknown> = {};
  const rows = sh.rows;
  const nCols = Math.max(1, ...rows.map((r) => r.length), sh.widths?.length ?? 0);
  // 제목 줄: 첫 줄이 글 한 칸뿐이면 표 너비만큼 합쳐 크게
  const titled = rows.length > 0 && rows[0].filter((c) => c !== '' && c != null).length === 1 && typeof rows[0][0] === 'string';
  const head = new Set(sh.head ?? (titled && rows[1] && rows[1].length === 0 ? [2] : []));
  const firstTable = Math.min(...(head.size ? [...head] : [titled ? 2 : 0]));
  const merges = [...(sh.merges ?? [])];
  if (titled) merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } });

  rows.forEach((row, R) => {
    const empty = row.every((c) => c === '' || c == null);
    const inTable = R >= firstTable && !empty;
    const rs = sh.rowStyle?.[R];
    for (let C = 0; C < (inTable ? nCols : row.length); C++) {
      const raw = row[C];
      const o: CellObj = isObj(raw) ? raw : { v: raw === null || raw === undefined ? '' : raw };
      const cell: Record<string, unknown> = {};
      if (o.f) { cell.f = o.f; cell.t = typeof o.v === 'string' ? 's' : 'n'; cell.v = o.v ?? 0; }
      else if (typeof o.v === 'number') { cell.t = 'n'; cell.v = o.v; }
      else { cell.t = 's'; cell.v = o.v ?? ''; }
      if (cell.t === 'n') cell.z = o.z ?? sh.colFmt?.[C] ?? (Number.isInteger(cell.v) ? FMT_WON : FMT_QTY);
      const isHead = head.has(R);
      const color = o.color ?? sh.rowColor?.[R] ?? (rs === 'total' ? 'C00000' : undefined);
      const bold = o.bold ?? (isHead || R === 0 && titled || sh.bold?.includes(R) || rs === 'group' || rs === 'total' || rs === 'sum');
      cell.s = {
        font: { name: FONT, sz: R === 0 && titled ? 15 : 10, ...(bold ? { bold: true } : {}), ...(color ? { color: { rgb: color } } : {}) },
        alignment: R === 0 && titled ? { horizontal: 'center', vertical: 'center' }
          : isHead ? { horizontal: 'center', vertical: 'center', wrapText: true }
            : { vertical: 'center', horizontal: o.align ?? sh.colAlign?.[C] ?? (cell.t === 'n' ? 'right' : 'left') },
        ...(inTable ? { border: BORDER } : {}),
        ...(isHead ? { fill: { patternType: 'solid', fgColor: { rgb: 'DCE6F1' } } } : rs ? { fill: { patternType: 'solid', fgColor: { rgb: FILL[rs] } } } : {}),
      };
      ws[XLSX.utils.encode_cell({ r: R, c: C })] = cell;
    }
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: nCols - 1 } });
  if (merges.length) ws['!merges'] = merges;
  if (sh.widths) ws['!cols'] = sh.widths.map((w) => ({ wch: w }));
  ws['!rows'] = rows.map((_, R) => (R === 0 && titled ? { hpt: 30 } : head.has(R) ? { hpt: 20 } : { hpt: 17 }));
  return ws;
}

/** 0부터 센 열 번호 → 엑셀 열 글자 */
export const colL = (c: number) => XLSX.utils.encode_col(c);
/** 0부터 센 줄·열 → A1 */
export const addr = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

/** 머리글 줄 번호 (buildSheet 와 같은 규칙) */
function headRows(sh: SheetSpec): number[] {
  const titled = sh.rows.length > 0 && sh.rows[0].filter((c) => c !== '' && c != null).length === 1 && typeof sh.rows[0][0] === 'string';
  return sh.head ?? (titled && sh.rows[1] && sh.rows[1].length === 0 ? [2] : []);
}

/** 인쇄 설정 · 틀 고정 · 인쇄 제목 줄 — SheetJS 가 쓰지 못하는 부분을 xlsx 안 XML 에 직접 넣는다 */
export function pageSetup(buf: ArrayBuffer, sheets: SheetSpec[]): Uint8Array {
  const files = unzipSync(new Uint8Array(buf));
  const names: string[] = [];
  sheets.forEach((sh, i) => {
    const path = `xl/worksheets/sheet${i + 1}.xml`;
    if (!files[path]) return;
    let x = strFromU8(files[path]);
    const head = headRows(sh);
    const freeze = head.length ? Math.max(...head) + 1 : 0;
    const nCols = Math.max(1, ...sh.rows.map((r) => r.length), sh.widths?.length ?? 0);
    const land = sh.landscape ?? nCols > 8;
    if (!x.includes('<sheetPr')) x = x.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    if (freeze) x = x.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, `<sheetViews><sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ''}><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freeze + 1}" sqref="A${freeze + 1}"/></sheetView></sheetViews>`);
    x = x.replace(/<pageMargins[^>]*\/>/, '');
    const page = `<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${land ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;C&amp;P / &amp;N</oddFooter></headerFooter>`;
    x = x.includes('<ignoredErrors') ? x.replace('<ignoredErrors', page + '<ignoredErrors') : x.replace('</worksheet>', page + '</worksheet>');
    files[path] = strToU8(x);
    if (head.length) names.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${sh.name.slice(0, 31).replace(/'/g, "''")}'!$${Math.min(...head) + 1}:$${freeze}</definedName>`);
  });
  if (names.length && files['xl/workbook.xml']) {
    let w = strFromU8(files['xl/workbook.xml']);
    w = w.includes('<definedNames>') ? w.replace('<definedNames>', '<definedNames>' + names.join('')) : w.replace('</sheets>', '</sheets><definedNames>' + names.join('') + '</definedNames>');
    files['xl/workbook.xml'] = strToU8(w);
  }
  return zipSync(files);
}
