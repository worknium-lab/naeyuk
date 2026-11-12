import rowsRaw from './estimate.rows.json';
import { parseNum, type Line, type Sheet, type Section } from '../engine';

type Raw = [number, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string[], string?];

/** 품명 → 근거 (일위대가 호표 / 단가산출 / 시장단가) */
const REFS: Record<string, string> = {
  '단면보수': '제8호표',
  '표면처리': '제13호표',
  '배수구 청소': '제1호표',
  '퇴적 이물질 제거': '제6호표',
  '조인트부 실란트보수': '단산3',
  '강재 재도장': '제3호표',
  '절삭후 아스팔트덧씌우기': '단산4',
  '차선도색(융착식,일반형)-운행도로,차량부분통제': '단산5',
  '신축이음부 유도배수시설 설치': '제16호표',
  '배수관 재설치': '제18호표',
  '교통통제및안전처리': '단산1',
  '폐기물상차': '단산2',
  '중기운반': '단산6',
};

const SECTION: Record<string, Section> = { G1: 'main', G38: 'supplied', G41: 'waste' };

/** 설계내역서 — 국도43호선 용암교 보수공사 (용암교 xls 기준) */
export function designSheet(): Sheet {
  const rows = rowsRaw as unknown as Raw[];
  const byId = new Map<string, Line>();
  const sections: Sheet['sections'] = [];
  for (const r of rows) {
    const [no, lv, mark, name, spec, qty, unit, , , lu, , mu, , eu, , kind, parents, gid] = r;
    if (kind === 'blank' || kind === 'ns') continue;
    const line: Line = {
      id: kind === 'grp' ? gid! : `L${no}`,
      level: (lv ? Number(lv) : 0) as Line['level'],
      mark,
      name,
      spec,
      unit,
      qty: parseNum(qty),
      lu: kind === 'grp' ? 0 : parseNum(lu),
      mu: kind === 'grp' ? 0 : parseNum(mu),
      eu: kind === 'grp' ? 0 : parseNum(eu),
      ref: REFS[name],
      children: kind === 'grp' ? [] : undefined,
    };
    // 단위조정(△)은 단가가 음수
    if (name === '단위조정') line.eu = -7951;
    byId.set(line.id, line);
    if (!parents.length) {
      sections.push({ section: SECTION[line.id] ?? 'main', lines: [line] });
    } else {
      byId.get(parents[parents.length - 1])!.children!.push(line);
    }
  }
  return { sections };
}

export const PROJECT = {
  name: '국도43호선 용암교 보수공사',
  file: 'D:\\적산\\Data\\국도43호선 용암교 보수공사.wnx',
  client: '○○국토관리사무소',
  bidRate: 0.886,
  basis: '2026년 하반기',
};
