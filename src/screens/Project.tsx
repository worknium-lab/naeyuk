import { Fragment, useState, type CSSProperties } from 'react';
import { BudgetBar } from '../ui/BudgetBar';
import { Link, useNavigate } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { canPrint } from '../ui/Ask';
import { exportXlsx } from '../xlsx';
import { sheetRows, costRows, compareRows, docBook } from '../exports';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { won, allLines, unassigned, pct } from '../engine';

type DocKey = 'design' | 'start' | 'phase' | 'progress' | 'change' | 'sub' | 'final';

export default function Project() {
  const { s, set, contract, toast } = useStore();
  const docs = useDocs();
  const nav = useNavigate();
  const [sel, setSel] = useState<DocKey>('start');

  const items = allLines(contract).filter((l) => !l.children);
  const unassignedCount = items.filter((l) => Math.abs(unassigned(l, s.alloc)) > 1e-6).length;
  const cur = s.rounds.length - 1;
  const cumDone = items.every((l) => Math.abs((s.progress[l.id] ?? []).slice(0, cur + 1).reduce((a, b) => a + b, 0) - l.qty) < 1e-6);
  const cumRate = (() => {
    const cum = docs.get('progressCum');
    return cum ? cum.cost.get('D') / docs.get('start').cost.get('D') : 0;
  })();
  const conds = [
    { ok: s.changeConfirmed, label: '설계변경 1회 확정 (필수)', show: true },
    { ok: unassignedCount === 0, label: `차수 미배정 수량 0 (지금 ${unassignedCount}항목)`, show: s.phaseOn },
    { ok: cumDone, label: `기성 누계 = 최종 계약 수량 (지금 ${pct(cumRate, 1, 1)})`, show: s.progressOn },
  ].filter((c) => c.show);
  const okCount = conds.filter((c) => c.ok).length;
  const finalReady = okCount === conds.length;

  const D = docs.get('design').cost.total;
  const S = docs.get('start').cost.total;

  const box = (k: DocKey, style: CSSProperties, body: React.ReactNode, opts: { opt?: boolean; off?: boolean; wait?: boolean } = {}) => (
    <a href="#" className={'doc' + (sel === k ? ' on' : '') + (opts.wait ? ' wait' : '') + (opts.off ? ' off' : '')} style={style}
      onClick={(e) => { e.preventDefault(); setSel(k); }}
      onDoubleClick={() => open(k)}>
      {opts.opt && <span className="opt">선택</span>}
      {body}
    </a>
  );
  const open = (k: DocKey) => {
    const to: Record<DocKey, string> = { design: '/estimate', start: '/estimate?doc=start', phase: '/phase', progress: '/progress', change: '/change', sub: '/sub', final: '/project' };
    if (k === 'final') { finalReady ? toast('준공내역서를 만들었습니다') : toast(`준공 조건 ${conds.length}개 중 ${okCount}개 충족`); return; }
    nav(to[k]);
  };

  const detail: Record<DocKey, { title: string; rows: [string, string][]; make?: [string, string][] }> = {
    design: { title: '설계내역서', rows: [['기준 문서', '—'], ['도급액', won(D)], ['만들기', '직접 작성 · EST·엑셀 가져오기']], make: [['착공내역서 (낙찰률)', '/estimate?doc=start']] },
    start: { title: '착공내역서', rows: [['기준 문서', '설계내역서'], ['낙찰률', `${+(s.bidRate * 100).toFixed(3)}%`], ['도급액', won(S)], ['단수 맞춤', '계약금액에 맞춰 이윤에서 조정']], make: [['차수별 내역서', '/phase'], ['기성내역서 회차 추가', '/progress'], ['하도급내역서', '/sub']] },
    phase: { title: '차수별 내역서', rows: [['기준 문서', '착공내역서'], ['차수', s.phases.map((p) => p.name).join(' · ')], ['미배정', `${unassignedCount}항목`]] },
    progress: { title: '기성내역서', rows: [['기준 문서', s.phaseOn ? '차수별 내역서' : '착공내역서'], ['회차', s.rounds.map((r) => r.name).join(' · ')], ['누계', pct(cumRate, 1, 1)]] },
    change: { title: '설계변경 내역서', rows: [['기준 문서', '착공내역서'], ['구성', '당초 · 변경 · 증감'], ['신규 단가', '설계단가 × 낙찰률'], ['도급액 증감', won(docs.get('change').cost.total - S, { tri: false, zero: '0' })]], make: [['설계변경 내역서 열기', '/change'], ['변경 원가계산서', '/cost?doc=change']] },
    sub: { title: '하도급내역서', rows: [['기준 문서', '착공내역서'], ['업체', docs.subs.map((x) => x.sub.vendor).join(', ')], ['하도급율', docs.subs.map((x) => `${(x.sub.rate * 100).toFixed(1)}%`).join(', ')]], make: [['원·하도급 대비내역서', '/sub/compare']] },
    final: { title: '준공내역서', rows: [['기준 문서', '착공 + 확정된 설계변경'], ['상태', `조건 ${conds.length}개 중 ${okCount}개 충족`]] },
  };
  const dt = detail[sel];

  return (
    <Shell
      doc="프로젝트 홈"
      tabs="none"
      toolbar={<>
        <Group label="기본 문서">
          <FB icon="doc" label="설계" to="/estimate" />
          <FB icon="docOk" label="착공" primary to="/estimate?doc=start" title="설계내역서에서 착공내역서 (낙찰률 적용)" />
        </Group>
        <Group label="착공내역서에서 만드는 문서">
          <FB icon="phase" label="차수별" to="/phase" />
          <FB icon="chart" label="기성" to="/progress" />
          <FB icon="swap" label="설계변경" to="/change" />
          <FB icon="link" label="하도급" to="/sub" title="하도급내역서 (공종 선택 → 하도급율 적용)" />
        </Group>
        <Group label="마무리">
          <FB icon="done" label="준공" onClick={() => open('final')} />
          <FB icon="compare" label="대비" to="/sub/compare" title="원·하도급 대비내역서" />
        </Group>
        <Group label="출력">
          <FB icon="print" label="인쇄" onClick={() => (canPrint() ? window.print() : toast('이 화면에서는 인쇄 창이 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 인쇄됩니다'))} />
          <FB icon="excel" label="엑셀" title="모든 문서를 시트별로" onClick={() => exportXlsx('국도43호선 용암교 보수공사 — 내역서 일체.xlsx', [
            ...docs.list.flatMap((d) => docBook(d.name, d.sheet, d.cost, { sheet: d.name.slice(0, 24), cost: d.name.slice(0, 20) + ' 원가' }).reverse()),
          ]).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 됩니다'))} />
        </Group>
      </>}
      info={<>
        <span><span className="k">공사명</span> <b>국도43호선 용암교 보수공사</b></span>
        <span><span className="k">발주처</span> ○○국토관리사무소</span>
        <label><input type="checkbox" checked={s.phaseOn} onChange={(e) => set((st) => ({ ...st, phaseOn: e.target.checked }))} />차수공사 사용 (장기계속공사)</label>
        <label><input type="checkbox" checked={s.progressOn} onChange={(e) => set((st) => ({ ...st, progressOn: e.target.checked }))} />기성 관리 사용</label>
        <label><input type="checkbox" checked={s.changeConfirmed} onChange={(e) => set((st) => ({ ...st, changeConfirmed: e.target.checked }))} />설계변경 1회 확정</label>
        <div style={{ flex: 1 }} />
        <span className="k">끄면 해당 문서가 체계에서 빠지고, 준공은 착공 + 설계변경으로 만듭니다</span>
      </>}
      left={
        <nav className="lp" aria-label="내역서 체계">
          <div className="lp-h">내역서 체계</div>
          <Link to="/estimate"><span>설계내역서</span><span className="st">확정</span></Link>
          <Link to="/estimate?doc=start"><span>착공내역서</span><span className="st">확정</span></Link>
          {s.phaseOn && <>
            <a href="#" style={{ paddingLeft: 18 }} onClick={(e) => { e.preventDefault(); setSel('phase'); }}><span>▾ 차수별 내역서</span><span className="st">선택 · {s.phases.length}</span></a>
            {s.phases.map((p) => <Link key={p.name} to="/phase" style={{ paddingLeft: 40 }}><span>{p.name} ({p.year})</span><span className="st">{p.status}</span></Link>)}
          </>}
          {s.progressOn && <>
            <a href="#" style={{ paddingLeft: 18 }} onClick={(e) => { e.preventDefault(); setSel('progress'); }}><span>▾ 기성내역서</span><span className="st">선택 · {s.rounds.length}</span></a>
            {s.rounds.map((r) => <Link key={r.name} to="/progress" style={{ paddingLeft: 40 }}><span>{r.name}</span><span className="st">{r.status}</span></Link>)}
          </>}
          <a href="#" style={{ paddingLeft: 18 }} onClick={(e) => { e.preventDefault(); setSel('change'); }}><span>▾ 설계변경 내역서</span><span className="st">1</span></a>
          <a href="#" style={{ paddingLeft: 40 }} onClick={(e) => { e.preventDefault(); setSel('change'); }}><span>변경 1회</span><span className="st">{s.changeConfirmed ? '확정' : '작성 중'}</span></a>
          <a href="#" style={{ paddingLeft: 18 }} onClick={(e) => { e.preventDefault(); setSel('sub'); }}><span>▾ 하도급내역서</span><span className="st">선택 · {s.subs.length}</span></a>
          {s.subs.map((x) => <Link key={x.id} to={`/sub?id=${x.id}`} style={{ paddingLeft: 40 }}><span>{x.vendor} ({x.trade})</span><span className="st">{x.confirmed ? '계약' : '작성 중'}</span></Link>)}
          <a href="#" onClick={(e) => { e.preventDefault(); setSel('final'); }}><span>준공내역서</span><span className="st">{finalReady ? '만들 수 있음' : '대기'}</span></a>
        </nav>
      }
      right={
        <aside className="rp" aria-label="선택한 문서">
          <h2>{dt.title}</h2>
          <dl>{dt.rows.map(([a, b]) => <Fragment key={a}><dt>{a}</dt><dd>{b}</dd></Fragment>)}</dl>
          {dt.make && (
            <div style={{ borderTop: '1px solid #D5D9DF', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2 style={{ marginBottom: 4 }}>이 문서에서 만들기</h2>
              {dt.make.map(([lab, to]) => <Link key={lab} className="btn" style={{ justifyContent: 'flex-start' }} to={to}>{lab}</Link>)}
            </div>
          )}
          <div role="status" className="note">
            <b>준공내역서 조건</b><br />
            {conds.map((c) => <div key={c.label}>{c.ok ? '☑' : '☐'} {c.label}</div>)}
          </div>
          <button type="button" className="btn pri" style={{ marginTop: 'auto' }} onClick={() => open(sel)}>{dt.title} 열기</button>
        </aside>
      }
      footer={<><span>문서 {2 + (s.phaseOn ? s.phases.length : 0) + (s.progressOn ? s.rounds.length : 0) + 1 + s.subs.length + 1}개</span><span>상자를 두 번 누르면 문서를 엽니다</span></>}
    >
      <div style={{ padding: '16px 20px' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 14 }}>금액 구성</h1>
        <div style={{ width: 860, marginBottom: 28 }}><BudgetBar /></div>
        <h1 style={{ margin: '0 0 16px', fontSize: 14 }}>내역서 흐름</h1>
        <div role="img" aria-label="설계 → 착공 → 차수별·기성·설계변경·하도급 → 준공" style={{ position: 'relative', width: 860, height: 490 }}>
          <svg width="860" height="490" viewBox="0 0 860 490" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0 }}>
            <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#3D4450" /></marker></defs>
            <g fill="none" stroke="#3D4450" strokeWidth="1.3">
              <path d="M420 64V98" markerEnd="url(#ar)" />
              <path d="M420 164V190" /><path d="M90 190H750" />
              {[90, 310, 530, 750].map((x) => <path key={x} d={`M${x} 190V218`} markerEnd="url(#ar)" />)}
              <path d="M90 300V344H530V300" /><path d="M310 300V344" />
              <path d="M420 344V378" markerEnd="url(#ar)" />
              <path d="M530 132H852V430H532" markerEnd="url(#ar)" />
            </g>
            <g fill="none" stroke="#8A929E" strokeWidth="1.2" strokeDasharray="4 3"><path d="M440 260H402" markerEnd="url(#ar)" /></g>
            <text x="430" y="84" fontSize="11" fill="#555C66">낙찰률 {+(s.bidRate * 100).toFixed(1)}%</text>
            <text x="420" y="322" textAnchor="middle" fontSize="10.5" fill="#555C66">← 변경 확정 시 차수·기성 기준 갱신</text>
            <text x="844" y="422" textAnchor="end" fontSize="10.5" fill="#555C66">착공 기준 직접 (차수·기성 미사용 시)</text>
          </svg>
          {box('design', { left: 310, top: 0, width: 220, height: 64 }, <><b>설계내역서</b><span className="k">발주처 설계가</span><span>도급액 {won(D)}</span></>)}
          {box('start', { left: 310, top: 100, width: 220, height: 64 }, <><b>착공내역서</b><span className="k">계약금액 기준 · 기준 문서</span><span>도급액 {won(S)}</span></>)}
          {box('phase', { left: 0, top: 220, width: 180, height: 80 }, <><b>차수별 내역서</b><span className="k">장기계속공사일 때만</span><span>{s.phaseOn ? `${s.phases.length}개 차수 · 미배정 ${unassignedCount}` : '사용 안 함'}</span></>, { opt: true, off: !s.phaseOn })}
          {box('progress', { left: 220, top: 220, width: 180, height: 80 }, <><b>기성내역서</b><span className="k">기성 관리할 때만</span><span>{s.progressOn ? `${s.rounds[cur].name} ${s.rounds[cur].status}` : '사용 안 함'}</span></>, { opt: true, off: !s.progressOn })}
          {box('change', { left: 440, top: 220, width: 180, height: 80 }, <><b>설계변경 내역서</b><span className="k">당초 · 변경 · 증감</span><span>변경 1회 {s.changeConfirmed ? '확정' : '작성 중'}</span></>)}
          {box('sub', { left: 660, top: 220, width: 180, height: 80 }, <><b>하도급내역서</b><span className="k">공종 선택 · 하도급율</span><span>{s.subs.length}개 업체</span></>, { opt: true })}
          {box('final', { left: 310, top: 380, width: 220, height: 100 }, <><b>준공내역서</b><span className="k">착공 + 확정된 설계변경</span><span className="k">(사용 시) 차수 합 · 기성 누계 확인</span><span>{finalReady ? '만들 수 있음' : `대기 · 조건 ${conds.length}개 중 ${okCount}개 충족`}</span></>, { wait: !finalReady })}
        </div>
      </div>
    </Shell>
  );
}
