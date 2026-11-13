import { useMemo } from 'react';
import { useStore, FIXED_DEFAULT } from './store';
import {
  costSheet, phaseSheet, progressSheet, sectionAmount, buildSubcontract, changeSheet,
  type CostResult, type Sheet, type CostKey,
} from './engine';

export interface DocInfo {
  key: string;
  name: string;
  sheet: Sheet;
  cost: CostResult;
}

/** 프로젝트의 모든 문서를 같은 계산 엔진으로 만든다 (일건서류 전체재계산) */
export function useDocs() {
  const { s, start, design, contract } = useStore();
  return useMemo(() => {
    const mk = (key: string, name: string, sheet: Sheet, opts: { targetSupply?: number; fixed?: Partial<Record<CostKey, number>> } = {}): DocInfo => ({
      key, name, sheet,
      cost: costSheet({
        direct: sectionAmount(sheet, 'main'),
        waste: sectionAmount(sheet, 'waste').t,
        supplied: sectionAmount(sheet, 'supplied').t,
        rates: s.rates,
        exclude: new Set(s.exclude ?? []),
        roundAdj: s.roundAdj?.[key] ?? 0,
        ...opts,
      }),
    });
    const d0 = mk('design', '설계내역서', design);
    // 설계가 고정 비목: 착공·설계변경도 설계 금액 그대로 (설계변경은 변경된 설계 기준)
    const keys = s.fixedKeys ?? FIXED_DEFAULT;
    const fixedOf = (c: CostResult) => Object.fromEntries(keys.filter((k) => c.rows.find((r) => r.key === k)?.amount != null).map((k) => [k, c.get(k)])) as Partial<Record<CostKey, number>>;
    const dChange = mk('changeDesign', '', changeSheet(design, s.change, 1));
    const list: DocInfo[] = [d0, mk('start', '착공내역서', start, { fixed: fixedOf(d0.cost) }), mk('change', `설계변경 내역서 ${s.change.name}`, changeSheet(start, s.change, s.bidRate), { fixed: fixedOf(dChange.cost) })];
    if (s.phaseOn) s.phases.forEach((p, i) => list.push(mk(`phase${i}`, `${p.name} 내역서 (${p.year})`, phaseSheet(contract, s.alloc, i))));
    if (s.progressOn) {
      const cur = s.rounds.length - 1;
      list.push(mk('progress', `기성내역서 ${s.rounds[cur].name} (금회)`, progressSheet(contract, s.progress, cur, 'this')));
      list.push(mk('progressCum', `기성내역서 ${s.rounds[cur].name} (누계)`, progressSheet(contract, s.progress, cur, 'cum')));
    }
    const changeSht = list.find((d) => d.key === 'change')!.sheet;
    const subs = s.subs.map((sub) => ({
      sub,
      result: buildSubcontract({ base: start, pick: new Set(sub.pick), rate: sub.rate, exclude: new Set(sub.exclude), round: sub.round }),
      /** 설계변경 기준 하도급 (같은 공종 + 고른 신규 항목) */
      change: buildSubcontract({ base: changeSht, pick: new Set([...sub.pick, ...(sub.pickNew ?? [])]), rate: sub.rate, exclude: new Set(sub.exclude), round: sub.round }),
    }));
    return { list, get: (k: string) => list.find((d) => d.key === k) ?? list[0], subs };
  }, [s, start, design, contract]);
}
