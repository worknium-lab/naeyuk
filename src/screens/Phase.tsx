import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { flatten, won, qtyFmt, unassigned, floor, lineAmount, type Line } from '../engine';

export default function Phase() {
  const { s, set, contract: start, toast } = useStore();
  const docs = useDocs();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string>('G13');
  const [ratio, setRatio] = useState<number[]>(() => s.phases.map((_, i) => (i === 0 ? 48 : 52)));
  const n = s.phases.length;

  const rows = useMemo(() => start.sections.filter((x) => x.section === 'main').flatMap((x) => flatten(x.lines)), [start]);
  const vis = rows.filter((r) => !r.ancestors.some((a) => collapsed.has(a)));
  const phaseAmt = (l: Line, i: number) => {
    const leaves = l.children ? flatten(l.children).map((r) => r.line).filter((x) => !x.children) : [l];
    return leaves.reduce((acc, x) => acc + lineAmount({ ...x, qty: s.alloc[x.id]?.[i] ?? 0 }).t, 0);
  };
  const unAmt = (l: Line) => {
    const leaves = l.children ? flatten(l.children).map((r) => r.line).filter((x) => !x.children) : [l];
    return leaves.reduce((acc, x) => acc + lineAmount({ ...x, qty: unassigned(x, s.alloc) }).t, 0);
  };
  const root = start.sections[0].lines[0];
  const leavesOf = (id: string) => {
    const r = rows.find((x) => x.line.id === id);
    if (!r) return [];
    return r.line.children ? flatten(r.line.children).map((x) => x.line).filter((x) => !x.children) : [r.line];
  };
  const setQty = (id: string, i: number, v: number) => set((st) => {
    const a = { ...st.alloc, [id]: [...(st.alloc[id] ?? Array(n).fill(0))] };
    a[id][i] = v;
    return { ...st, alloc: a };
  });
  const applyRatio = (ids: Line[]) => {
    const tot = ratio.reduce((a, b) => a + b, 0) || 1;
    set((st) => {
      const a = { ...st.alloc };
      for (const l of ids) {
        const parts = ratio.map((r) => floor((l.qty * r) / tot * 100) / 100);
        parts[n - 1] = +(l.qty - parts.slice(0, -1).reduce((x, y) => x + y, 0)).toFixed(2);
        a[l.id] = parts;
      }
      return { ...st, alloc: a };
    });
  };
  const wholeTo = (i: number) => set((st) => {
    const a = { ...st.alloc };
    for (const l of leavesOf(sel)) a[l.id] = Array.from({ length: n }, (_, k) => (k === i ? l.qty : 0));
    return { ...st, alloc: a };
  });
  const selLine = rows.find((r) => r.line.id === sel)?.line;
  const totalUn = unAmt(root);

  return (
    <Shell
      doc="차수별 내역서 (분개)"
      toolbar={<>
        <Group label="차수">
          <FB icon="new" label="차수 추가" onClick={() => {
            set((st) => ({ ...st, phases: [...st.phases, { name: `${st.phases.length + 1}차분`, year: String(2026 + st.phases.length), status: '분개 중' }], alloc: Object.fromEntries(Object.entries(st.alloc).map(([k, v]) => [k, [...v, 0]])) }));
            setRatio((r) => [...r, 0]);
          }} />
          <FB icon="del" label="차수 삭제" onClick={() => {
            if (n <= 1) return;
            set((st) => ({ ...st, phases: st.phases.slice(0, -1), alloc: Object.fromEntries(Object.entries(st.alloc).map(([k, v]) => [k, v.slice(0, -1)])) }));
            setRatio((r) => r.slice(0, -1));
          }} />
        </Group>
        <Group label="분개">
          <FB icon="pct" label="비율분개" onClick={() => { applyRatio(leavesOf(sel)); toast(`${selLine?.name ?? ''}을(를) 비율로 나눴습니다`); }} />
          <FB icon="folder" label="공종 통째" onClick={() => { wholeTo(0); toast(`${selLine?.name ?? ''}을(를) ${s.phases[0].name}에 통째로 넣었습니다`); }} />
          <FB icon="check" label="미배정 검사" onClick={() => {
            const miss = rows.filter((r) => !r.line.children && Math.abs(unassigned(r.line, s.alloc)) > 1e-6);
            if (!miss.length) toast('미배정 수량이 없습니다');
            else { setSel(miss[0].line.id); toast(`미배정 ${miss.length}항목 — 첫 항목을 골랐습니다`); }
          }} />
        </Group>
        <Group label="계산">
          <FB icon="recalc" label="재계산" primary onClick={() => toast('차수별 원가계산서를 다시 계산했습니다')} />
          <FB icon="net" label="원가계산서" to="/cost?doc=phase0" />
        </Group>
      </>}
      info={<>
        <span><span className="k">기준</span> {s.changeConfirmed ? `설계변경 ${s.change.name} (확정)` : '착공내역서'}</span>
        <div className="vg">
          <button type="button" className="vb" onClick={() => setCollapsed(new Set())}>모두 펼침</button>
          <button type="button" className="vb" onClick={() => setCollapsed(new Set(rows.filter((r) => r.line.children && r.depth >= 1).map((r) => r.line.id)))}>공종까지</button>
        </div>
        {!s.phaseOn && <span className="cf">프로젝트 홈에서 차수공사를 껐습니다 — 체계에는 나오지 않습니다</span>}
        <div style={{ flex: 1 }} />
        <span className="k">수량 칸을 고치면 바로 계산됩니다 · 마지막 차수가 끝수를 받습니다</span>
      </>}
      left={
        <nav className="lp" aria-label="차수 목록" style={{ width: 200 }}>
          <div className="lp-h">차수 목록</div>
          {s.phases.map((p, i) => (
            <Link key={p.name} to={`/cost?doc=phase${i}`}><span>{p.name} ({p.year})</span><span className="st">{won(docs.get(`phase${i}`).cost.get('D'))}</span></Link>
          ))}
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: totalUn ? '#C00000' : undefined }}><span>미배정</span><span className="st">{won(totalUn, { zero: '0' })}</span></a>
          <div className="hint" style={{ padding: 10 }}>차수별 금액은 순공사원가입니다. 이름을 누르면 그 차수의 원가계산서로 갑니다.</div>
        </nav>
      }
      right={
        <aside className="rp" aria-label="비율분개" style={{ width: 240 }}>
          <h2>비율분개 · {selLine?.name ?? '—'}</h2>
          {s.phases.map((p, i) => (
            <label key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{p.name}
              <input type="number" value={ratio[i] ?? 0} onChange={(e) => setRatio((r) => r.map((x, k) => (k === i ? +e.target.value : x)))} style={{ width: 70, height: 26, border: '1px solid #C9CED6', textAlign: 'right' }} /> %
            </label>
          ))}
          <button type="button" className="btn" onClick={() => applyRatio(leavesOf(sel))}>고른 공종에 적용</button>
          <button type="button" className="btn" onClick={() => { applyRatio(leavesOf(root.id)); toast('전체를 비율로 나눴습니다'); }}>전체에 적용</button>
          <fieldset>
            <legend>공종 통째로</legend>
            {s.phases.map((p, i) => <button key={p.name} type="button" className="btn" onClick={() => wholeTo(i)}>{p.name}에 모두</button>)}
          </fieldset>
          <div className="note">미배정이 0이어야 준공내역서를 만들 수 있습니다.</div>
        </aside>
      }
      footer={<>{s.phases.map((p, i) => <span key={p.name}>{p.name} {won(phaseAmt(root, i))}</span>)}<span>미배정 {won(totalUn, { zero: '0' })}</span></>}
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead>
            <tr><th rowSpan={2}>품 명</th><th rowSpan={2}>규 격</th><th rowSpan={2}>단위</th><th colSpan={2}>착 공</th>
              {s.phases.map((p) => <th key={p.name} colSpan={2}>{p.name} ({p.year})</th>)}<th colSpan={2}>미배정</th></tr>
            <tr><th>수량</th><th>금액</th>{s.phases.map((p) => <Fragment key={p.name}><th>수량</th><th>금액</th></Fragment>)}<th>수량</th><th>금액</th></tr>
          </thead>
          <tbody>
            {vis.map((r) => {
              const l = r.line;
              const grp = !!l.children;
              const open = !collapsed.has(l.id);
              const un = grp ? 0 : unassigned(l, s.alloc);
              return (
                <tr key={l.id} className={(grp ? 'g ' : '') + (sel === l.id ? 'sel ' : '') + 'click'} onClick={() => setSel(l.id)}>
                  <td className="nm" style={{ paddingLeft: 6 + r.depth * 14 }}>
                    {grp && <button type="button" className="tg" onClick={(e) => { e.stopPropagation(); const c = new Set(collapsed); open ? c.add(l.id) : c.delete(l.id); setCollapsed(c); }}>{open ? '▾' : '▸'}</button>}
                    {l.mark} {l.name}
                  </td>
                  <td className="sp" title={l.spec}>{l.spec}</td><td className="c">{l.unit}</td>
                  <td className="n">{grp ? '' : qtyFmt(l.qty)}</td><td className="n">{won(lineAmount(l).t)}</td>
                  {s.phases.map((p, i) => (
                    <Fragment key={p.name}>
                      <td className="n">{grp ? '' : <input className="q" value={s.alloc[l.id]?.[i] ?? 0} onClick={(e) => e.stopPropagation()} onChange={(e) => setQty(l.id, i, Number(e.target.value) || 0)} />}</td>
                      <td className="n">{won(phaseAmt(l, i))}</td>
                    </Fragment>
                  ))}
                  <td className="n" style={{ color: un ? '#C00000' : undefined }}>{grp ? '' : qtyFmt(un)}</td>
                  <td className="n" style={{ color: '#C00000' }}>{won(unAmt(l))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
