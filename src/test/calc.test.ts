import { it, expect } from 'vitest';
import { basisData } from '../data/basisData';
import { calcPrice } from '../engine';

it('단산 노임 줄을 읽는다', () => {
  const b = basisData();
  const s3 = b.calcs.find((c) => c.no === '단산3')!;
  expect(s3.laborLines).toEqual([{ wage: '특별인부', mult: 0.2 }, { wage: '보통인부', mult: 2 / 15 }]);
  expect(calcPrice(b, s3)).toEqual({ l: s3.l, m: s3.m, e: s3.e });
});

it('노임을 갱신하면 단산 노무비가 차이만큼 바뀐다', () => {
  const b = basisData();
  for (const w of Object.values(b.wages)) if (w.cur) w.use = 'cur';
  const s7 = b.calcs.find((c) => c.no === '단산7')!;
  const p = calcPrice(b, s7);
  const d = Math.floor(((228_717 - 187_435) * 0.12 + (172_698 - 148_510) * 0.02) * 10) / 10;
  expect(p.l).toBe(Math.floor(s7.l + d));
  expect(p.m).toBe(s7.m + Math.floor(Math.floor(d * 0.08 * 10) / 10));
});
