import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell, FB, Group, Win } from '../ui/Shell';
import { pickFile, readQtyXlsx } from '../importXlsx';
import { canPrint } from '../ui/Ask';
import { exportXlsx } from '../xlsx';
import { sheetRows, costRows, compareRows, docBook } from '../exports';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { flatten, won, qtyFmt, lineAmount, pct, type Line } from '../engine';

export default function Progress() {
  const { s, set, contract: start, toast } = useStore();
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
  const [subWin, setSubWin] = useState(false);
  const importQty = async () => {
    if (locked) { toast('확정된 회차입니다 — 새 회차를 추가하세요'); return; }
    const f = await pickFile('.xlsx,.xls');
    if (!f) return;
    let got: { name: string; spec: string; qty: number }[] = [];
    try { got = readQtyXlsx(f.buf); } catch { toast('엑셀을 읽지 못했습니다'); return; }
    if (!got.length) { toast('품명·수량 머리글이 있는 시트를 찾지 못했습니다'); return; }
    const items = rows.filter((r) => !r.line.children).map((r) => r.line);
    const nk = (x: string) => x.replace(/\s+/g, '');
    let hit = 0;
    const miss: string[] = [];
    const add: Record<string, number> = {};
    for (const g of got) {
      const m = items.filter((l) => nk(l.name) === nk(g.name) && (!g.spec || nk(l.spec) === nk(g.spec)));
      if (m.length === 1) { add[m[0].id] = (add[m[0].id] ?? 0) + g.qty; hit++; } else miss.push(g.name);
    }
    set((st) => {
      const pg = { ...st.progress };
      for (const [id, v] of Object.entries(add)) { const p = [...(pg[id] ?? [])]; while (p.length <= round) p.push(0); p[round] = +v.toFixed(4); pg[id] = p; }
      return { ...st, progress: pg };
    });
    toast(`${f.name}: ${hit}줄을 금회 수량으로 넣었습니다${miss.length ? ` · 맞는 항목이 없거나 여러 개인 ${miss.length}줄 (${miss.slice(0, 3).join(', ')}${miss.length > 3 ? ' …' : ''})` : ''}`);
  };
  const inspection = () => {
    const r = s.rounds[round];
    const cum = docs.get('progressCum');
    const contractTotal = docs.get(s.changeConfirmed ? 'change' : 'start').cost.total;
    const form = {
      name: '기성부분 검사원',
      rows: [
        ['기 성 부 분  검 사 원'], [],
        ['공 사 명', s.info.name], ['발 주 처', s.info.client], ['계 약 금 액', { v: contractTotal, z: '#,##0"원"' }],
        ['기 성 회 차', `${r.name} (${r.status})`],
        ['금회 기성금액', { v: thisCost.cost.total, z: '#,##0"원"' }],
        ['누계 기성금액', { v: cum.cost.total, z: '#,##0"원"' }],
        ['기 성 률', { f: 'IF(B5=0,0,B8/B5)', v: contractTotal ? cum.cost.total / contractTotal : 0, z: '0.00%' }],
        ['검사 요청일', new Date().toLocaleDateString('ko-KR')], [],
        ['위 공사의 기성부분에 대하여 검사를 요청합니다.'], [],
        ['', '신청인 (현장대리인) :                         (인)'],
      ],
      widths: [18, 60], head: [], landscape: false,
    };
    exportXlsx(`기성부분 검사원 ${r.name} — ${s.info.name}.xlsx`, [
      form,
      ...docBook(`기성내역서 ${r.name} (금회)`, thisCost.sheet, thisCost.cost, { sheet: '금회', cost: '금회 원가계산서' }).reverse(),
      sheetRows(`기성내역서 ${r.name} (누계)`, cum.sheet, '누계'),
    ]).then((ok) => toast(ok ? '기성부분 검사원을 내려받았습니다' : '내려받기가 막혀 있습니다'));
  };

  const screen = (
    <Shell
      doc={`기성내역서 ${s.rounds[round]?.name ?? ''}`}
      toolbar={<>
        <Group label="기성">
          <FB icon="upload" label="일보물량" title="작업일보·물량 집계 엑셀(품명·규격·수량)을 금회 수량으로" onClick={importQty} />
          <FB icon="confirm" label="확정" onClick={() => { set((st) => ({ ...st, rounds: st.rounds.map((r, i) => (i === round ? { ...r, status: '확정' } : r)) })); toast(`${s.rounds[round].name}을(를) 확정했습니다 — 수량을 더 고칠 수 없습니다`); }} />
          <FB icon="new" label="회차추가" onClick={() => {
            set((st) => ({ ...st, rounds: [...st.rounds, { name: `제${st.rounds.length + 1}회`, status: '작성 중' }] }));
            setRound(s.rounds.length);
          }} />
          <FB icon="doc" label="검사원" title="기성부분 검사원 (엑셀: 검사원 + 금회·누계 내역 + 원가계산서)" onClick={inspection} />
        </Group>
        <Group label="계산">
          <FB icon="link" label="하도급 기성" title="이 회차 수량으로 본 하도급 업체별 기성" onClick={() => setSubWin(true)} />
          <FB icon="recalc" label="재계산" primary onClick={() => toast('기성금을 다시 계산했습니다')} />
          <FB icon="net" label="원가계산서" to="/cost?doc=progress" />
        </Group>
        <Group label="출력">
          <FB icon="print" label="인쇄" onClick={() => (canPrint() ? window.print() : toast('이 화면에서는 인쇄 창이 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 인쇄됩니다'))} />
          <FB icon="excel" label="엑셀" onClick={() => exportXlsx(`기성내역서 ${s.rounds[round].name}.xlsx`, [
            ...docBook(`기성내역서 ${s.rounds[round].name} (금회)`, docs.get('progress').sheet, docs.get('progress').cost, { sheet: '금회', cost: '금회 원가계산서' }).reverse(),
            sheetRows(`기성내역서 ${s.rounds[round].name} (누계)`, docs.get('progressCum').sheet, '누계'),
          ]).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 됩니다'))} />
        </Group>
      </>}
      info={<>
        <label><span className="k">기성 회차</span>
          <select value={round} onChange={(e) => setRound(+e.target.value)} style={{ fontWeight: 700 }}>
            {s.rounds.map((r, i) => <option key={r.name} value={i}>{r.name} ({r.status})</option>)}
          </select>
        </label>
        <span><span className="k">기준</span> {s.changeConfirmed ? `설계변경 ${s.change.name} (확정)` : s.phaseOn ? '차수 총괄 (착공내역서)' : '착공내역서'}</span>
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
      {subWin && (
        <Win title={`하도급 기성 — ${s.rounds[round]?.name}`} onClose={() => setSubWin(false)} w={820} h={420}
          buttons={<><span className="grow">하도급 단가 × 이 회차 기성 수량 (직접공사비 기준, 원가계산서 비목은 하도급 원가계산서 비율로 따로 정산)</span><button type="button" className="btn" onClick={() => setSubWin(false)}>닫기</button></>}>
          <div style={{ padding: 12, overflow: 'auto' }}>
            <table className="f" style={{ width: '100%' }}>
              <thead><tr><th>업체</th><th>공종</th><th>하도급 직접공사비</th><th>금회 기성</th><th>누계 기성</th><th>누계 진도</th></tr></thead>
              <tbody>
                {docs.subs.map((x) => {
                  const its = flatten(x.result.subLines).map((r) => r.line).filter((l) => !l.children);
                  const tot = its.reduce((a, l) => a + lineAmount(l).t, 0);
                  const by = (m: 'this' | 'cum') => its.reduce((a, l) => a + lineAmount({ ...l, qty: +q(l.id, m).toFixed(4) }).t, 0);
                  const t = by('this'), c = by('cum');
                  return <tr key={x.sub.id}><td>{x.sub.vendor}</td><td>{x.sub.trade}</td><td className="n">{won(tot)}</td><td className="n">{won(t, { zero: '0' })}</td><td className="n">{won(c, { zero: '0' })}</td><td className="n">{pct(c, tot, 1)}</td></tr>;
                })}
                {!docs.subs.length && <tr><td colSpan={6}>하도급이 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        </Win>
      )}
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
