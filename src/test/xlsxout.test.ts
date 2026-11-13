// @ts-nocheck — node 전용 (XLSX_OUT=1 일 때만 파일을 쓴다)
import { it } from 'vitest';
import XLSX from 'xlsx-js-style';
import { writeFileSync } from 'node:fs';
import { buildSheet, pageSetup } from '../xlsx';
import { docBook } from '../exports';
import { designSheet } from '../data/project';
import { sectionAmount, costSheet } from '../engine';

it.skipIf(!process.env.XLSX_OUT)('엑셀 수식 파일 쓰기', () => {
  const sh = designSheet();
  const cost = costSheet({ direct: sectionAmount(sh, 'main'), supplied: sectionAmount(sh, 'supplied').t, waste: sectionAmount(sh, 'waste').t });
  const wb = XLSX.utils.book_new();
  const specs = docBook('설계내역서', sh, cost);
  for (const s of specs) {
    // 계산값을 비워 두고 LibreOffice 가 수식으로 다시 계산하게 한다
    const ws = buildSheet(s) as Record<string, { f?: string; v?: unknown }>;
    const cached: Record<string, unknown> = {};
    for (const [k, c] of Object.entries(ws)) if (!k.startsWith('!') && c.f) { cached[k] = c.v; c.v = 0; }
    XLSX.utils.book_append_sheet(wb, ws, s.name);
    writeFileSync(`/tmp/xt/${s.name}.json`, JSON.stringify(cached));
  }
  writeFileSync('/tmp/xt/out.xlsx', pageSetup(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, specs));
});
