import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Shell, FB, Group } from '../ui/Shell';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { flatten, won, qtyFmt, lineAmount, unitTotal, findLine, newId, NEW_GROUP_ID, type Line } from '../engine';
import { naeRows, wonRows, jeungRows, chongCells, colorOf, legend, changeWorkbook, type PairRow, type ChangeFmt } from '../changeForms';
import { exportXlsx, type Cell } from '../xlsx';

type View = 'nae' | 'chong' | 'won' | 'jeung' | 'edit';
const VIEWS: [View, string][] = [['nae', '계약내역서'], ['chong', '내역서총괄표'], ['won', '계약원가계산서'], ['jeung', '공사비 증감대비'], ['edit', '증감 상세']];

const fmtCell = (c: Cell): string => (typeof c === 'number' ? (c < 0 ? '△' + Math.abs(c).toLocaleString('ko-KR') : c.toLocaleString('ko-KR', { maximumFractionDigits: 4 })) : (c ?? '') as string);

/** 당초/변경 두 줄 — 위아래 순서와 색은 설정대로 */
function Pair({ r, fmt, render }: { r: PairRow; fmt: ChangeFmt; render: (which: 'before' | 'after', cells: Cell[]) => ReactNode }) {
  const order: ('before' | 'after')[] = fmt.top === 'before' ? ['before', 'after'] : ['after', 'before'];
  return (
    <>
      {order.map((w, i) => (
        <tr key={w} className={(colorOf(fmt, w) === 'red' ? 'redline ' : '') + (i === 0 ? 'ptop ' : 'pbot ') + (r.kind === 'grp' || r.kind === 'total' ? 'g ' : '') + (r.kind === 'ns' ? 'nsrow ' : '') + (r.changed ? 'chg' : '')}>
          {render(w, r[w])}
        </tr>
      ))}
    </>
  );
}

export default function Change() {
  const { s, set, start, toast } = useStore();
  const docs = useDocs();
  const before = docs.get('start');
  const after = docs.get('change');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [view, setView] = useState<View>('nae');
  const fmt = s.changeFmt;
  const setFmt = (p: Partial<ChangeFmt>) => set((st) => ({ ...st, changeFmt: { ...st.changeFmt, ...p } }));
  const co = s.change;
  const locked = s.changeConfirmed;
  const startMain = start.sections[0].lines;
  const rows = useMemo(() => flatten(after.sheet.sections[0].lines), [after.sheet]);
  const changedIds = new Set([...Object.keys(co.qty).filter((k) => findLine(startMain, k)?.qty !== co.qty[k]), ...co.added.map((a) => a.id)]);
  const vis = rows.filter((r) => !r.ancestors.some((a) => collapsed.has(a)))
    .filter((r) => !onlyChanged || r.line.children || changedIds.has(r.line.id));

  const setQty = (id: string, v: number) => set((st) => ({ ...st, change: { ...st.change, qty: { ...st.change.qty, [id]: v } } }));
  const setAdded = (id: string, patch: Partial<Line>) => set((st) => ({ ...st, change: { ...st.change, added: st.change.added.map((a) => (a.id === id ? { ...a, ...patch } : a)) } }));
  const addItem = () => {
    if (locked) { toast('확정된 설계변경입니다 — 확정을 풀고 고치세요'); return; }
    set((st) => ({ ...st, change: { ...st.change, added: [...st.change.added, { id: newId('chg'), level: 0, mark: '', name: '신규 항목', spec: '', unit: '식', qty: 1, lu: 0, mu: 0, eu: 0 }] } }));
  };
  const amt = (l: Line) => lineAmount(l).t;
  const D = (a: number, b: number) => { const d = b - a; return d ? (d > 0 ? '+' : '') + won(d, { tri: false }) : ''; };

  return (
    <Shell
      doc={`설계변경 내역서 ${co.name}`}
      toolbar={<>
        <Group label="변경">
          <FB icon="new" label="신규 항목" onClick={addItem} />
          <FB icon="undo" label="되돌리기" title="변경 수량을 당초로" onClick={() => { if (!locked) { set((st) => ({ ...st, change: { ...st.change, qty: {}, added: [] } })); toast('당초 수량으로 되돌렸습니다'); } }} />
          <FB icon="filter" label="변경분만" on={onlyChanged} onClick={() => setOnlyChanged(!onlyChanged)} />
        </Group>
        <Group label="확정">
          <FB icon="confirm" label={locked ? '확정 풀기' : '확정'} primary={!locked} onClick={() => { set((st) => ({ ...st, changeConfirmed: !st.changeConfirmed })); toast(locked ? '확정을 풀었습니다' : `${co.name}을(를) 확정했습니다 — 준공 조건이 하나 충족됩니다`); }} />
          <FB icon="net" label="원가계산서" to="/cost?doc=change" />
        </Group>
        <Group label="출력">
          <FB icon="excel" label="엑셀" title="계약내역서·총괄표·원가계산서·증감대비 (빨강/검정 그대로)" onClick={() => exportXlsx(`설계변경 ${co.name} — ${s.info.name}.xlsx`, changeWorkbook(before, after, fmt, `${s.info.name} ${co.name}`)).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다'))} />
        </Group>
      </>}
      info={<>
        <div className="vg" role="group" aria-label="양식">
          {VIEWS.map(([v, lab]) => <button key={v} type="button" className={'vb' + (view === v ? ' on' : '')} onClick={() => setView(v)}>{lab}</button>)}
        </div>
        <span className="k">윗줄</span>
        <div className="vg" role="group" aria-label="윗줄">
          <button type="button" className={'vb' + (fmt.top === 'before' ? ' on' : '')} onClick={() => setFmt({ top: 'before' })}>당초</button>
          <button type="button" className={'vb' + (fmt.top === 'after' ? ' on' : '')} onClick={() => setFmt({ top: 'after' })}>변경</button>
        </div>
        <span className="k">윗줄 색</span>
        <div className="vg" role="group" aria-label="윗줄 색">
          <button type="button" className={'vb' + (fmt.topColor === 'red' ? ' on' : '')} style={{ color: fmt.topColor === 'red' ? '#fff' : '#C00000' }} onClick={() => setFmt({ topColor: 'red' })}>빨강</button>
          <button type="button" className={'vb' + (fmt.topColor === 'black' ? ' on' : '')} onClick={() => setFmt({ topColor: 'black' })}>검정</button>
        </div>
        <b style={{ fontSize: 12.5 }}><span style={{ color: colorOf(fmt, 'before') === 'red' ? '#C00000' : '#000' }}>당초</span> / <span style={{ color: colorOf(fmt, 'after') === 'red' ? '#C00000' : '#000' }}>변경</span></b>
        {locked && <span className="cf">확정됨 — 수량을 고칠 수 없습니다</span>}
        <div style={{ flex: 1 }} />
        <span className="k">변경 줄의 노란 칸에 변경 수량 · 신규 단가 = 설계 × {(s.bidRate * 100).toFixed(3)}%</span>
      </>}
      right={
        <aside className="rp" aria-label="증감 요약" style={{ width: 280 }}>
          <h2>{co.name} 증감</h2>
          <table className="f" style={{ width: '100%' }}>
            <thead><tr><th /><th>당초</th><th>변경</th></tr></thead>
            <tbody>
              {([['순공사원가', 'D'], ['공급가액', 'H'], ['도급액', 'J']] as const).map(([lab, k]) => (
                <tr key={k} className={k === 'J' ? 'red' : ''}><td>{lab}</td><td className="n">{won(before.cost.get(k))}</td><td className="n">{won(after.cost.get(k))}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="calc"><div className="r"><span>도급액 증감</span><b>{D(before.cost.total, after.cost.total) || '0'}</b></div>
            <div className="r"><span>바뀐 항목</span><span>{changedIds.size}개</span></div></div>
          <div className="hint">확정하면 차수·기성의 기준 수량이 변경 수량으로 바뀝니다 (신규 항목은 차수에서 미배정으로 나옵니다). 준공내역서는 확정된 설계변경을 기준으로 만듭니다.</div>
        </aside>
      }
      footer={<><span>당초 {won(before.cost.total)}</span><span>변경 {won(after.cost.total)}</span><span>증감 {D(before.cost.total, after.cost.total) || '0'}</span></>}
    >
      {view === 'edit' ? (
      <div style={{ padding: 10 }}>
          <table className="f" style={{ width: '100%' }}>
            <thead>
              <tr><th rowSpan={2}>품 명</th><th rowSpan={2}>규 격</th><th rowSpan={2}>단위</th><th rowSpan={2}>단가</th><th colSpan={2}>당 초</th><th colSpan={2}>변 경</th><th colSpan={2}>증 감</th></tr>
              <tr><th>수량</th><th>금액</th><th>수량</th><th>금액</th><th>수량</th><th>금액</th></tr>
            </thead>
            <tbody>
              {vis.map((r) => {
                const l = r.line;
                const g = !!l.children;
                const orig = findLine(startMain, l.id);
                const isNew = co.added.some((a) => a.id === l.id);
                const a0 = orig ? amt(orig) : 0;
                const a1 = r.amount.t;
                const open = !collapsed.has(l.id);
                const raw = isNew ? co.added.find((a) => a.id === l.id)! : undefined;
                return (
                  <tr key={l.id} className={(g ? 'g ' : '') + (changedIds.has(l.id) ? 'sub' : '')}>
                    <td className="nm" style={{ paddingLeft: 6 + r.depth * 14 }}>
                      {g && <button type="button" className="tg" onClick={() => { const c = new Set(collapsed); open ? c.add(l.id) : c.delete(l.id); setCollapsed(c); }}>{open ? '▾' : '▸'}</button>}
                      {raw && !locked ? <input className="q" style={{ width: 180, textAlign: 'left' }} value={raw.name} onChange={(e) => setAdded(l.id, { name: e.target.value })} /> : <>{l.mark} {l.name}</>}
                    </td>
                    <td className="sp">{raw && !locked ? <input className="q" style={{ width: 100, textAlign: 'left' }} value={raw.spec} onChange={(e) => setAdded(l.id, { spec: e.target.value })} /> : l.spec}</td>
                    <td className="c">{raw && !locked ? <input className="q" style={{ width: 40, textAlign: 'center' }} value={raw.unit} onChange={(e) => setAdded(l.id, { unit: e.target.value })} /> : l.unit}</td>
                    <td className="n">{g ? '' : raw && !locked
                      ? <span title="설계 단가 (노무·재료·경비) — 낙찰률이 곱해집니다">{(['lu', 'mu', 'eu'] as const).map((f) => <input key={f} className="q" style={{ width: 62 }} value={raw[f]} onChange={(e) => setAdded(l.id, { [f]: Number(e.target.value) || 0 })} />)}</span>
                      : won(unitTotal(l))}</td>
                    <td className="n">{g || !orig ? '' : qtyFmt(orig.qty)}</td><td className="n">{l.id === NEW_GROUP_ID ? '' : won(a0)}</td>
                    <td className="n">{g ? '' : locked ? qtyFmt(l.qty) : <input className="q" value={l.qty} onChange={(e) => (raw ? setAdded(l.id, { qty: Number(e.target.value) || 0 }) : setQty(l.id, Number(e.target.value) || 0))} />}</td>
                    <td className="n">{won(a1)}</td>
                    <td className="n">{g ? '' : qtyFmt(+(l.qty - (orig?.qty ?? 0)).toFixed(4))}</td>
                    <td className="n" style={{ color: a1 - a0 < 0 ? '#C00000' : undefined }}>{D(a0, a1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 10 }}>
          <h1 style={{ margin: '0 0 4px', textAlign: 'center', fontSize: 18, letterSpacing: '.3em' }}>{VIEWS.find((x) => x[0] === view)![1]}</h1>
          <div style={{ textAlign: 'right', fontSize: 12, marginBottom: 4 }}>{legend(fmt)}</div>
          {view === 'nae' && (
            <table className="f" style={{ width: '100%' }}>
              <thead>
                <tr><th rowSpan={2}>공종</th><th rowSpan={2}>품    명</th><th rowSpan={2}>규   격</th><th rowSpan={2}>수 량</th><th rowSpan={2}>단위</th><th colSpan={2}>합    계</th><th colSpan={2}>노무비</th><th colSpan={2}>재료비</th><th colSpan={2}>경    비</th><th rowSpan={2}>비    고</th></tr>
                <tr>{[0, 1, 2, 3].map((k) => <Fragment key={k}><th>단  가</th><th>금   액</th></Fragment>)}</tr>
              </thead>
              <tbody>
                {naeRows(before.sheet, after.sheet).filter((r) => !onlyChanged || r.changed || r.kind !== 'item').map((r) => r.kind === 'blank' ? <tr key={r.key}><td colSpan={14} /></tr> : (
                  <Pair key={r.key} r={r} fmt={fmt} render={(w, c) => c.map((v, k) => {
                    if (k === 3 && w === 'after' && r.edit && !locked) {
                      const raw = r.edit.isNew ? co.added.find((a) => a.id === r.edit!.id) : undefined;
                      return <td key={k} className="n"><input className="q" value={r.edit.qty} aria-label="변경 수량" onChange={(e) => (raw ? setAdded(r.edit!.id, { qty: Number(e.target.value) || 0 }) : setQty(r.edit!.id, Number(e.target.value) || 0))} /></td>;
                    }
                    return <td key={k} className={k >= 3 && k <= 12 && k !== 4 ? 'n' : k === 0 || k === 4 ? 'c' : k === 1 ? 'nm' : k === 2 ? 'sp' : ''}>{fmtCell(v)}</td>;
                  })} />
                ))}
              </tbody>
            </table>
          )}
          {view === 'chong' && (
            <table className="f" style={{ width: '100%' }}>
              <thead><tr><th>공종</th><th>품    명</th><th>규   격</th><th>수 량</th><th>단위</th><th>합    계</th><th>노무비</th><th>재료비</th><th>경    비</th><th>비    고</th></tr></thead>
              <tbody>
                {naeRows(before.sheet, after.sheet, { groupsOnly: true, maxDepth: 2 }).filter((r) => r.kind !== 'blank').map((r) => (
                  <Pair key={r.key} r={r} fmt={fmt} render={(_, c) => chongCells(c).map((v, k) => <td key={k} className={k >= 5 && k <= 8 ? 'n' : k === 0 ? 'c' : ''}>{fmtCell(v)}</td>)} />
                ))}
              </tbody>
            </table>
          )}
          {view === 'won' && (
            <table className="f" style={{ width: '100%', maxWidth: 1000 }}>
              <thead><tr><th>구분</th><th>비            목</th><th>금    액</th><th>요율</th><th>산   출   근   거</th></tr></thead>
              <tbody>
                {wonRows(before.cost, after.cost).map((r) => (
                  <Pair key={r.key} r={r} fmt={fmt} render={(_, c) => c.map((v, k) => <td key={k} className={k === 2 ? 'n' : k === 0 || k === 3 ? 'c' : ''}>{fmtCell(v)}</td>)} />
                ))}
              </tbody>
            </table>
          )}
          {view === 'jeung' && (
            <table className="f" style={{ width: '100%', maxWidth: 820 }}>
              <thead><tr><th>품    명</th><th>당    초</th><th>변    경</th><th>증 · 감</th></tr></thead>
              <tbody>
                {jeungRows(before.cost, after.cost).map((r) => (
                  <tr key={String(r[0])} className={['순공사원가', '총원가', '도급액', '총공사비', '순 공 사 비'].includes(String(r[0])) ? 'sum' : ''}>
                    <td>{String(r[0] ?? "")}</td><td className="n">{fmtCell(r[1])}</td><td className="n">{fmtCell(r[2])}</td>
                    <td className="n" style={{ color: (r[3] as number) < 0 ? '#C00000' : undefined }}>{r[3] ? fmtCell(r[3]) : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Shell>
  );
}
