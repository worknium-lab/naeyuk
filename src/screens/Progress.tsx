import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { canPrint } from '../ui/Ask';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { flatten, won, qtyFmt, lineAmount, pct, type Line } from '../engine';

export default function Progress() {
  const { s, set, start, toast } = useStore();
  const docs = useDocs();
  const [params] = useSearchParams();
  const host = params.get('host') === '1';
  const [round, setRound] = useState(s.rounds.length - 1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => start.sections.filter((x) => x.section === 'main').flatMap((x) => flatten(x.lines)), [start]);
  const vis = rows.filter((r) => !r.ancestors.some((a) => collapsed.has(a)));
  const locked = s.rounds[round]?.status === '확정';

  const leaves = (l: Line) => (l.children ? flatten(l.children).map((r) => r.line).filter((x) => !x.children) : [l]);
  const q = (id: string, mode: 'prev' | 'this' | 'cum') => {
    const p = s.progress[id] ?? [];
    if (mode === 'this') return p[round] ?? 0;
    if (mode === 'prev') return p.slice(0, round).reduce((a, b) => a + b, 0);
    return p.slice(0, round + 1).reduce((a, b) => a + b, 0);
  };
  const amt = (l: Line, mode: 'prev' | 'this' | 'cum') => leaves(l).reduce((a, x) => a + lineAmount({ ...x, qty: +q(x.id, mode).toFixed(4) }).t, 0);
  const setThis = (id: string, v: number) => set((st) => {
    const p = [...(st.progress[id] ?? [])];
    while (p.length <= round) p.push(0);
    p[round] = v;
    return { ...st, progress: { ...st.progress, [id]: p } };
  });
  const root = start.sections[0].lines[0];
  const contract = lineAmount(root).t;
  const over = rows.filter((r) => !r.line.children && q(r.line.id, 'cum') > r.line.qty + 1e-9);
  const thisCost = docs.get('progress');

  const screen = (
    <Shell
      doc={`기성내역서 ${s.rounds[round]?.name ?? ''}`}
      toolbar={<>
        <Group label="기성">
          <FB icon="upload" label="일보물량" title="작업일보 물량 가져오기" onClick={() => toast('통합 모드에서 작업일보 물량을 금회 수량으로 가져옵니다')} />
          <FB icon="confirm" label="확정" onClick={() => { set((st) => ({ ...st, rounds: st.rounds.map((r, i) => (i === round ? { ...r, status: '확정' } : r)) })); toast(`${s.rounds[round].name}을(를) 확정했습니다 — 수량을 더 고칠 수 없습니다`); }} />
          <FB icon="new" label="회차추가" onClick={() => {
            set((st) => ({ ...st, rounds: [...st.rounds, { name: `제${st.rounds.length + 1}회`, status: '작성 중' }] }));
            setRound(s.rounds.length);
          }} />
          <FB icon="doc" label="검사원" onClick={() => toast('기성검사원 양식 (준비 중)')} />
        </Group>
        <Group label="계산">
          <FB icon="chart" label="실행예산" onClick={() => toast('실행예산 대비는 통합 모드에서 연결합니다')} />
          <FB icon="recalc" label="재계산" primary onClick={() => toast('기성금을 다시 계산했습니다')} />
          <FB icon="net" label="원가계산서" to="/cost?doc=progress" />
        </Group>
        <Group label="출력">
          <FB icon="print" label="인쇄" onClick={() => (canPrint() ? window.print() : toast('이 화면에서는 인쇄 창이 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 인쇄됩니다'))} />
          <FB icon="excel" label="엑셀" onClick={() => toast('엑셀 저장은 데스크톱 판에서 붙입니다')} />
        </Group>
      </>}
      info={<>
        <label><span className="k">기성 회차</span>
          <select value={round} onChange={(e) => setRound(+e.target.value)} style={{ fontWeight: 700 }}>
            {s.rounds.map((r, i) => <option key={r.name} value={i}>{r.name} ({r.status})</option>)}
          </select>
        </label>
        <span><span className="k">기준</span> {s.phaseOn ? '차수 총괄 (착공내역서)' : '착공내역서'}</span>
        {locked && <span className="cf">확정된 회차라 수량을 고칠 수 없습니다</span>}
        {over.length > 0 && <span style={{ color: '#C00000' }}>계약 수량 초과 {over.length}항목</span>}
        <div style={{ flex: 1 }} />
        {!host && <Link to="/progress?host=1" style={{ fontSize: 12 }}>통합 모드로 보기</Link>}
      </>}
      left={
        <nav className="lp" aria-label="기성 회차" style={{ width: 160 }}>
          <div className="lp-h">기성 회차</div>
          {s.rounds.map((r, i) => (
            <a key={r.name} href="#" className={i === round ? 'on' : ''} onClick={(e) => { e.preventDefault(); setRound(i); }}>
              <span>{r.name}</span><span className="st">{r.status}</span>
            </a>
          ))}
        </nav>
      }
      right={
        <aside className="rp" aria-label="기성 요약" style={{ width: 250 }}>
          <h2>{s.rounds[round]?.name} 기성 요약</h2>
          <div className="calc">
            <div className="r"><span>계약 순공사비</span><span>{won(contract)}</span></div>
            <div className="r"><span>전회 누계</span><span>{won(amt(root, 'prev'))}</span></div>
            <div className="r"><span>금회</span><b>{won(amt(root, 'this'))}</b></div>
            <div className="r"><span>누계</span><span>{won(amt(root, 'cum'))}</span></div>
            <div className="r"><span>진도율</span><b>{pct(amt(root, 'cum'), contract, 1)}</b></div>
          </div>
          <div className="calc">
            <div className="r"><span>금회 기성금 (도급액 기준)</span></div>
            <div className="r"><span>순공사원가</span><span>{won(thisCost?.cost.get('D'))}</span></div>
            <div className="r"><span>공급가액</span><span>{won(thisCost?.cost.supply)}</span></div>
            <div className="r"><span>부가세 포함</span><b>{won(thisCost?.cost.total)}</b></div>
          </div>
          <div className="hint">금회 수량은 노란 칸에 넣습니다. 누계가 계약 수량을 넘으면 빨갛게 표시됩니다.</div>
        </aside>
      }
      footer={<><span>계약 {won(contract)}</span><span>누계 {pct(amt(root, 'cum'), contract, 1)}</span></>}
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead>
            <tr><th rowSpan={2}>품 명</th><th rowSpan={2}>규 격</th><th rowSpan={2}>단위</th><th rowSpan={2}>단가</th><th colSpan={2}>계 약</th><th colSpan={2}>전 회</th><th colSpan={2}>금 회</th><th colSpan={2}>누 계</th><th rowSpan={2}>진도</th></tr>
            <tr>{['계약', '전회', '금회', '누계'].map((k) => <Fragment key={k}><th>수량</th><th>금액</th></Fragment>)}</tr>
          </thead>
          <tbody>
            {vis.map((r) => {
              const l = r.line;
              const grp = !!l.children;
              const open = !collapsed.has(l.id);
              const cumQ = grp ? 0 : q(l.id, 'cum');
              const bad = !grp && cumQ > l.qty + 1e-9;
              return (
                <tr key={l.id} className={grp ? 'g' : ''}>
                  <td className="nm" style={{ paddingLeft: 6 + r.depth * 14 }}>
                    {grp && <button type="button" className="tg" onClick={() => { const c = new Set(collapsed); open ? c.add(l.id) : c.delete(l.id); setCollapsed(c); }}>{open ? '▾' : '▸'}</button>}
                    {l.mark} {l.name}
                  </td>
                  <td className="sp" title={l.spec}>{l.spec}</td><td className="c">{l.unit}</td>
                  <td className="n">{grp ? '' : won(l.lu + l.mu + l.eu)}</td>
                  <td className="n">{grp ? '' : qtyFmt(l.qty)}</td><td className="n">{won(lineAmount(l).t)}</td>
                  <td className="n">{grp ? '' : qtyFmt(+q(l.id, 'prev').toFixed(4))}</td><td className="n">{won(amt(l, 'prev'))}</td>
                  <td className="n">{grp ? '' : locked ? qtyFmt(q(l.id, 'this')) : <input className="q" value={q(l.id, 'this')} onChange={(e) => setThis(l.id, Number(e.target.value) || 0)} />}</td>
                  <td className="n">{won(amt(l, 'this'))}</td>
                  <td className="n" style={{ color: bad ? '#C00000' : undefined }}>{grp ? '' : qtyFmt(+cumQ.toFixed(4))}</td><td className="n">{won(amt(l, 'cum'))}</td>
                  <td className="c">{pct(amt(l, 'cum'), lineAmount(l).t, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );

  if (!host) return screen;
  return (
    <div className="host">
      <nav className="host-nav" aria-label="현장관리">
        <b>건설현장 통합관리</b>
        <a href="#" onClick={(e) => e.preventDefault()}>현장 대시보드</a>
        <a href="#" onClick={(e) => e.preventDefault()}>작업일보</a>
        <a href="#" onClick={(e) => e.preventDefault()}>공정관리</a>
        <a href="#" className="on" onClick={(e) => e.preventDefault()}>적산 · 기성</a>
        <a href="#" onClick={(e) => e.preventDefault()}>자재·장비</a>
        <a href="#" onClick={(e) => e.preventDefault()}>안전</a>
        <div style={{ flex: 1 }} />
        <Link to="/progress" style={{ color: '#8FA0B3' }}>독립 실행으로 보기</Link>
      </nav>
      {screen}
    </div>
  );
}
