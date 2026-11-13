import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { canPrint } from '../ui/Ask';
import { exportXlsx } from '../xlsx';
import { costRows, compareRows, subBook } from '../exports';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { flatten, won, qtyFmt, unitTotal, pct, lineAmount, type Line } from '../engine';

export default function SubCompare() {
  const { s, start, toast } = useStore();
  const docs = useDocs();
  const [params, setParams] = useSearchParams();
  const id = params.get('id') ?? s.subs[0]?.id;
  const useChange = params.get('v') === 'change';
  const entry = docs.subs.find((x) => x.sub.id === id) ?? docs.subs[0];
  const [mode, setMode] = useState<'sum' | 'split'>('sum');
  const [onlySub, setOnlySub] = useState(false);
  const base = useChange ? docs.get('change').sheet : start;
  const main = base.sections.find((x) => x.section === 'main')!.lines;
  const rows = useMemo(() => flatten(main), [main]);
  if (!entry) return <Shell doc="원·하도급 대비내역서" tabs="sub"><div style={{ padding: 20 }}>하도급이 없습니다.</div></Shell>;
  const { sub } = entry;
  const r = useChange ? entry.change : entry.result;
  const tMap = new Map(flatten(r.targetLines).map((x) => [x.line.id, x]));
  const sMap = new Map(flatten(r.subLines).map((x) => [x.line.id, x]));
  const doDoc = docs.get(useChange ? 'change' : 'start');
  const totDo = lineAmount(main[0]).t;
  const totT = r.targetLines.reduce((a, l) => a + lineAmount(l).t, 0);
  const totS = r.subLines.reduce((a, l) => a + lineAmount(l).t, 0);
  const split = mode === 'split';
  const amtCells = (l: Line | undefined, a: ReturnType<typeof lineAmount> | undefined, withUnit: boolean) => {
    if (!split) return <>{withUnit && <td className="n">{l && !l.children ? won(unitTotal(l)) : ''}</td>}<td className="n">{a ? won(a.t) : ''}</td></>;
    return <><td className="n">{a ? won(a.t) : ''}</td><td className="n">{a ? won(a.l) : ''}</td><td className="n">{a ? won(a.m) : ''}</td><td className="n">{a ? won(a.e) : ''}</td></>;
  };
  const head = (label: string, withUnit: boolean, qty: boolean) => split ? 4 + (qty ? 1 : 0) : (withUnit ? 2 : 1) + (qty ? 1 : 0);

  return (
    <Shell
      doc={`원·하도급 대비내역서 — ${sub.vendor} · ${sub.trade}`}
      tabs="sub"
      toolbar={<>
        <Group label="보기">
          <FB icon="lines" label="합계만" on={!split} onClick={() => setMode('sum')} />
          <FB icon="cols3" label="재·노·경" on={split} onClick={() => setMode('split')} />
          <FB icon="filter" label="하도급만" on={onlySub} onClick={() => setOnlySub(!onlySub)} />
        </Group>
        <Group label="문서">
          <FB icon="doc" label="하도급내역서" to={`/sub?id=${sub.id}`} />
          <FB icon="recalc" label="재계산" onClick={() => toast('대비내역서를 다시 계산했습니다')} />
        </Group>
        <Group label="출력">
          <FB icon="print" label="인쇄" title="표지·갑지·대비원가·대비내역 묶어 인쇄" onClick={() => (canPrint() ? window.print() : toast('이 화면에서는 인쇄 창이 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 인쇄됩니다'))} />
          <FB icon="excel" label="엑셀" onClick={() => exportXlsx(`원·하도급 대비내역서 — ${sub.vendor}.xlsx`, (() => {
            const b = subBook({ vendor: sub.vendor, trade: sub.trade, rate: sub.rate, round: sub.round, r });
            return [
              compareRows(main, r.targetLines, r.subLines, b.refs),
              { ...costRows('원·하도급 원가계산서', doDoc.cost, [{ label: '도급금액', cost: doDoc.cost }, { label: '하도급대상금액', cost: r.target, ref: b.costRef.tc }, { label: '하도급금액', cost: r.sub, ref: b.costRef.sc }]), name: '대비원가' },
              ...b.sheets,
            ];
          })()).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 됩니다'))} />
        </Group>
      </>}
      info={<>
        <label><span className="k">하도급</span>
          <select value={sub.id} onChange={(e) => setParams(useChange ? { id: e.target.value, v: 'change' } : { id: e.target.value })}>
            {s.subs.map((x) => <option key={x.id} value={x.id}>{x.vendor} · {x.trade}</option>)}
          </select>
        </label>
        <div className="vg"><button type="button" className={'vb' + (!useChange ? ' on' : '')} onClick={() => setParams({ id: sub.id })}>당초</button><button type="button" className={'vb' + (useChange ? ' on' : '')} onClick={() => setParams({ id: sub.id, v: 'change' })}>{s.change.name}</button></div>
        <span><span className="k">하도급대상액</span> <b>{won(r.target.total)}</b></span>
        <span><span className="k">하도급액</span> <b>{won(r.sub.total)}</b></span>
        <span><span className="k">하도급율</span> <b>{sub.rate}</b></span>
        <div style={{ flex: 1 }} />
        <span className="k">도급 = 착공내역서 전체 · 하도급대상 = 도급 중 하도급 공종 · 하도급 = 대상 × 하도급율</span>
      </>}
      footer={<><span>파란 줄 = 하도급 공종</span><span>회색 줄 = 원도급사 부담 (하도급에 넣지 않음)</span></>}
      mainClass="main pad"
    >
      <h1 style={{ margin: 0, textAlign: 'center', fontSize: 18, letterSpacing: '.3em' }}>원·하도급 대비내역서</h1>
      <table className="f" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th rowSpan={2}>공 종 명</th><th rowSpan={2}>규 격</th><th rowSpan={2}>단위</th>
            <th colSpan={head('도급', true, true)}>도 급 (착공)</th><th colSpan={head('대상', false, true)}>하도급 대상</th><th colSpan={head('하도급', true, false)}>하 도 급</th>
            <th rowSpan={2}>비율</th>
          </tr>
          <tr>
            <th>수량</th>{split ? <><th>합계</th><th>노무비</th><th>재료비</th><th>경비</th></> : <><th>단가</th><th>금액</th></>}
            <th>수량</th>{split ? <><th>합계</th><th>노무비</th><th>재료비</th><th>경비</th></> : <th>금액</th>}
            {split ? <><th>합계</th><th>노무비</th><th>재료비</th><th>경비</th></> : <><th>단가</th><th>금액</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.filter((fr) => !onlySub || tMap.has(fr.line.id) || fr.depth === 0).map((fr) => {
            const l = fr.line;
            const g = !!l.children;
            const t = tMap.get(l.id);
            const sv = sMap.get(l.id);
            return (
              <tr key={l.id} className={(g ? 'g ' : '') + (t ? 'sub' : '')}>
                <td className="nm" style={{ paddingLeft: 6 + fr.depth * 14 }}>{l.mark} {l.name}</td><td className="sp" title={l.spec}>{l.spec}</td><td className="c">{l.unit}</td>
                <td className="n">{g ? '' : qtyFmt(l.qty)}</td>{amtCells(l, fr.amount, true)}
                <td className="n">{t && !g ? qtyFmt(l.qty) : ''}</td>{amtCells(undefined, t?.amount, false)}
                {amtCells(sv?.line, sv?.amount, true)}
                <td className="c">{sv && t ? pct(sv.amount.t, t.amount.t) : fr.depth === 1 ? <span className="cf">직접시공</span> : ''}</td>
              </tr>
            );
          })}
          <tr className="red">
            <td style={{ letterSpacing: '.4em' }}>순공사비</td><td /><td /><td />
            {split ? <><td className="n">{won(totDo)}</td><td /><td /><td /></> : <><td /><td className="n">{won(totDo)}</td></>}
            <td />{split ? <><td className="n">{won(totT)}</td><td /><td /><td /></> : <td className="n">{won(totT)}</td>}
            {split ? <><td className="n">{won(totS)}</td><td /><td /><td /></> : <><td /><td className="n">{won(totS)}</td></>}
            <td className="c">{pct(totS, totT)}</td>
          </tr>
        </tbody>
      </table>

      <h1 style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 18, letterSpacing: '.3em' }}>원·하도급 원가계산서</h1>
      <table className="f" style={{ width: '100%' }}>
        <thead><tr><th>구분</th><th>비    목</th><th>도급금액</th><th>하도급대상금액</th><th>하도급금액</th><th>하도급 비율</th><th>요율</th><th>산 출 근 거</th><th>비 고</th></tr></thead>
        <tbody>
          {doDoc.cost.rows.filter((x) => !['mat', 'scrap', 'perfGuar'].includes(x.key)).map((row) => {
            const t = r.target.rows.find((x) => x.key === row.key)!;
            const sv = r.sub.rows.find((x) => x.key === row.key)!;
            const off = t.amount === null && row.amount !== null && row.optional;
            return (
              <tr key={row.key} className={(row.total ? 'sum ' : '') + (row.key === 'J' ? 'red ' : '') + (off ? 'off' : '')}>
                <td className="c">{row.no}</td><td>{row.label}</td>
                <td className="n">{won(row.amount, { zero: '' })}</td>
                <td className="n">{off ? '—' : won(t.amount)}</td>
                <td className="n">{off ? '—' : won(sv.amount)}</td>
                <td className="c">{t.amount && sv.amount ? pct(sv.amount, t.amount) : ''}</td>
                <td className="c">{row.rate ?? ''}</td><td>{row.basis ?? ''}</td>
                <td>{off ? '원도급사 부담' : row.key === 'profit' ? `대상 ${r.target.get('adj') >= 0 ? '+' : ''}${won(r.target.get('adj'), { tri: false, zero: '0' })} · 하도급 ${r.sub.get('adj') >= 0 ? '+' : ''}${won(r.sub.get('adj'), { tri: false, zero: '0' })} 정산` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Shell>
  );
}
