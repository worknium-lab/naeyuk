// @ts-nocheck — node 전용: 올려 받은 xls 로 가져오기를 확인 (파일이 없으면 건너뜀)
import { it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { readBook, guessKind, defaultCfg, combine, parseSheet } from '../importXlsx';
import { computeUnits, sectionAmount, lineAmount } from '../engine';
import { basisData } from '../data/basisData';

const F = '/mnt/user-data/uploads/dd5cd42f-__43_______________.xls';
const G = '/mnt/user-data/uploads/bb6e88d6-02._________.xls';
const buf = (f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

it.skipIf(!existsSync(F))('용암교 xls — 시트 종류 자동 판단과 금액', () => {
  const book = readBook('x.xls', buf(F));
  const kinds = book.sheets.map((s) => [s.name, guessKind(s.name, s.rows)]);
  console.log(kinds.map((k) => k.join('→')).join(' · '));
  const cfgs = book.sheets.map((s) => defaultCfg(s.rows, guessKind(s.name, s.rows)));
  const nae = cfgs[book.sheets.findIndex((s) => s.name === '내역서')];
  console.log('내역서 map', JSON.stringify(nae.map), 'head', nae.head, nae.head2);
  const out = combine(book, cfgs, '용암교', { wages: {} });
  console.log(out.report.join(', '));
  const main = sectionAmount(out.design, 'main');
  expect(main.t).toBe(163747465);
  // 호표 합계가 xls 와 같은지
  const lib = basisData();
  const b = { ...lib, units: out.units, calcs: out.calcs, wages: { ...lib.wages, ...out.wages }, mats: { ...lib.mats, ...out.mats } };
  for (const w of Object.values(b.wages)) w.use = 'old';
  const uc = computeUnits(b);
  const ui = book.sheets.findIndex((s) => s.name === '일위대가');
  const p = parseSheet(book.sheets[ui].rows, cfgs[ui], { wages: {} });
  const bad = Object.entries(p.unitTotals).filter(([no, t]) => { const u = uc.get(no)?.total; return !u || u.l !== Math.floor(t.l) || u.m !== Math.floor(t.m) || u.e !== Math.floor(t.e); });
  console.log('호표', Object.keys(p.unitTotals).length, '다른 것', bad.map(([no, t]) => `${no} xls ${JSON.stringify(t)} app ${JSON.stringify(uc.get(no)?.total)}`));
  expect(bad.length).toBe(0);
}, 60000);

it.skipIf(!existsSync(G))('매송2교 xls — 들여쓰기 내역', () => {
  const book = readBook('y.xls', buf(G));
  const kinds = book.sheets.map((s) => [s.name, guessKind(s.name, s.rows)]);
  console.log(kinds.map((k) => k.join('→')).join(' · '));
  const i = book.sheets.findIndex((s) => s.name === '내역서');
  const cfg = defaultCfg(book.sheets[i].rows, 'nae');
  console.log('map', JSON.stringify(cfg.map), cfg.head, cfg.head2, cfg.start);
  const p = parseSheet(book.sheets[i].rows, cfg);
  console.log(p.note, p.preview.slice(0, 40).map((x) => `${'  '.repeat(x.depth)}[${x.tag}] ${x.cells.join(' | ')}`).join('\n'));
}, 60000);
