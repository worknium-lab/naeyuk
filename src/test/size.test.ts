import { it, expect } from 'vitest';
import { designSheet } from '../data/project';
import { basisData } from '../data/basisData';
it('계정 저장 문서 크기 < 256KiB', () => {
  for (const [k, v] of Object.entries({ design: designSheet(), basis: basisData() })) {
    const n = JSON.stringify({ v: JSON.stringify(v) }).length;
    expect(n, k).toBeLessThan(200_000);
  }
});
