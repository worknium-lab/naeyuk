import type { Amount } from './types';
import { floor } from './num';

/**
 * 원가계산서 (EST 표준 양식 1~18, A~L).
 * 각 비목은 요율 × 기준금액, 원 미만 버림.
 */
export type CostKey =
  | 'mat' | 'indMat' | 'scrap' | 'A'
  | 'dl' | 'il' | 'B'
  | 'exp' | 'ind' | 'emp' | 'health' | 'pension' | 'care' | 'retire'
  | 'machGuar' | 'safety' | 'env' | 'perfGuar' | 'subGuar' | 'etc' | 'C'
  | 'D' | 'gen' | 'profit' | 'adj' | 'waste' | 'H' | 'vat' | 'J' | 'supplied' | 'L';

export interface CostRates {
  il: number; ind: number; emp: number; health: number; pension: number; care: number; retire: number;
  machGuar: number; safety: number; env: number; subGuar: number; etc: number; gen: number; profit: number; vat: number;
}

export const DEFAULT_RATES: CostRates = {
  il: 0.137, ind: 0.037, emp: 0.0101, health: 0.03495, pension: 0.045, care: 0.1227, retire: 0.023,
  machGuar: 0.0032, safety: 0.0293, env: 0.009, subGuar: 0, etc: 0.084, gen: 0.06, profit: 0.1459, vat: 0.1,
};

export interface CostRow {
  key: CostKey;
  no: string;
  group: '재료비' | '노무비' | '경비' | '';
  label: string;
  /** 요율 표기 */
  rate?: string;
  /** 산출근거 표기 */
  basis?: string;
  amount: number | null;
  /** 이 비목을 넣을지 끌지 고를 수 있는지 */
  optional?: boolean;
  /** 설계가 고정 비목 */
  fixed?: boolean;
  /** 단수정리값 (부가세 포함) — 이윤에 TRUNC(값 ÷ 1.1) */
  roundAdj?: number;
  total?: boolean;
}

export interface CostInput {
  direct: Amount;
  waste?: number;
  supplied?: number;
  rates?: Partial<CostRates>;
  /** 끈 비목 (하도급 원가계산서에서 원도급사 부담 항목 등) */
  exclude?: Set<CostKey>;
  /**
   * 공급가액(총원가)을 맞출 목표값. 주면 이윤에서 차액을 정산한다.
   * (착공 계약금액 단수 맞춤, 하도급액 = 대상 × 하도급율)
   */
  targetSupply?: number;
  /** 설계가 고정 비목 — 낙찰률과 상관없이 이 금액을 그대로 쓴다 (건강·연금·요양·퇴직공제·산업안전 등) */
  fixed?: Partial<Record<CostKey, number>>;
  /** 단수정리값 (부가세 포함 금액) — 이윤에 TRUNC(단수정리값 ÷ 1.1) 을 더한다 */
  roundAdj?: number;
}

const pctText = (r: number) => `${+(r * 100).toFixed(4)}%`;
const k = (r: number) => `${+r.toFixed(6)}`;

export interface CostResult {
  rows: CostRow[];
  get: (key: CostKey) => number;
  supply: number;
  total: number;
}

export function costSheet(input: CostInput): CostResult {
  const R = { ...DEFAULT_RATES, ...input.rates };
  const ex = input.exclude ?? new Set<CostKey>();
  const on = (key: CostKey) => !ex.has(key);
  const fx = input.fixed ?? {};
  const v = (key: CostKey, val: number) => (on(key) ? (fx[key] !== undefined ? fx[key]! : floor(val)) : null);

  const mat = input.direct.m;
  const A = mat;
  const dl = input.direct.l;
  const il = v('il', dl * R.il) ?? 0;
  const B = dl + il;
  const exp = input.direct.e;
  const ind = v('ind', B * R.ind);
  const emp = v('emp', B * R.emp);
  const health = v('health', dl * R.health);
  const pension = v('pension', dl * R.pension);
  const care = health === null ? null : v('care', health * R.care);
  const retire = v('retire', dl * R.retire);
  const machGuar = v('machGuar', (A + dl + exp) * R.machGuar);
  const safety = v('safety', (A + dl) * R.safety);
  const env = v('env', (A + dl + exp) * R.env);
  const subGuar = R.subGuar ? v('subGuar', (A + dl + exp) * R.subGuar) : null;
  const etc = v('etc', (A + B) * R.etc);
  const C = exp + [ind, emp, health, pension, care, retire, machGuar, safety, env, subGuar, etc].reduce<number>((s, x) => s + (x ?? 0), 0);
  const D = A + B + C;
  const gen = v('gen', D * R.gen) ?? 0;
  const profitCalc = v('profit', (B + C + gen) * R.profit) ?? 0;
  const waste = input.waste ?? 0;
  let H = D + gen + profitCalc + waste;
  let adj = 0;
  if (input.targetSupply !== undefined) {
    adj = input.targetSupply - H;
    H = input.targetSupply;
  }
  const manual = input.roundAdj ? Math.trunc(input.roundAdj / (1 + R.vat)) : 0;
  if (manual) { adj += manual; H += manual; }
  const vat = floor(H * R.vat);
  const J = H + vat;
  const supplied = input.supplied ?? 0;
  const L = J + supplied;

  const rows: CostRow[] = [
    { key: 'mat', no: '1', group: '재료비', label: '직접재료비', amount: null },
    { key: 'indMat', no: '2', group: '재료비', label: '간접재료비', amount: mat },
    { key: 'scrap', no: '3', group: '재료비', label: '작업설·부산물등(△)', amount: null },
    { key: 'A', no: 'A', group: '재료비', label: '소계', amount: A, basis: '(1 + 2 + 3)', total: true },
    { key: 'dl', no: '4', group: '노무비', label: '직접노무비', amount: dl },
    { key: 'il', no: '5', group: '노무비', label: '간접노무비', amount: on('il') ? il : null, rate: pctText(R.il), basis: `4 × ${k(R.il)}`, optional: true },
    { key: 'B', no: 'B', group: '노무비', label: '소계', amount: B, basis: '(4 + 5)', total: true },
    { key: 'exp', no: '6', group: '경비', label: '산출경비', amount: exp },
    { key: 'ind', no: '7', group: '경비', label: '산재보험료', amount: ind, rate: pctText(R.ind), basis: `B × ${k(R.ind)}`, optional: true },
    { key: 'emp', no: '8', group: '경비', label: '고용보험료', amount: emp, rate: pctText(R.emp), basis: `B × ${k(R.emp)}`, optional: true },
    { key: 'health', no: '9', group: '경비', label: '건강보험료', amount: health, rate: pctText(R.health), basis: `4 × ${k(R.health)}`, optional: true },
    { key: 'pension', no: '10', group: '경비', label: '연금보험료', amount: pension, rate: pctText(R.pension), basis: `4 × ${k(R.pension)}`, optional: true },
    { key: 'care', no: '11', group: '경비', label: '노인장기요양보험료', amount: care, rate: pctText(R.care), basis: `9 × ${k(R.care)}`, optional: true },
    { key: 'retire', no: '12', group: '경비', label: '퇴직공제부금비', amount: retire, rate: pctText(R.retire), basis: `4 × ${k(R.retire)}`, optional: true },
    { key: 'machGuar', no: '13', group: '경비', label: '건설기계대여금지급보증서발급액', amount: machGuar, rate: pctText(R.machGuar), basis: `(A + 4 + 6) × ${k(R.machGuar)}`, optional: true },
    { key: 'safety', no: '14', group: '경비', label: '산업안전보건관리비', amount: safety, rate: pctText(R.safety), basis: `(A + 4) × ${k(R.safety)}`, optional: true },
    { key: 'env', no: '15', group: '경비', label: '환경보전비', amount: env, rate: pctText(R.env), basis: `(A + 4 + 6) × ${k(R.env)}`, optional: true },
    { key: 'perfGuar', no: '16', group: '경비', label: '공사이행보증수수료', amount: null },
    { key: 'subGuar', no: '17', group: '경비', label: '하도급대금지급보증수수료', amount: subGuar, rate: R.subGuar ? pctText(R.subGuar) : '0.081%', basis: '(A + 4 + 6) × 0.00081', optional: true },
    { key: 'etc', no: '18', group: '경비', label: '기타경비', amount: etc, rate: pctText(R.etc), basis: `(A + B) × ${k(R.etc)}`, optional: true },
    { key: 'C', no: 'C', group: '경비', label: '소계', amount: C, basis: '(6 ~ 18)', total: true },
    { key: 'D', no: 'D', group: '', label: '순공사원가', amount: D, basis: '(A + B + C)', total: true },
    { key: 'gen', no: 'E', group: '', label: '일반관리비', amount: gen, rate: pctText(R.gen), basis: `D × ${k(R.gen)}` },
    { key: 'profit', no: 'F', group: '', label: '이윤', amount: profitCalc + adj, rate: pctText(R.profit), basis: `(B + C + E) × ${k(R.profit)}${adj ? (adj > 0 ? ' + ' : ' − ') + Math.abs(adj).toLocaleString() : ''}` },
    { key: 'waste', no: 'G', group: '', label: '폐기물처리비', amount: waste || null },
    { key: 'H', no: 'H', group: '', label: '총원가', amount: H, basis: '(D + E + F + G)', total: true },
    { key: 'vat', no: 'I', group: '', label: '부가가치세', amount: vat, rate: pctText(R.vat), basis: `H × ${k(R.vat)}` },
    { key: 'J', no: 'J', group: '', label: '도급액', amount: J, basis: '(H + I)', total: true },
    { key: 'supplied', no: 'K', group: '', label: '관급자재대', amount: supplied || null },
    { key: 'L', no: 'L', group: '', label: '총공사비', amount: L, basis: '(J + K)', total: true },
  ];
  for (const r of rows) if (fx[r.key] !== undefined && r.amount !== null) { r.basis = '설계가 고정'; r.fixed = true; }
  if (input.roundAdj) {
    const p = rows.find((r) => r.key === 'profit');
    if (p) {
      p.roundAdj = input.roundAdj;
      const auto = adj - manual;
      p.basis = `(B + C + E) × ${k(R.profit)}${auto ? (auto > 0 ? ' + ' : ' − ') + Math.abs(auto).toLocaleString() : ''} + TRUNC(${input.roundAdj.toLocaleString()} ÷ ${1 + R.vat})`;
    }
  }
  const map = new Map<CostKey, number>(rows.map((r) => [r.key, r.amount ?? 0]));
  map.set('adj', adj);
  return { rows, get: (key) => map.get(key) ?? 0, supply: H, total: J };
}

/** 끝수 정리 */
export type RoundMode = 'floor1000' | 'floor10000' | 'ceil1000' | 'none';
export function roundTo(v: number, mode: RoundMode): number {
  switch (mode) {
    case 'floor1000': return Math.floor(v / 1000) * 1000;
    case 'floor10000': return Math.floor(v / 10000) * 10000;
    case 'ceil1000': return Math.ceil(v / 1000) * 1000;
    default: return Math.floor(v);
  }
}
