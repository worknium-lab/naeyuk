import { describe, it, expect } from 'vitest';
import unitRows from '../data/unitcost.rows.json';
import { basisData } from '../data/basisData';
import { computeUnits, parseNum } from '../engine';

describe('일위대가 호표 계산', () => {
  const b = basisData();
  const u = computeUnits(b);
  const grp = (unitRows as string[][]).filter((r) => r[0] === 'grp');
  for (const r of grp) {
    it(`${r[1]} ${r[3]} — xls 합계와 같다`, () => {
      const t = u.get(r[1])!.total;
      expect([t.l, t.m, t.e]).toEqual([parseNum(r[10]), parseNum(r[12]), parseNum(r[14])]);
    });
  }
});
