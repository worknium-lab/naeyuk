import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { canPrint } from '../ui/Ask';
import { exportXlsx } from '../xlsx';
import { costRows, compareRows, subBook } from '../exports';
import { useStore, type Subcontract as Sub } from '../store';
import { useDocs } from '../docs';
import { useAsk } from '../ui/Ask';
import { flatten, won, qtyFmt, lineAmount, unitTotal, pct, findLine, SUB_DEFAULT_EXCLUDE, roundTo, type CostKey, type RoundMode } from '../engine';

export default function Subcontract() {
  const { s, set, start, toast } = useStore();
  const docs = useDocs();
  const ask = useAsk();
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ?? s.subs[0]?.id;
  const entry = docs.subs.find((x) => x.sub.id === id) ?? docs.subs[0];
  const sub = entry?.sub;
  const main = start.sections.find((x) => x.section === 'main')!.lines;
  const tree = useMemo(() => flatten(main), [main]);
  /** 공종 id는 그 아래 항목 전부로 풀어서, 항목(행) 단위로 고른다 */
  const expand = (ids: string[]) => {
    const out = new Set<string>();
    for (const r of tree) if (!r.line.children && (ids.includes(r.line.id) || r.ancestors.some((a) => ids.includes(a)))) out.add(r.line.id);
    return out;
  };
  const [pending, setPending] = useState<Set<string>>(() => expand(sub?.pick ?? []));
  const [view, setView] = useState<'pick' | 'doc'>(sub?.pick.length ? 'doc' : 'pick');
  const [hideOthers, setHideOthers] = useState(false);
  useEffect(() => { setPending(expand(sub?.pick ?? [])); setView(sub?.pick.length ? 'doc' : 'pick'); }, [sub?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const owner = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of s.subs) if (x.id !== sub?.id) for (const i of expand(x.pick)) m.set(i, x.vendor);
    return m;
  }, [s.subs, sub?.id, tree]); // eslint-disable-line react-hooks/exhaustive-deps
  const committed = expand(sub?.pick ?? []);
  const dirty = pending.size !== committed.size || [...pending].some((p) => !committed.has(p));
  const leavesOf = (id: string) => tree.filter((r) => !r.line.children && (r.line.id === id || r.ancestors.includes(id))).map((r) => r.line.id);
  const toggleRow = (id: string, on: boolean) => setPending((cur) => {
    const n = new Set(cur);
    for (const i of leavesOf(id)) if (!owner.has(i)) { if (on) n.add(i); else n.delete(i); }
    return n;
  });
  const pickedAmt = tree.filter((r) => pending.has(r.line.id)).reduce((a, r) => a + r.amount.t, 0);
  const pickedGroups = [...new Set(tree.filter((r) => pending.has(r.line.id)).map((r) => (r.ancestors[1] ? findLine(main, r.ancestors[1])?.name : r.line.name) ?? ''))].filter(Boolean);
  const commit = () => {
    update({ pick: [...pending], trade: pickedGroups.length ? (pickedGroups.length > 2 ? `${pickedGroups.slice(0, 2).join(' · ')} 외 ${pickedGroups.length - 2}` : pickedGroups.join(' · ')) : '공종 선택 전' });
    setView('doc');
    toast(`선택한 ${pending.size}행으로 하도급내역서를 만들었습니다`);
  };

  const update = (patch: Partial<Sub>) => sub && set((st) => ({ ...st, subs: st.subs.map((x) => (x.id === sub.id ? { ...x, ...patch } : x)) }));
  const toggleEx = (k: CostKey) => {
    if (!sub) return;
    const ex = new Set(sub.exclude);
    ex.has(k) ? ex.delete(k) : ex.add(k);
    update({ exclude: [...ex] });
  };
  const addSub = () => {
    const nid = 's' + Date.now().toString(36);
    set((st) => ({ ...st, subs: [...st.subs, { id: nid, vendor: '새 업체', trade: '공종 선택 전', pick: [], rate: 0.82, exclude: [...SUB_DEFAULT_EXCLUDE], round: 'floor1000', confirmed: false }] }));
    setParams({ id: nid });
  };

  if (!sub || !entry) {
    return <Shell doc="하도급내역서" tabs="sub"><div style={{ padding: 20 }}><button className="btn pri" onClick={addSub}>하도급 추가</button></div></Shell>;
  }
  const r = entry.result;
  const subRows = r.subLines.flatMap((l) => flatten([l]));
  const subTotal = r.subLines.reduce((a, l) => a + lineAmount(l).t, 0);
  const tgt = r.target;
  const sb = r.sub;
  const raw = Math.floor(tgt.supply * sub.rate);

  return (
    <Shell
      doc={`하도급내역서 — ${sub.vendor} · ${sub.trade}`}
      tabs="sub"
      toolbar={<>
        <Group label="하도급 만들기">
          <FB icon="check" label="행 선택" on={view === 'pick'} title="착공내역서 전체에서 하도급할 행 고르기" onClick={() => setView('pick')} />
          <FB icon="rebuild" label="만들기" primary title="선택한 행으로 하도급내역서 만들기" onClick={commit} />
          <FB icon="doc" label="하도급내역서" on={view === 'doc'} onClick={() => setView('doc')} />
          <FB icon="pct" label="하도급율" onClick={async () => {
            const v = await ask({ title: '하도급율', label: '하도급율(%)', value: String(+(sub.rate * 100).toFixed(3)) });
            if (v && +v > 0) update({ rate: +v / 100 });
          }} />
        </Group>
        <Group label="원가계산">
          <FB icon="form" label="원가계산서" onClick={() => document.getElementById('subcost')?.scrollIntoView()} />
          <FB icon="adj" label="단수조정" onClick={() => toast(`이윤에서 ${won(sb.get('adj'), { tri: false })}원을 정산했습니다`)} />
          <FB icon="recalc" label="재계산" onClick={() => toast('하도급 원가를 다시 계산했습니다')} />
        </Group>
        <Group label="업체">
          <FB icon="vendor" label="업체" onClick={async () => { const v = await ask({ title: '하도급 업체', label: '업체명', value: sub.vendor }); if (v) update({ vendor: v }); }} />
          <FB icon="new" label="하도급 추가" onClick={addSub} />
          <FB icon="compare" label="대비내역서" to={`/sub/compare?id=${sub.id}`} />
          <FB icon="swap" label="설계변경" title="원도급 설계변경 기준 하도급 변경" to={`/sub/change?id=${sub.id}`} />
        </Group>
        <Group label="출력">
          <FB icon="print" label="인쇄" onClick={() => (canPrint() ? window.print() : toast('이 화면에서는 인쇄 창이 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 인쇄됩니다'))} />
          <FB icon="excel" label="엑셀" onClick={() => exportXlsx(`하도급내역서 — ${sub.vendor}.xlsx`, subBook({ vendor: sub.vendor, trade: sub.trade, rate: sub.rate, round: sub.round, r }).sheets).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 됩니다'))} />
        </Group>
      </>}
      info={<>
        <label><span className="k">문서</span>
          <select value={sub.id} onChange={(e) => setParams({ id: e.target.value })}>
            {s.subs.map((x) => <option key={x.id} value={x.id}>하도급 — {x.vendor} · {x.trade}</option>)}
          </select>
        </label>
        <span><span className="k">기준</span> 착공내역서</span>
        <label><span className="k">하도급율</span>
          <input type="number" step="0.1" value={+(sub.rate * 100).toFixed(3)} onChange={(e) => update({ rate: (+e.target.value || 0) / 100 })} style={{ width: 80, textAlign: 'right', padding: '0 6px' }} /> %
        </label>
        <span className="k">단가 끝수 원 미만 버림</span>
        <div style={{ flex: 1 }} />
        <ol className="steps" aria-label="만드는 순서">
          <li><b>1</b>공종 선택</li><li><b>2</b>단가 × 하도급율</li><li><b>3</b>원가 항목 체크</li><li><b>4</b>이윤에서 단수조정</li>
        </ol>
      </>}
      left={
        <nav className="lp" aria-label="선택 요약" style={{ width: 240 }}>
          <div className="lp-h">선택한 행</div>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="calc">
              <div className="r"><span>행</span><b>{pending.size}개</b></div>
              <div className="r"><span>착공 금액</span><b>{won(pickedAmt, { zero: '0' })}</b></div>
            </div>
            {pickedGroups.length > 0 && <div className="hint">{pickedGroups.join(' · ')}</div>}
            {dirty && <div className="note">선택이 바뀌었습니다 — <b>만들기</b>를 누르면 하도급내역서에 반영됩니다.</div>}
            <button type="button" className="btn pri" disabled={!pending.size} onClick={commit}>선택한 {pending.size}행으로 만들기</button>
            <button type="button" className="btn" onClick={() => setView(view === 'pick' ? 'doc' : 'pick')}>{view === 'pick' ? '하도급내역서 보기' : '착공내역서에서 행 고르기'}</button>
            <div className="hint">회색 행은 다른 업체에 이미 하도급된 행입니다. 공종 줄의 체크는 그 아래 행을 모두 고릅니다.</div>
          </div>
        </nav>
      }
      right={
        <aside className="rp" aria-label="하도급 정산" style={{ width: 290 }}>
          <h2>하도급 금액 정산</h2>
          <dl>
            <dt>업체</dt><dd>{sub.vendor}</dd>
            <dt>공종</dt><dd>{sub.trade}</dd>
            <dt>하도급율</dt><dd>{(sub.rate * 100).toFixed(3)}%</dd>
          </dl>
          <div className="calc">
            <div className="r"><span>하도급대상 공급가액</span><span>{won(tgt.supply)}</span></div>
            <div className="r"><span>× {(sub.rate * 100).toFixed(3)}%</span><span>{won(raw)}</span></div>
            <div className="r"><span>끝수 정리</span><b>{won(sb.supply)}</b></div>
            <div className="r"><span>계산 원가</span><span>{won(sb.supply - sb.get('adj'))}</span></div>
            <div className="r"><span>이윤에 정산</span><b>{sb.get('adj') >= 0 ? '+' : ''}{won(sb.get('adj'), { tri: false, zero: '0' })}</b></div>
            <div className="r"><span>부가세</span><span>{won(sb.get('vat'))}</span></div>
            <div className="r"><span>하도급 도급액</span><b>{won(sb.total)}</b></div>
          </div>
          <fieldset>
            <legend>공급가액 끝수</legend>
            {([['floor1000', '천원 미만 버림'], ['floor10000', '만원 미만 버림'], ['ceil1000', '천원 미만 올림 (82% 이상 유지)']] as [RoundMode, string][]).map(([m, lab]) => (
              <label key={m}><input type="radio" name="round" checked={sub.round === m} onChange={() => update({ round: m })} />{lab} ({won(roundTo(raw, m))})</label>
            ))}
          </fieldset>
          <div role="status" className="note" style={r.ratio < 0.82 ? undefined : { background: '#EEF7EE', borderColor: '#9BC79B' }}>
            하도급대상 대비 <b>{pct(sb.total, tgt.total, 4)}</b>. {r.ratio < 0.82 ? '82% 미만입니다 — 하도급 적정성 심사 기준을 확인하세요. 올림을 고르면 82%를 넘깁니다.' : '82% 이상입니다.'}
          </div>
          <div className="hint">보험료·퇴직공제·보증수수료는 원도급사가 부담하므로 기본으로 꺼져 있습니다. 하도급대상액도 같은 체크로 계산합니다.</div>
          <Link className="btn" to={`/sub/compare?id=${sub.id}`}>원·하도급 대비내역서 보기</Link>
          <button type="button" className={'btn' + (sub.confirmed ? '' : ' pri')} style={{ marginTop: 'auto' }} onClick={() => { update({ confirmed: !sub.confirmed }); toast(sub.confirmed ? '확정을 풀었습니다' : '하도급내역서를 확정했습니다'); }}>
            {sub.confirmed ? '확정 풀기' : '하도급내역서 확정'}
          </button>
        </aside>
      }
      footer={<><span>공종 {sub.pick.length}</span><span>하도급 도급액 {won(sb.total)}</span><span>{sub.confirmed ? '확정' : '작성 중'}</span></>}
      mainClass="main pad"
    >
      {view === 'pick' ? (<>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>착공내역서 전체 — 하도급할 행 고르기
          <label style={{ fontWeight: 400, fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={hideOthers} onChange={(e) => setHideOthers(e.target.checked)} />다른 업체 행 숨기기</label>
          <span style={{ flex: 1 }} />
          <button type="button" className="vb" onClick={() => setPending(new Set())}>선택 지우기</button>
        </h2>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th>선택</th><th>L</th><th>공종</th><th>품    명</th><th>규   격</th><th>수 량</th><th>단위</th><th>단 가</th><th>금   액</th><th>노무비</th><th>재료비</th><th>경 비</th><th>하도급</th></tr></thead>
          <tbody>
            {tree.filter((r) => !hideOthers || r.line.children || !owner.has(r.line.id)).map((r) => {
              const l = r.line;
              const g = !!l.children;
              const leaves = g ? leavesOf(l.id) : [l.id];
              const free = leaves.filter((x) => !owner.has(x));
              const on = free.length > 0 && free.every((x) => pending.has(x));
              const some = free.some((x) => pending.has(x));
              const other = !g ? owner.get(l.id) : undefined;
              return (
                <tr key={l.id} className={(g ? 'g ' : '') + (!g && pending.has(l.id) ? 'sel ' : '') + (other ? 'off ' : '') + 'click'} onClick={() => !other && free.length && toggleRow(l.id, !on)}>
                  <td className="c"><input type="checkbox" disabled={!free.length} checked={on} ref={(el) => { if (el) el.indeterminate = !on && some; }} onChange={(e) => toggleRow(l.id, e.target.checked)} onClick={(e) => e.stopPropagation()} aria-label={l.name} /></td>
                  <td className="c">{l.level || ''}</td><td className="c">{l.mark}</td>
                  <td className="nm" style={{ paddingLeft: 6 + r.depth * 12 }}>{l.name}</td><td className="sp">{l.spec}</td>
                  <td className="n">{g ? '' : qtyFmt(l.qty)}</td><td className="c">{l.unit}</td>
                  <td className="n">{g ? '' : won(unitTotal(l))}</td><td className="n">{won(r.amount.t)}</td>
                  <td className="n">{won(r.amount.l)}</td><td className="n">{won(r.amount.m)}</td><td className="n">{won(r.amount.e)}</td>
                  <td>{other ?? (g && some ? `${free.filter((x) => pending.has(x)).length}/${leaves.length}` : '')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>) : (<>
      <h2>하도급 내역서 · 단가 = 착공 단가 × {(sub.rate * 100).toFixed(3)}% (원 미만 버림)</h2>
      {subRows.length === 0 ? <div className="note">[행 선택]에서 착공내역서의 하도급할 행을 고르고 <b>만들기</b>를 누르세요.</div> : (
        <table className="f" style={{ width: '100%' }}>
          <thead>
            <tr><th rowSpan={2}>품 명</th><th rowSpan={2}>규 격</th><th rowSpan={2}>수 량</th><th rowSpan={2}>단위</th><th colSpan={2}>합    계</th><th colSpan={2}>노 무 비</th><th colSpan={2}>재 료 비</th><th colSpan={2}>경    비</th><th rowSpan={2}>착공 단가</th></tr>
            <tr>{[0, 1, 2, 3].map((k) => <Fragment key={k}><th>단가</th><th>금액</th></Fragment>)}</tr>
          </thead>
          <tbody>
            {subRows.map((fr) => {
              const l = fr.line;
              const g = !!l.children;
              const a = fr.amount;
              const orig = !g ? findLine(main, l.id) : undefined;
              return (
                <tr key={l.id} className={g ? 'g' : ''}>
                  <td className="nm" style={{ paddingLeft: 6 + fr.depth * 14 }}>{l.mark} {l.name}</td><td className="sp" title={l.spec}>{l.spec}</td>
                  <td className="n">{g ? '' : qtyFmt(l.qty)}</td><td className="c">{l.unit}</td>
                  <td className="n">{g ? '' : won(unitTotal(l))}</td><td className="n">{won(a.t)}</td>
                  <td className="n">{g ? '' : won(l.lu)}</td><td className="n">{won(a.l)}</td>
                  <td className="n">{g ? '' : won(l.mu)}</td><td className="n">{won(a.m)}</td>
                  <td className="n">{g ? '' : won(l.eu)}</td><td className="n">{won(a.e)}</td>
                  <td className="n">{orig ? won(unitTotal(orig)) : ''}</td>
                </tr>
              );
            })}
            <tr className="red"><td style={{ letterSpacing: '.4em' }}>순공사비</td><td /><td /><td /><td /><td className="n">{won(subTotal)}</td><td /><td className="n">{won(sb.get('dl'))}</td><td /><td className="n">{won(sb.get('A'))}</td><td /><td className="n">{won(sb.get('exp'))}</td><td /></tr>
          </tbody>
        </table>
      )}

      <h2 id="subcost" style={{ marginTop: 6 }}>하도급 원가계산서 · 체크한 항목만 하도급에 반영</h2>
      <table className="f" style={{ width: '100%' }}>
        <thead><tr><th>반영</th><th>구분</th><th>비    목</th><th>요율</th><th>산 출 근 거</th><th>하도급대상</th><th>하 도 급</th><th>비율</th></tr></thead>
        <tbody>
          {sb.rows.filter((x) => !['mat', 'scrap', 'perfGuar', 'supplied', 'L', 'waste'].includes(x.key)).map((row) => {
            const t = tgt.rows.find((x) => x.key === row.key)!;
            const ex = sub.exclude.includes(row.key);
            const can = row.optional || row.key === 'gen' || row.key === 'profit';
            const off = can && ex;
            return (
              <tr key={row.key} className={(row.total ? 'sum ' : '') + (row.key === 'J' ? 'red ' : '') + (off ? 'off' : '')}>
                <td className="c">{can ? <input type="checkbox" checked={!ex} aria-label={row.label} onChange={() => toggleEx(row.key)} /> : ''}</td>
                <td className="c">{row.no}</td>
                <td>{row.group && !row.total ? `${row.label}` : row.label}{off && <span className="cf"> · 원도급사 부담</span>}</td>
                <td className="c">{row.rate ?? ''}</td>
                <td>{row.basis ?? ''}</td>
                <td className="n">{t.amount === null ? '—' : won(t.amount, { zero: '0' })}</td>
                <td className="n">{row.amount === null ? '—' : won(row.amount, { zero: '0' })}</td>
                <td className="c">{t.amount && row.amount ? pct(row.amount, t.amount) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </>)}
    </Shell>
  );
}
