import type { Line } from '../engine';

/** 참고 내역서 — 국도3호선 ○○교 보수공사 (2022 상반기 노임으로 작성된 다른 공사) */
const it = (id: string, name: string, spec: string, unit: string, qty: number, lu: number, mu: number, eu: number, ref?: string): Line =>
  ({ id, level: 0, mark: '', name, spec, unit, qty, lu, mu, eu, ref });

export const REF_PROJECT: { name: string; lines: Line[] } = {
  name: '국도3호선 ○○교 보수공사',
  lines: [
    {
      id: 'RG1', level: 3, mark: '●', name: '1. 교량 보수보강공사', spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children: [
        { id: 'RG11', level: 2, mark: '○', name: '가. 강교 도장공', spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children: [
          it('R3', '강재 재도장', '중방식, 붓도장', '㎡', 1240, 33_150, 4_620, 650, '제3호표'),
          it('R4', '강재 면처리', 'SSPC-SP10', '㎡', 1240, 9_870, 1_160, 1_850, '제8호표'),
        ] },
        { id: 'RG12', level: 2, mark: '○', name: '나. 교면 정비', spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children: [
          it('R6', '퇴적 이물질 제거', '인력', '㎡', 320, 6_150, 0, 0, '제6호표'),
          it('R7', '배수구 청소', '집수구 포함', '개소', 24, 20_890, 0, 410, '제9호표'),
        ] },
        { id: 'RG13', level: 2, mark: '○', name: '다. 신축이음 보수', spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children: [
          it('R9', '조인트부 실란트보수', '폴리우레탄계', 'm', 86, 15_720, 3_220, 0, '단산3'),
          it('R10', '신축이음 후타재 교체', '초속경 콘크리트', '㎥', 2.4, 236_800, 168_200, 7_500, '제11호표'),
        ] },
      ],
    },
    {
      id: 'RG2', level: 3, mark: '●', name: '2. 부대공', spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children: [
        it('R12', '교통안전시설', '주간', '일', 12, 742_000, 31_000, 118_000, '단산1'),
      ],
    },
  ],
};

export interface Basis {
  kind: 'unit' | 'calc';
  name: string;
  spec: string;
  unit: string;
  l: number;
  m: number;
  e: number;
  deps: string[];
  labor: string[];
  material: string[];
}

/** 참고 내역서의 근거 (일위대가 호표 · 단가산출) */
export const REF_BASIS: Record<string, Basis> = {
  '제3호표': { kind: 'unit', name: '강재 재도장 (중방식)', spec: '붓도장', unit: '㎡', l: 33_150, m: 4_620, e: 650, deps: ['제4호표', '제5호표', '제7호표'], labor: [], material: [] },
  '제4호표': { kind: 'unit', name: '바탕처리 (동력공구)', spec: '철재면', unit: '㎡', l: 14_210, m: 280, e: 650, deps: [], labor: ['도 장 공', '보통인부'], material: [] },
  '제5호표': { kind: 'unit', name: '하도 (에폭시 프라이머)', spec: '2액형', unit: '㎡', l: 7_480, m: 2_160, e: 0, deps: [], labor: ['도 장 공'], material: ['에폭시 프라이머'] },
  '제7호표': { kind: 'unit', name: '상도 (조합페인트)', spec: '2회', unit: '㎡', l: 11_460, m: 2_180, e: 0, deps: [], labor: ['도 장 공'], material: ['조합페인트', '신너(조합페인트용)'] },
  '제6호표': { kind: 'unit', name: '퇴적 이물질 제거', spec: '인력', unit: '㎡', l: 6_150, m: 0, e: 0, deps: [], labor: ['보통인부'], material: [] },
  '제8호표': { kind: 'unit', name: '강재 면처리', spec: 'SSPC-SP10', unit: '㎡', l: 9_870, m: 1_160, e: 1_850, deps: [], labor: ['특별인부'], material: ['연 마 지'] },
  '제9호표': { kind: 'unit', name: '배수구 청소', spec: '집수구 포함', unit: '개소', l: 20_890, m: 0, e: 410, deps: [], labor: ['보통인부'], material: [] },
  '제11호표': { kind: 'unit', name: '신축이음 후타재 교체', spec: '초속경 콘크리트', unit: '㎥', l: 236_800, m: 168_200, e: 7_500, deps: [], labor: ['특별인부', '콘크리트공'], material: ['초속경 시멘트'] },
  '단산3': { kind: 'calc', name: '조인트부 실란트보수 (폴리우레탄계)', spec: '', unit: 'm', l: 15_720, m: 3_220, e: 0, deps: [], labor: ['특별인부', '보통인부'], material: ['폴리우레탄 실란트', '백업재', '실란트용 프라이머'] },
  '단산1': { kind: 'calc', name: '교통안전시설 (주간)', spec: '', unit: '일', l: 742_000, m: 31_000, e: 118_000, deps: [], labor: ['보통인부'], material: ['라바콘'] },
};

/** 현재 공사(용암교)에 이미 있는 노임 — 2026 하반기 */
export const CURRENT_LABOR: Record<string, number> = {
  '보통인부': 172_698,
  '특별인부': 228_717,
  '콘크리트공': 276_285,
  '도 장 공': 268_225,
};

export const CURRENT_MATERIAL = ['조합페인트', '신너(조합페인트용)', '연 마 지', '라바콘'];

/** 2022 상반기 → 2026 하반기 보통인부 노임 변동 (148,510 → 172,698) */
export const LABOR_INDEX = 172_698 / 148_510;
