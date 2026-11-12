import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Shell, FB, Group, usePopup } from '../ui/Shell';
import { useStore } from '../store';
import { won, parseNum } from '../engine';
import unitRows from '../data/unitcost.rows.json';
import calcRows from '../data/calc.rows.json';
import machineRows from '../data/machine.rows.json';
import tables from '../data/tables.json';

/* ---------- 묶음 접기/펼치기 공통 ---------- */
function useFold(groups: string[], openDefault: string[]) {
  const [open, setOpen] = useState<Set<string>>(new Set(openDefault));
  return {
    isOpen: (g: string) => open.has(g),
    toggle: (g: string) => setOpen((o) => { const n = new Set(o); n.has(g) ? n.delete(g) : n.add(g); return n; }),
    all: () => setOpen(new Set(groups)),
    none: () => setOpen(new Set()),
  };
}

function FoldBar({ fold, extra }: { fold: ReturnType<typeof useFold>; extra?: ReactNode }) {
  return (
    <>
      <div className="vg">
        <button type="button" className="vb" onClick={fold.all}>모두 펼침</button>
        <button type="button" className="vb" onClick={fold.none}>제목만</button>
      </div>
      {extra}
    </>
  );
}

const Tg = ({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) => (
  <button type="button" className="tg" aria-expanded={open} aria-label={(open ? '접기: ' : '펼치기: ') + label} onClick={(e) => { e.stopPropagation(); onClick(); }}>{open ? '▾' : '▸'}</button>
);

/* ---------- 일위대가 ---------- */
type URow = [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];

export function UnitCost() {
  const { s, toast } = useStore();
  const { open } = usePopup();
  const rows = unitRows as URow[];
  const groups = useMemo(() => [...rows.filter((r) => r[0] === 'grp').map((r) => r[1]), ...s.imported.map((u) => u.no)], [rows, s.imported]);
  const fold = useFold(groups, ['제3호표', '제7호표', ...s.imported.map((u) => u.no)]);
  const [find, setFind] = useState('');
  return (
    <Shell
      doc="일위대가"
      toolbar={<>
        <Group label="근거 불러오기">
          <FB icon="labor" label="노임" to="/labor" /><FB icon="material" label="자재" to="/material" /><FB icon="machine" label="장비" to="/machine" />
          <FB icon="calc" label="단산" to="/calc" /><FB icon="docs" label="일위" title="다른 내역서의 일위대가" onClick={() => open('refcopy')} />
          <FB icon="market" label="표준" onClick={() => open('market')} />
        </Group>
        <Group label="호표 작성">
          <FB icon="new" label="호표" onClick={() => toast('새 호표: 표준품셈 팝업에서 바로 만들 수 있습니다')} />
          <FB icon="pct" label="잡비" onClick={() => toast('잡비 (비목 비율)')} />
          <FB icon="plus" label="할증" onClick={() => toast('할증 (노무비의 %)')} />
          <FB icon="adj" label="단위조정" onClick={() => toast('단위조정 (원 단위 맞춤)')} />
          <FB icon="book" label="품셈" onClick={() => open('pumsem')} />
        </Group>
        <Group label="편집">
          <FB icon="search" label="사용처" onClick={() => toast('제3호표 사용처: 내역서 교대·교각 강재 재도장 2줄')} />
        </Group>
        <Group label="계산"><FB icon="recalc" label="재계산" primary onClick={() => toast('전체재계산했습니다')} /></Group>
      </>}
      info={<FoldBar fold={fold} extra={<>
        <label><span className="k">찾기</span><input type="text" value={find} onChange={(e) => setFind(e.target.value)} placeholder="호표·품명" style={{ width: 160, padding: '0 6px' }} /></label>
        <div style={{ flex: 1 }} /><span className="k">호표 {groups.length}개 · 다른 내역서에서 가져온 호표는 비고에 출처가 남습니다</span>
      </>} />}
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead>
            <tr><th rowSpan={2} /><th rowSpan={2}>호 표</th><th rowSpan={2}>품    명</th><th rowSpan={2}>규 격</th><th rowSpan={2}>수량</th><th rowSpan={2}>단위</th><th colSpan={2}>합    계</th><th colSpan={2}>노 무 비</th><th colSpan={2}>재 료 비</th><th colSpan={2}>경    비</th><th rowSpan={2}>비 고</th></tr>
            <tr>{[0, 1, 2, 3].map((k) => <Fragment key={k}><th>단가</th><th>금액</th></Fragment>)}</tr>
          </thead>
          <tbody>
            {rows.filter((r) => !find || groups.includes(r[1]) && rows.some((x) => x[1] === r[1] && x[0] === 'grp' && (x[1] + x[3]).includes(find))).map((r, i) => {
              const grp = r[0] === 'grp';
              if (!grp && !fold.isOpen(r[1])) return null;
              return (
                <tr key={i} className={grp ? 'g' : ''}>
                  <td className="c">{grp && <Tg open={fold.isOpen(r[1])} onClick={() => fold.toggle(r[1])} label={r[3]} />}</td>
                  <td className="c">{r[2]}</td><td style={{ paddingLeft: grp ? 6 : 20 }}>{r[3]}</td><td>{r[4]}</td>
                  <td className="n">{r[5]}</td><td className="c">{r[6]}</td>
                  {[7, 8, 9, 10, 11, 12, 13, 14].map((k) => <td key={k} className="n">{r[k]}</td>)}
                  <td>{r[15]}</td>
                </tr>
              );
            })}
            {s.imported.map((u) => (
              <tr key={u.no} className="g sub">
                <td className="c" /><td className="c">{u.no}</td><td>{u.name}</td><td>{u.spec}</td><td className="n">1</td><td className="c">{u.unit}</td>
                <td className="n" /><td className="n">{won(u.l + u.m + u.e)}</td><td className="n" /><td className="n">{won(u.l)}</td><td className="n" /><td className="n">{won(u.m)}</td><td className="n" /><td className="n">{won(u.e)}</td>
                <td>{u.from}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 단가산출 ---------- */
type CRow = [string, string, string, string, string, string, string, string, string, string, string];

export function Calc() {
  const { toast } = useStore();
  const { open } = usePopup();
  const rows = calcRows as CRow[];
  const groups = rows.filter((r) => r[0] === 'grp').map((r) => r[1]);
  const fold = useFold(groups, ['S2', 'S3', 'S7']);
  return (
    <Shell
      doc="단가산출"
      toolbar={<>
        <Group label="근거 불러오기">
          <FB icon="labor" label="노임" to="/labor" /><FB icon="material" label="자재" to="/material" /><FB icon="machine" label="장비" to="/machine" />
          <FB icon="calc" label="단산" onClick={() => open('refcopy')} /><FB icon="unit" label="일위" to="/unit" />
        </Group>
        <Group label="산출">
          <FB icon="folder" label="공종" onClick={() => toast('공종 만들기')} />
          <FB icon="net" label="계산" primary title="수식 계산 (Alt+Z)" onClick={() => toast('수식을 다시 계산했습니다')} />
          <FB icon="sum" label="ADD" onClick={() => toast('위 줄들을 더했습니다')} />
          <FB icon="plus" label="합계" onClick={() => toast('같은 레벨 합계')} />
          <FB icon="pct" label="잡비" onClick={() => toast('잡비 (비목 비율)')} />
        </Group>
        <Group label="비목 지정">
          <FB icon="labor" label="노무" onClick={() => toast('노무비로 지정 (Shift+F5)')} />
          <FB icon="material" label="재료" onClick={() => toast('재료비로 지정')} />
          <FB icon="machine" label="경비" onClick={() => toast('경비로 지정')} />
        </Group>
        <Group label="계산"><FB icon="book" label="품셈" onClick={() => open('pumsem')} /><FB icon="recalc" label="재계산" onClick={() => toast('전체재계산했습니다')} /></Group>
      </>}
      info={<FoldBar fold={fold} extra={<><div style={{ flex: 1 }} /><span className="k">산출 {groups.length}건 · 수식 줄은 계산 결과가 오른쪽 비목 칸으로 갑니다</span></>} />}
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 26 }} /><th>산   출   근   거</th><th>합 계</th><th>노무비</th><th>재료비</th><th>경 비</th><th>구분</th><th>참 조</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const grp = r[0] === 'grp';
              if (!grp && !fold.isOpen(r[1])) return null;
              const pad = r[3] === 'i1' ? 16 : r[3] === 'i2' ? 30 : r[3] === 'i3' ? 44 : 6;
              return (
                <tr key={i} className={grp ? 'g' : r[0] === 'sub' ? 'sum' : ''}>
                  <td className="c">{grp && <Tg open={fold.isOpen(r[1])} onClick={() => fold.toggle(r[1])} label={r[4]} />}</td>
                  <td style={{ paddingLeft: pad, whiteSpace: 'pre', fontWeight: r[2] ? 700 : undefined }}>{r[4]}</td>
                  {[5, 6, 7, 8].map((k) => <td key={k} className="n">{r[k]}</td>)}
                  <td className="c">{r[9]}</td>
                  <td>{r[10] && <span className="lk">{r[10]}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 기계경비 ---------- */
type MRow = [string, string, string, string, string, string, string, string, string, string];

export function Machine() {
  const { toast } = useStore();
  const rows = machineRows as MRow[];
  const groups = rows.filter((r) => r[0] === 'grp').map((r) => r[1]);
  const fold = useFold(groups, ['M1', 'M2']);
  return (
    <Shell
      doc="기계경비"
      toolbar={<>
        <Group label="장비"><FB icon="machine" label="장비" onClick={() => toast('Main에서 장비 불러오기')} /><FB icon="form" label="공식" onClick={() => toast('기계경비 공식 등록·수정')} /></Group>
        <Group label="기준"><FB icon="rate" label="적용기준" primary onClick={() => toast('적용기준: 경유 1,832 · 휘발유 1,762 · 운전사 노임 2026 하반기')} /><FB icon="recalc" label="손료개정" onClick={() => toast("'22年 개정 손료계수 반영")} /></Group>
        <Group label="기타"><FB icon="search" label="사용처" onClick={() => toast('굴삭기 0.2㎥: 단산2 폐기물상차에서 사용')} /><FB icon="print" label="인쇄" onClick={() => window.print()} /></Group>
      </>}
      info={<FoldBar fold={fold} extra={<><div style={{ flex: 1 }} /><span className="k">시간당 기계경비 · 운전사 노임 × 1/8 × 16/12 × 25/20</span></>} />}
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 26 }} /><th>장비 · 항목</th><th>규 격</th><th>산 출 근 거</th><th>시간당 합계</th><th>노무비</th><th>재료비</th><th>경 비</th><th>비 고</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const grp = r[0] === 'grp';
              if (!grp && !fold.isOpen(r[1])) return null;
              return (
                <tr key={i} className={grp ? 'g' : ''}>
                  <td className="c">{grp && <Tg open={fold.isOpen(r[1])} onClick={() => fold.toggle(r[1])} label={r[2]} />}</td>
                  <td style={{ paddingLeft: grp ? 6 : 20 }}>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td>
                  {[5, 6, 7, 8].map((k) => <td key={k} className="n">{r[k]}</td>)}
                  <td>{r[9]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 자재단가 ---------- */
export function Material() {
  const { toast } = useStore();
  const t = (tables as Record<string, string[][][]>).Material[0];
  const head = t.slice(0, 2);
  const body = t.slice(2);
  const [sel, setSel] = useState(7);
  const r = body[sel];
  const SRC = ['가격정보', '물가자료', '유통물가', '물가정보', '거래가격', '견적가1'];
  const prices = SRC.map((name, k) => ({ name, price: r?.[4 + k * 2] ?? '', page: r?.[5 + k * 2] ?? '' })).filter((x) => x.price);
  const min = prices.length ? Math.min(...prices.map((p) => parseNum(p.price))) : 0;
  return (
    <Shell
      doc="자재단가"
      toolbar={<>
        <Group label="자재"><FB icon="material" label="자재" onClick={() => toast('Main에서 자재 불러오기')} /><FB icon="form" label="발췌근거" onClick={() => toast('발췌근거 열 설정')} /><FB icon="recalc" label="물가갱신" onClick={() => toast('물가지 최신 호로 갱신합니다 (데스크톱 판에서 자료실과 연결)')} /></Group>
        <Group label="적용"><FB icon="check" label="적용방법" onClick={() => toast('적용방법: 최저가 / 평균 / 지정')} /><FB icon="vendor" label="관급지정" onClick={() => toast(`${r?.[1]}을(를) 관급자재로 지정했습니다`)} /><FB icon="pct" label="경비처리" onClick={() => toast('경비로 처리 (VAT 별도 등)')} /></Group>
        <Group label="기타"><FB icon="search" label="사용처" onClick={() => toast(`${r?.[1]} 사용처: 일위대가 제5호표`)} /><FB icon="print" label="인쇄" onClick={() => window.print()} /></Group>
      </>}
      info={<><span><span className="k">적용방법</span> 최저가</span><span><span className="k">물가 기준</span> 2026년 하반기</span><div style={{ flex: 1 }} /><span className="k">줄을 누르면 출처별 단가를 봅니다</span></>}
      right={
        <aside className="rp" aria-label="선택 자재">
          <h2>{r?.[0]}. {r?.[1]} · {r?.[2]} · {r?.[3]}</h2>
          <table className="f" style={{ width: '100%' }}>
            <thead><tr><th>출처</th><th>단가</th><th>page</th></tr></thead>
            <tbody>{prices.map((p) => <tr key={p.name} className={parseNum(p.price) === min ? 'sel' : ''}><td>{p.name}</td><td className="n">{p.price}</td><td className="c">{p.page}</td></tr>)}</tbody>
          </table>
          <div className="calc"><div className="r"><span>적용 (최저가)</span><b>{won(min)}</b></div></div>
          <div className="hint">파란 줄이 적용된 출처입니다. 적용방법을 바꾸면 이 자재를 쓰는 일위대가가 같이 바뀝니다.</div>
        </aside>
      }
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead>
            <tr>{head[0].map((h, i) => <th key={i} rowSpan={i < 4 || i > 9 ? 2 : 1} colSpan={i >= 4 && i <= 9 ? 2 : 1}>{h}</th>)}</tr>
            <tr>{head[1].map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, i) => (
              <tr key={i} className={'click' + (sel === i ? ' sel' : '')} onClick={() => setSel(i)}>
                {row.map((c, k) => <td key={k} className={k === 0 || k === 3 || k === 17 ? 'c' : k >= 4 && k % 2 === 0 ? 'n' : ''}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 노임단가 ---------- */
export function Labor() {
  const { toast } = useStore();
  const t = (tables as Record<string, string[][][]>).Labor[0];
  const body = t.slice(2);
  const [use, setUse] = useState<Set<number>>(new Set(body.map((_, i) => i).filter((i) => !!body[i][6])));
  const [updated, setUpdated] = useState(false);
  const can = (i: number) => !!body[i][6];
  const diff = body.reduce((a, r, i) => a + (use.has(i) && can(i) ? parseNum(r[6]) - parseNum(r[3]) : 0), 0);
  return (
    <Shell
      doc="노임단가"
      toolbar={<>
        <Group label="노임"><FB icon="labor" label="노임" onClick={() => toast('노임 불러오기')} /><FB icon="form" label="발췌근거" onClick={() => toast('발췌근거 열 설정')} /></Group>
        <Group label="갱신">
          <FB icon="recalc" label="일괄갱신" primary onClick={() => { setUpdated(true); toast(`${use.size}개 직종을 2026년 하반기 공표 노임으로 바꿨습니다`); }} />
          <FB icon="chart" label="영향보기" onClick={() => toast(`직종별 단가 차이 합 +${won(diff)}원 — 내역서 영향은 재계산 후 원가계산서에서 확인합니다`)} />
          <FB icon="swap" label="직종대응" onClick={() => toast('통합·명칭이 바뀐 직종을 짝지어 줍니다')} />
        </Group>
        <Group label="출력"><FB icon="print" label="인쇄" onClick={() => window.print()} /></Group>
      </>}
      info={<><span><span className="k">현재 적용</span> {updated ? '2026년 하반기' : '2022년 상반기 (공사 작성 당시)'}</span><div style={{ flex: 1 }} /><span className="k">대한건설협회 2026년 하반기 시중노임단가</span></>}
      right={
        <aside className="rp" aria-label="일괄 갱신">
          <h2>2026년 하반기로 일괄 갱신</h2>
          <div className="calc">
            <div className="r"><span>선택 직종</span><span>{use.size}개</span></div>
            <div className="r"><span>단가 차이 합</span><b>+{won(diff)}</b></div>
          </div>
          <div className="hint">'사용' 칸을 끈 직종은 그대로 둡니다. 갱신하면 노임을 쓰는 일위대가·단가산출·기계경비가 함께 다시 계산됩니다.</div>
          <button type="button" className="btn pri" onClick={() => { setUpdated(true); toast('일괄 갱신했습니다'); }}>선택 직종 갱신</button>
          {updated && <button type="button" className="btn" onClick={() => setUpdated(false)}>갱신 전으로</button>}
        </aside>
      }
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead>
            <tr><th rowSpan={2}>No</th><th rowSpan={2}>품    명</th><th rowSpan={2}>단위</th><th rowSpan={2}>적용단가</th><th rowSpan={2}>비    고</th><th colSpan={3}>2026년 하반기 시중노임단가</th><th rowSpan={2}>사용</th></tr>
            <tr><th>직종번호</th><th>공표 단가</th><th>차이 (증감률)</th></tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i} className={updated && use.has(i) ? 'sub' : ''}>
                <td className="c">{r[0]}</td><td>{r[1]}</td><td className="c">{r[2]}</td>
                <td className="n">{updated && use.has(i) && can(i) ? r[6] : r[3]}</td><td>{updated && use.has(i) && can(i) ? '2026년(하)' : r[4]}</td>
                <td className="c">{r[5]}</td><td className="n">{r[6]}</td><td className="n">{r[7]}</td>
                <td className="c"><label style={{ display: 'inline-flex', gap: 4 }}><input type="checkbox" disabled={!can(i)} checked={use.has(i)} onChange={() => setUse((u) => { const n = new Set(u); n.has(i) ? n.delete(i) : n.add(i); return n; })} />{r[8]}</label></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
