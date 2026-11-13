import { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { useStore, type Subcontract } from '../store';
import { useDocs } from '../docs';
import { won, pct, findLine, unitTotal, type Sheet } from '../engine';
import { naeRows, wonRows, colorOf, legend, changeWorkbook, type ChangeFmt, type PairRow } from '../changeForms';
import { exportXlsx, type Cell } from '../xlsx';

const fmtCell = (c: Cell): string => (typeof c === 'number' ? (c < 0 ? '△' + Math.abs(c).toLocaleString('ko-KR') : c.toLocaleString('ko-KR', { maximumFractionDigits: 4 })) : (c ?? '') as string);

function Pair({ r, fmt, render }: { r: PairRow; fmt: ChangeFmt; render: (cells: Cell[]) => React.ReactNode }) {
  const order: ('before' | 'after')[] = fmt.top === 'before' ? ['before', 'after'] : ['after', 'before'];
  return <>{order.map((w, i) => (
    <tr key={w} className={(colorOf(fmt, w) === 'red' ? 'redline ' : '') + (i === 0 ? 'ptop ' : 'pbot ') + (r.kind === 'grp' || r.kind === 'total' ? 'g ' : '') + (r.kind === 'ns' ? 'nsrow ' : '') + (r.changed ? 'chg' : '')}>{render(r[w])}</tr>
  ))}</>;
}

/** 하도급 설계변경 — 원도급 설계변경 수량으로 하도급내역서를 다시 만들고 당초/변경 두 줄로 */
export default function SubChange() {
  const { s, set, start, toast } = useStore();
  const docs = useDocs();
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ?? s.subs[0]?.id;
  const e = docs.subs.find((x) => x.sub.id === id) ?? docs.subs[0];
  if (!e) return <Shell doc="하도급 설계변경" tabs="sub"><div style={{ padding: 20 }}>하도급이 없습니다.</div></Shell>;
  const { sub, result: r0, change: r1 } = e;
  const fmt = s.changeFmt;
  const setFmt = (p: Partial<ChangeFmt>) => set((st) => ({ ...st, changeFmt: { ...st.changeFmt, ...p } }));
  const update = (patch: Partial<Subcontract>) => set((st) => ({ ...st, subs: st.subs.map((x) => (x.id === sub.id ? { ...x, ...patch } : x)) }));
  const sh = (lines: typeof r0.subLines): Sheet => ({ sections: [{ section: 'main', lines }] });
  const before = { sheet: sh(r0.subLines), cost: r0.sub };
  const after = { sheet: sh(r1.subLines), cost: r1.sub };
  const rows = naeRows(before.sheet, after.sheet);
  const won2 = wonRows(r0.sub, r1.sub).filter((x) => !['mat', 'scrap', 'perfGuar', 'supplied', 'L', 'waste'].includes(x.key));
  const d = r1.sub.total - r0.sub.total;
  const added = s.change.added;
  const startMain = start.sections[0].lines;
  const locked = !!sub.changeConfirmed;

  return (
    <Shell
      doc={`하도급 설계변경 — ${sub.vendor} · ${s.change.name}`}
      tabs="sub"
      toolbar={<>
        <Group label="문서">
          <FB icon="doc" label="당초 하도급" to={`/sub?id=${sub.id}`} />
          <FB icon="swap" label="원도급 변경" to="/change" title="원도급 설계변경 내역서" />
        </Group>
        <Group label="확정">
          <FB icon="confirm" label={locked ? '확정 풀기' : '변경 확정'} primary={!locked} onClick={() => { update({ changeConfirmed: !locked }); toast(locked ? '하도급 변경 확정을 풀었습니다' : `${sub.vendor} 하도급 변경을 확정했습니다`); }} />
        </Group>
        <Group label="출력">
          <FB icon="excel" label="엑셀" title="하도급 변경 계약내역서·총괄표·원가계산서·증감대비" onClick={() => exportXlsx(`하도급 설계변경 — ${sub.vendor}.xlsx`, changeWorkbook(before, after, fmt, `${sub.vendor} 하도급 ${s.change.name}`)).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다'))} />
        </Group>
      </>}
      info={<>
        <label><span className="k">하도급</span>
          <select value={sub.id} onChange={(ev) => setParams({ id: ev.target.value })}>{s.subs.map((x) => <option key={x.id} value={x.id}>{x.vendor} · {x.trade}</option>)}</select>
        </label>
        <span><span className="k">기준</span> 원도급 {s.change.name} {s.changeConfirmed ? '(확정)' : '(작성 중)'}</span>
        <span><span className="k">하도급율</span> {(sub.rate * 100).toFixed(3)}%</span>
        <span className="k">윗줄</span>
        <div className="vg"><button type="button" className={'vb' + (fmt.top === 'before' ? ' on' : '')} onClick={() => setFmt({ top: 'before' })}>당초</button><button type="button" className={'vb' + (fmt.top === 'after' ? ' on' : '')} onClick={() => setFmt({ top: 'after' })}>변경</button></div>
        <span className="k">윗줄 색</span>
        <div className="vg"><button type="button" className={'vb' + (fmt.topColor === 'red' ? ' on' : '')} style={{ color: fmt.topColor === 'red' ? '#fff' : '#C00000' }} onClick={() => setFmt({ topColor: 'red' })}>빨강</button><button type="button" className={'vb' + (fmt.topColor === 'black' ? ' on' : '')} onClick={() => setFmt({ topColor: 'black' })}>검정</button></div>
        <div style={{ flex: 1 }} />
        {locked && <span className="cf">변경 확정됨</span>}
      </>}
      left={
        <nav className="lp" aria-label="설계변경 신규 항목" style={{ width: 250 }}>
          <div className="lp-h">하도급 공종 (당초와 같음)</div>
          {sub.pick.map((p) => <div key={p} className="it">{findLine(startMain, p)?.name ?? p}</div>)}
          <div className="lp-h" style={{ marginTop: 8 }}>설계변경 신규 항목 넣기</div>
          {added.length === 0 && <div className="hint" style={{ padding: 10 }}>원도급 설계변경에 신규 항목이 없습니다.</div>}
          {added.map((a) => (
            <label key={a.id} className="it">
              <input type="checkbox" disabled={locked} checked={(sub.pickNew ?? []).includes(a.id)} onChange={(ev) => {
                const n = new Set(sub.pickNew ?? []);
                ev.target.checked ? n.add(a.id) : n.delete(a.id);
                update({ pickNew: [...n] });
              }} />
              {a.name} <span className="st" style={{ marginLeft: 'auto' }}>{won(unitTotal(a))}</span>
            </label>
          ))}
          <div className="hint" style={{ padding: 10 }}>수량은 원도급 설계변경에서 고칩니다. 하도급 단가는 당초와 같은 하도급율로 다시 계산되고, 끝수는 이윤에서 정산합니다.</div>
          <Link className="btn" style={{ margin: '0 10px' }} to="/change">원도급 설계변경 열기</Link>
        </nav>
      }
      right={
        <aside className="rp" aria-label="하도급 증감" style={{ width: 280 }}>
          <h2>하도급 증감</h2>
          <table className="f" style={{ width: '100%' }}>
            <thead><tr><th /><th>당초</th><th>변경</th></tr></thead>
            <tbody>
              <tr><td>하도급대상</td><td className="n">{won(r0.target.total)}</td><td className="n">{won(r1.target.total)}</td></tr>
              <tr><td>공급가액</td><td className="n">{won(r0.sub.supply)}</td><td className="n">{won(r1.sub.supply)}</td></tr>
              <tr className="red"><td>하도급액</td><td className="n">{won(r0.sub.total)}</td><td className="n">{won(r1.sub.total)}</td></tr>
            </tbody>
          </table>
          <div className="calc">
            <div className="r"><span>하도급액 증감</span><b>{d > 0 ? '+' : ''}{won(d, { tri: false, zero: '0' })}</b></div>
            <div className="r"><span>변경 하도급율 (대상 대비)</span><span>{pct(r1.sub.total, r1.target.total, 4)}</span></div>
            <div className="r"><span>이윤 정산 (변경)</span><span>{r1.sub.get('adj') >= 0 ? '+' : ''}{won(r1.sub.get('adj'), { tri: false, zero: '0' })}</span></div>
          </div>
          {!s.changeConfirmed && <div className="note">원도급 설계변경이 아직 확정되지 않았습니다. 수량이 바뀌면 하도급 변경도 같이 바뀝니다.</div>}
        </aside>
      }
      footer={<><span>당초 {won(r0.sub.total)}</span><span>변경 {won(r1.sub.total)}</span><span>증감 {d > 0 ? '+' : ''}{won(d, { tri: false, zero: '0' })}</span></>}
      mainClass="main pad"
    >
      <h1 style={{ margin: 0, textAlign: 'center', fontSize: 18, letterSpacing: '.3em' }}>하도급 변경 계약내역서</h1>
      <div style={{ textAlign: 'right', fontSize: 12 }}>{legend(fmt)}</div>
      <table className="f" style={{ width: '100%' }}>
        <thead>
          <tr><th rowSpan={2}>공종</th><th rowSpan={2}>품    명</th><th rowSpan={2}>규   격</th><th rowSpan={2}>수 량</th><th rowSpan={2}>단위</th><th colSpan={2}>합    계</th><th colSpan={2}>노무비</th><th colSpan={2}>재료비</th><th colSpan={2}>경    비</th><th rowSpan={2}>비    고</th></tr>
          <tr>{[0, 1, 2, 3].map((k) => <Fragment key={k}><th>단  가</th><th>금   액</th></Fragment>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => r.kind === 'blank' ? null : (
            <Pair key={r.key} r={r} fmt={fmt} render={(c) => c.map((v, k) => <td key={k} className={k >= 3 && k <= 12 && k !== 4 ? 'n' : k === 0 || k === 4 ? 'c' : k === 1 ? 'nm' : k === 2 ? 'sp' : ''}>{fmtCell(v)}</td>)} />
          ))}
        </tbody>
      </table>
      <h1 style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 18, letterSpacing: '.3em' }}>하도급 변경 원가계산서</h1>
      <table className="f" style={{ width: '100%', maxWidth: 1000 }}>
        <thead><tr><th>구분</th><th>비            목</th><th>금    액</th><th>요율</th><th>산   출   근   거</th></tr></thead>
        <tbody>
          {won2.map((r) => <Pair key={r.key} r={r} fmt={fmt} render={(c) => c.map((v, k) => <td key={k} className={k === 2 ? 'n' : k === 0 || k === 3 ? 'c' : ''}>{fmtCell(v)}</td>)} />)}
        </tbody>
      </table>
    </Shell>
  );
}
