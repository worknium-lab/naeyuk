import { useMemo, useState } from 'react';
import { Shell, FB, Group } from '../ui/Shell';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { flatten, won, qtyFmt, lineAmount, unitTotal, findLine, newId, NEW_GROUP_ID, type Line } from '../engine';

export default function Change() {
  const { s, set, start, toast } = useStore();
  const docs = useDocs();
  const before = docs.get('start');
  const after = docs.get('change');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [onlyChanged, setOnlyChanged] = useState(false);
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
      </>}
      info={<>
        <span><span className="k">기준</span> 착공내역서 (당초)</span>
        <span><span className="k">신규 단가</span> 설계 단가 × 낙찰률 {(s.bidRate * 100).toFixed(3)}%</span>
        {locked && <span className="cf">확정됨 — 수량을 고칠 수 없습니다</span>}
        <div style={{ flex: 1 }} />
        <span className="k">변경 수량은 노란 칸에 넣습니다 · 바뀐 줄은 파란 바탕</span>
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
          <div className="hint">확정하면 차수·기성의 기준 수량이 변경 수량으로 바뀝니다 (다음 단계). 준공내역서는 확정된 설계변경을 기준으로 만듭니다.</div>
        </aside>
      }
      footer={<><span>당초 {won(before.cost.total)}</span><span>변경 {won(after.cost.total)}</span><span>증감 {D(before.cost.total, after.cost.total) || '0'}</span></>}
    >
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
    </Shell>
  );
}
