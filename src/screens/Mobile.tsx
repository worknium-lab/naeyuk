import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { won, lineAmount, pct, qtyFmt, unitTotal } from '../engine';

function Frame({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '');
  return (
    <div className="mo">
      <header className="mo-h"><small>{sub}</small><b>{title}</b></header>
      <div className="mo-c">{children}</div>
      <nav className="mo-nav" aria-label="모바일 메뉴">
        <NavLink to="/m" end className={cls}>프로젝트</NavLink>
        <NavLink to="/m/estimate" className={cls}>내역서</NavLink>
        <NavLink to="/m/cost" className={cls}>원가</NavLink>
        <Link to="/project">PC 화면</Link>
      </nav>
    </div>
  );
}

export function MobileHome() {
  const { s } = useStore();
  const docs = useDocs();
  const st = docs.get('start');
  const cum = docs.get('progressCum');
  const rate = cum ? cum.cost.get('D') / st.cost.get('D') : 0;
  return (
    <Frame title="국도43호선 용암교 보수공사" sub="○○국토관리사무소 · 교량 보수">
      <div className="card">
        <h3>계약</h3>
        <div className="kv"><span>설계 도급액</span><b>{won(docs.get('design').cost.total)}</b></div>
        <div className="kv"><span>착공 도급액 (낙찰률 {(s.bidRate * 100).toFixed(1)}%)</span><b>{won(st.cost.total)}</b></div>
      </div>
      {s.progressOn && (
        <div className="card">
          <h3>기성 {s.rounds[s.rounds.length - 1].name}</h3>
          <div className="kv"><span>누계 진도</span><b>{pct(rate, 1, 1)}</b></div>
          <div className="bar"><i style={{ width: `${Math.min(100, rate * 100)}%` }} /></div>
          <div className="kv"><span>금회 기성금</span><b>{won(docs.get('progress').cost.total)}</b></div>
        </div>
      )}
      <div className="card">
        <h3>문서</h3>
        {docs.list.map((d) => (
          <div key={d.key} className="mo-row"><span>{d.name}</span><b>{won(d.cost.total)}</b></div>
        ))}
        {docs.subs.map((x) => <div key={x.sub.id} className="mo-row"><span>하도급 · {x.sub.vendor}</span><b>{won(x.result.sub.total)}</b></div>)}
      </div>
    </Frame>
  );
}

export function MobileEstimate() {
  const { start } = useStore();
  const [open, setOpen] = useState<string | null>('G13');
  const groups = start.sections[0].lines[0].children ?? [];
  return (
    <Frame title="착공내역서" sub="공종을 누르면 항목이 펼쳐집니다">
      {groups.map((g) => {
        const a = lineAmount(g);
        const on = open === g.id;
        return (
          <div key={g.id} className="card" style={{ padding: 0 }}>
            <button type="button" onClick={() => setOpen(on ? null : g.id)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '12px 14px', border: 0, background: 'transparent', fontSize: 14, cursor: 'pointer' }}>
              <b>{on ? '▾' : '▸'} {g.name}</b><span>{won(a.t)}</span>
            </button>
            {on && (
              <div style={{ padding: '0 14px 8px' }}>
                {(g.children ?? []).map((l) => (
                  <div key={l.id} className="mo-item">
                    <div className="mo-i1">
                      <div className="mo-nm"><div>{l.name}</div>{l.spec && <small>{l.spec}</small>}</div>
                      {!l.children && <span className="mo-q">{qtyFmt(l.qty)} <small>{l.unit}</small></span>}
                      <b className="mo-t">{won(lineAmount(l).t)}</b>
                    </div>
                    {!l.children && (
                      <div className="mo-i2">
                        <span><small>재료</small>{won(l.mu, { zero: '0' })}</span>
                        <span><small>노무</small>{won(l.lu, { zero: '0' })}</span>
                        <span><small>경비</small>{won(l.eu, { zero: '0' })}</span>
                        <span className="sum"><small>합계</small>{won(unitTotal(l), { zero: '0' })}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Frame>
  );
}

export function MobileCost() {
  const docs = useDocs();
  const c = docs.get('start').cost;
  const rows: [string, number][] = [['재료비', c.get('A')], ['노무비', c.get('B')], ['경비', c.get('C')], ['순공사원가', c.get('D')], ['일반관리비', c.get('gen')], ['이윤', c.get('profit')], ['폐기물처리비', c.get('waste')], ['총원가', c.get('H')], ['부가가치세', c.get('vat')]];
  return (
    <Frame title="원가 요약" sub="착공내역서 기준">
      <div className="card">
        {rows.map(([k, v]) => <div key={k} className="kv"><span>{k}</span><span>{won(v, { zero: '0' })}</span></div>)}
        <div className="kv" style={{ borderTop: '1px solid #DDE1E6', marginTop: 6, paddingTop: 8 }}><b>도급액</b><b style={{ color: '#C00000' }}>{won(c.total)}</b></div>
      </div>
      <div className="card">
        <h3>비목 비율</h3>
        {[['재료비', c.get('A')], ['노무비', c.get('B')], ['경비', c.get('C')]].map(([k, v]) => (
          <div key={k as string} style={{ marginBottom: 8 }}>
            <div className="kv"><span>{k}</span><span>{pct(v as number, c.get('D'), 1)}</span></div>
            <div className="bar"><i style={{ width: `${((v as number) / c.get('D')) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </Frame>
  );
}
