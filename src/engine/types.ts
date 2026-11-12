/** 내역서 한 줄. 공종(그룹)은 children을 갖고, 세부 항목은 단가를 갖는다. */
export interface Line {
  id: string;
  /** L 레벨 칼럼 (● = 3, ○ = 2, 항목은 빈칸) */
  level: 0 | 1 | 2 | 3 | 4;
  mark: string;
  name: string;
  spec: string;
  unit: string;
  qty: number;
  /** 노무비 단가 */
  lu: number;
  /** 재료비 단가 */
  mu: number;
  /** 경비 단가 */
  eu: number;
  /** 근거 (제3호표, 단산3, 시장단가 코드 …) */
  ref?: string;
  note?: string;
  children?: Line[];
}

export interface Amount {
  /** 합계 */
  t: number;
  /** 노무비 */
  l: number;
  /** 재료비 */
  m: number;
  /** 경비 */
  e: number;
}

/** 내역서 맨 위 묶음 — 순공사비 아래 따로 붙는 관급자재대·폐기물처리비를 구분하려고 둔다. */
export type Section = 'main' | 'supplied' | 'waste';

export interface Sheet {
  sections: { section: Section; lines: Line[] }[];
}
