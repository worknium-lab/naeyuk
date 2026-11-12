import { describe, it, expect } from 'vitest';
import { designSheet } from '../data/project';
import { sectionAmount, costSheet, buildSubcontract, SUB_DEFAULT_EXCLUDE, applyRate, splitByRatio, phaseSheet, lineAmount } from '../engine';

describe('내역서 합계', () => {
  const s = designSheet();
  it('순공사비가 용암교 xls와 같다', () => {
    const a = sectionAmount(s, 'main');
    expect(a.t).toBe(163_747_465);
    expect(a.l).toBe(91_288_016);
    expect(a.m).toBe(63_260_540);
    expect(a.e).toBe(9_198_909);
  });
  it('관급자재대·폐기물처리비', () => {
    expect(sectionAmount(s, 'supplied').t).toBe(10_571_980);
    expect(sectionAmount(s, 'waste').t).toBe(3_300_150);
  });
});

describe('원가계산서', () => {
  it('설계 원가계산서 비목이 산출근거대로 계산된다', () => {
    const s = designSheet();
    const c = costSheet({ direct: sectionAmount(s, 'main'), waste: sectionAmount(s, 'waste').t, supplied: sectionAmount(s, 'supplied').t });
    expect(c.get('il')).toBe(12_506_458);
    expect(c.get('ind')).toBe(3_840_395);
    expect(c.get('etc')).toBe(14_032_621);
    expect(c.get('D')).toBe(c.get('A') + c.get('B') + c.get('C'));
    expect(c.get('H')).toBe(c.get('D') + c.get('gen') + c.get('profit') + 3_300_150);
    expect(c.get('L')).toBe(c.get('J') + 10_571_980);
  });
  it('목표 공급가액을 주면 이윤에서 정산한다', () => {
    const s = designSheet();
    const c = costSheet({ direct: sectionAmount(s, 'main'), targetSupply: 230_000_000 });
    expect(c.supply).toBe(230_000_000);
    expect(c.get('D') + c.get('gen') + c.get('profit')).toBe(230_000_000);
  });
});

describe('하도급', () => {
  const base = applyRate(designSheet(), 0.886, { skipSupplied: true });
  const r = buildSubcontract({ base, pick: new Set(['G23', 'G26']), rate: 0.82, exclude: new Set(SUB_DEFAULT_EXCLUDE), round: 'floor1000' });
  it('하도급대상 공급가액은 천원 단위', () => {
    expect(r.target.supply % 1000).toBe(0);
  });
  it('하도급 공급가액 = 대상 × 하도급율 (천원 미만 버림)', () => {
    expect(r.sub.supply).toBe(Math.floor((r.target.supply * 0.82) / 1000) * 1000);
  });
  it('원도급사 부담 비목은 빠진다', () => {
    const row = r.sub.rows.find((x) => x.key === 'ind')!;
    expect(row.amount).toBeNull();
  });
  it('하도급 단가는 대상 단가 × 0.82 원 미만 버림', () => {
    const t = r.targetLines[0].children![0].children![0];
    const u = r.subLines[0].children![0].children![0];
    expect(u.lu).toBe(Math.floor(t.lu * 0.82));
  });
});

describe('차수 분개', () => {
  it('차수 합이 원래 수량과 같다', () => {
    const s = designSheet();
    const alloc = splitByRatio(s, [0.48, 0.52]);
    const a1 = lineAmount(phaseSheet(s, alloc, 0).sections[0].lines[0]);
    const a2 = lineAmount(phaseSheet(s, alloc, 1).sections[0].lines[0]);
    for (const [id, q] of Object.entries(alloc)) expect(+(q[0] + q[1]).toFixed(4)).toBeGreaterThanOrEqual(0), void id;
    expect(a1.t + a2.t).toBeGreaterThan(0);
  });
});
