import { it, expect } from 'vitest';
import { basisData } from '../data/basisData';
import { calcEval } from '../engine';

it('산출근거 줄을 다시 계산해도 단산 값이 xls 와 같다', () => {
  const b = basisData();
  for (const c of b.calcs) expect([c.no, calcEval(b, c).price]).toEqual([c.no, { l: c.l, m: c.m, e: c.e }]);
});
it('산출근거 줄 종류', () => {
  const b = basisData();
  const kinds = (no: string) => b.calcs.find((c) => c.no === no)!.lines!.map((l) => l.k).join(' ');
  console.log(['단산1', '단산2', '단산3', '단산7'].map((n) => n + ': ' + kinds(n)).join('\n'));
  const s2 = b.calcs.find((c) => c.no === '단산2')!;
  expect(s2.lines!.some((l) => l.k === 'q')).toBe(true);
  expect(b.mats['탄성실란트|2액폴리우레탄(12kg/통)']?.price).toBe(3800);
});
it('작업량 Q의 효율을 바꾸면 장비 단가가 바뀐다', () => {
  const b = basisData();
  const s2 = b.calcs.find((c) => c.no === '단산2')!;
  const lines = s2.lines!.map((l) => (l.k === 'q' ? { ...l, E: 0.9 } : l));
  const p = calcEval(b, { ...s2, lines }).price;
  expect(p.l).toBeLessThan(s2.l);
});
