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

import machineRows from '../data/machine.rows.json';
import { machinePrice, parseNum } from '../engine';
it('기계경비 7종이 xls 시간당 값과 같다', () => {
  const b = basisData();
  for (const r of (machineRows as string[][]).filter((x) => x[0] === 'grp')) {
    const m = b.machines!.find((x) => x.no === r[1])!;
    const t = machinePrice(b, m).total;
    expect([r[1], t.l, t.m, t.e]).toEqual([r[1], parseNum(r[6]), parseNum(r[7]), parseNum(r[8])]);
  }
});
it('단산1·2의 장비 줄을 읽는다', () => {
  const b = basisData();
  expect(b.calcs.find((c) => c.no === '단산1')!.machineLines).toEqual([
    { machine: 'M1', col: 'l', mult: 16, base: 39_645 }, { machine: 'M1', col: 'm', mult: 16, base: 1_902 }, { machine: 'M1', col: 'e', mult: 16, base: 4_392 }]);
  expect(b.calcs.find((c) => c.no === '단산2')!.machineLines!.map((x) => x.machine)).toEqual(['M2', 'M2', 'M2']);
});
