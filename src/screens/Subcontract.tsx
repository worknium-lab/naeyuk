import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { canPrint } from '../ui/Ask';
import { exportXlsx } from '../xlsx';
import { sheetRows, costRows, compareRows } from '../exports';
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
  const [pending, setPending] = useState<Set<string>>(new Set(sub?.pick ?? []));
  useEffect(() => { setPending(new Set(sub?.pick ?? [])); }, [sub?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const main = start.sections.find((x) => x.section === 'main')!.lines;
  const tree = useMemo(() => flatten(main), [main]);
  const takenBy = (lid: string) => s.subs.find((x) => x.id !== sub?.id && x.pick.includes(lid));
  const dirty = sub && (pending.size !== sub.pick.length || sub.pick.some((p) => !pending.has(p)));

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
          <FB icon="check" label="공종선택" onClick={() => document.getElementById('pick')?.scrollIntoView()} />
          <FB icon="rebuild" label="다시 만들기" primary title="선택 공종으로 하도급내역서 다시 만들기" onClick={() => {
            const names = [...pending].map((p) => findLine(main, p)?.name).filter(Boolean);
            update({ pick: [...pending], trade: names.length ? names.join(' · ') : '공종 선택 전' });
            toast('선택한 공종으로 하도급내역서를 다시 만들었습니다');
          }} />
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
        </Group>
        <Group label="출력">
          <FB icon="print" label="인쇄" onClick={() => (canPrint() ? window.print() : toast('이 화면에서는 인쇄 창이 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 인쇄됩니다'))} />
          <FB icon="excel" label="엑셀" onClick={() => exportXlsx(`하도급내역서 — ${sub.vendor}.xlsx`, [
            sheetRows(`하도급내역서 — ${sub.vendor} · ${sub.trade}`, { sections: [{ section: 'main', lines: r.subLines }] }),
            { ...costRows('하도급 원가계산서', sb, [{ label: '하도급대상', cost: tgt }, { label: '하도급', cost: sb }]), name: '원가계산서' },
          ]).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 됩니다'))} />
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
        <nav className="lp" id="pick" aria-label="하도급 공종 선택" style={{ width: 260 }}>
          <div className="lp-h">하도급 공종 선택 (착공내역서)</div>
          {tree.map((fr) => {
            const l = fr.line;
            const other = takenBy(l.id);
            const parentPicked = fr.ancestors.some((a) => pending.has(a));
            const checked = pending.has(l.id) || parentPicked;
            if (fr.depth > 1) return null;
            return (
              <label key={l.id} className={'it' + (pending.has(l.id) ? ' on' : '')} style={{ paddingLeft: 10 + fr.depth * 16, color: other ? '#9AA1AB' : undefined }}>
                <input type="checkbox" disabled={!!other || fr.depth === 0} checked={checked}
                  onChange={(e) => { const n = new Set(pending); e.target.checked ? n.add(l.id) : n.delete(l.id); setPending(n); }} />
                {l.mark} {l.name}
                <span className="st" style={{ marginLeft: 'auto' }}>{other ? other.vendor : fr.depth === 1 ? won(fr.amount.t) : ''}</span>
              </label>
            );
          })}
          <div className="hint" style={{ padding: 10 }}>회색 공종은 다른 업체에 이미 하도급된 공종입니다. 공종을 바꾼 뒤 <b>다시 만들기</b>를 누르세요.</div>
          {dirty && <div className="note" style={{ margin: '0 10px' }}>선택이 바뀌었습니다 — 아직 내역서에 반영되지 않았습니다.</div>}
          <button type="button" className="btn pri" style={{ margin: 10 }} onClick={() => {
            const names = [...pending].map((p) => findLine(main, p)?.name).filter(Boolean);
            update({ pick: [...pending], trade: names.length ? names.join(' · ') : '공종 선택 전' });
            toast('선택한 공종으로 하도급내역서를 다시 만들었습니다');
          }}>선택 공종으로 다시 만들기</button>
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
      <h2>하도급 내역서 · 단가 = 착공 단가 × {(sub.rate * 100).toFixed(3)}% (원 미만 버림)</h2>
      {subRows.length === 0 ? <div className="note">왼쪽에서 하도급 공종을 고르고 <b>다시 만들기</b>를 누르세요.</div> : (
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
    </Shell>
  );
}
