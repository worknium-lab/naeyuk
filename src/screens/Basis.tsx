import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shell, FB, Group, usePopup } from '../ui/Shell';
import { canPrint } from '../ui/Ask';
import { useStore } from '../store';
import { won, parseNum, usages, wageOf, normName, resolveSheet, costSheet, sectionAmount, calcPrice, machinePrice, quotePrice, type MachineDef, type QuoteDef } from '../engine';
import { useDocs } from '../docs';
import calcRows from '../data/calc.rows.json';
import tables from '../data/tables.json';

/* ---------- 묶음 접기/펼치기 공통 ---------- */
function useFold(groups: string[], openDefault: string[]) {
  const [open, setOpen] = useState<Set<string>>(new Set(openDefault));
  return {
    isOpen: (g: string) => open.has(g),
    toggle: (g: string) => setOpen((o) => { const n = new Set(o); n.has(g) ? n.delete(g) : n.add(g); return n; }),
    all: () => setOpen(new Set(groups)),
    none: () => setOpen(new Set()),
  };
}

function FoldBar({ fold, extra }: { fold: ReturnType<typeof useFold>; extra?: ReactNode }) {
  return (
    <>
      <div className="vg">
        <button type="button" className="vb" onClick={fold.all}>모두 펼침</button>
        <button type="button" className="vb" onClick={fold.none}>제목만</button>
      </div>
      {extra}
    </>
  );
}

const Tg = ({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) => (
  <button type="button" className="tg" aria-expanded={open} aria-label={(open ? '접기: ' : '펼치기: ') + label} onClick={(e) => { e.stopPropagation(); onClick(); }}>{open ? '▾' : '▸'}</button>
);

/* ---------- 일위대가 ---------- */
const KIND_LABEL: Record<string, string> = { labor: '노임', mat: '자재', unit: '일위', calc: '단산', pct: '%', fixed: '고정' };

export function UnitCost() {
  const { s, set, units, design, toast } = useStore();
  const { open } = usePopup();
  const [params] = useSearchParams();
  const focus = params.get('no');
  const groups = s.basis.units.map((u) => u.no);
  const fold = useFold(groups, focus ? [focus] : ['제3호표', '제7호표']);
  const [sel, setSel] = useState<string>(focus ?? '제3호표');
  const [find, setFind] = useState('');
  useEffect(() => { if (focus) setTimeout(() => document.getElementById('u-' + focus)?.scrollIntoView({ block: 'center' }), 50); }, [focus]);
  const cur = units.get(sel);
  const used = usages(s.basis, design, sel);
  const setQty = (no: string, id: string, q: number) => set((st) => ({
    ...st, basis: { ...st.basis, units: st.basis.units.map((u) => (u.no === no ? { ...u, lines: u.lines.map((l) => (l.id === id ? { ...l, qty: q } : l)) } : u)) },
  }));
  const delLine = (no: string, id: string) => set((st) => ({
    ...st, basis: { ...st.basis, units: st.basis.units.map((u) => (u.no === no ? { ...u, lines: u.lines.filter((l) => l.id !== id) } : u)) },
  }));
  const addLine = (kind: 'labor' | 'mat', ref: string) => {
    if (!cur) return;
    const name = kind === 'labor' ? s.basis.wages[ref]?.name : s.basis.mats[ref]?.name;
    const spec = kind === 'mat' ? s.basis.mats[ref]?.spec ?? '' : '';
    const unit = kind === 'labor' ? '인' : s.basis.mats[ref]?.unit ?? '';
    set((st) => ({ ...st, basis: { ...st.basis, units: st.basis.units.map((u) => (u.no === sel ? { ...u, lines: [...u.lines, { id: `${sel}-${Date.now()}`, kind, ref, name: name ?? ref, spec, unit, qty: 0 }] } : u)) } }));
    toast(`${name}을(를) ${sel}에 넣었습니다 — 수량을 넣으세요`);
  };
  const newUnit = () => {
    const n = Math.max(0, ...s.basis.units.map((u) => Number(u.no.replace(/\D/g, '')) || 0)) + 1;
    const no = `제${n}호표`;
    set((st) => ({ ...st, basis: { ...st.basis, units: [...st.basis.units, { no, name: '새 호표', spec: '', unit: '㎡', lines: [] }] } }));
    setSel(no); fold.toggle(no);
  };
  const shown = s.basis.units.filter((u) => !find || (u.no + u.name).includes(find));

  return (
    <Shell
      doc={`일위대가 : ${cur ? `${sel} ${cur.def.name}` : ''}`}
      toolbar={<>
        <Group label="근거 불러오기">
          <FB icon="labor" label="노임" to="/labor" /><FB icon="material" label="자재" to="/material" /><FB icon="machine" label="장비" to="/machine" />
          <FB icon="calc" label="단산" to="/calc" /><FB icon="docs" label="일위" title="다른 내역서의 일위대가" onClick={() => open('refcopy')} />
          <FB icon="market" label="표준" onClick={() => open('market')} />
        </Group>
        <Group label="호표 작성">
          <FB icon="new" label="호표" title="새 호표" onClick={newUnit} />
          <FB icon="book" label="품셈" title="표준품셈으로 호표 만들기" onClick={() => open('pumsem')} />
        </Group>
        <Group label="편집">
          <FB icon="search" label="사용처" onClick={() => toast(used.length ? `${sel} 사용처: ${used.join(', ')}` : `${sel}을(를) 쓰는 곳이 없습니다`)} />
        </Group>
        <Group label="계산"><FB icon="recalc" label="재계산" primary onClick={() => toast('호표를 다시 계산했습니다 — 내역서 단가에 바로 반영됩니다')} /></Group>
      </>}
      info={<FoldBar fold={fold} extra={<>
        <label><span className="k">찾기</span><input type="text" value={find} onChange={(e) => setFind(e.target.value)} placeholder="호표·품명" style={{ width: 160, padding: '0 6px' }} /></label>
        <div style={{ flex: 1 }} /><span className="k">노란 칸 수량을 고치면 호표 → 내역서 → 원가계산서까지 바로 다시 계산됩니다</span>
      </>} />}
      right={cur && (
        <aside className="rp" aria-label="선택한 호표">
          <h2>{sel} {cur.def.name}</h2>
          <div className="calc">
            <div className="r"><span>노무비</span><span>{won(cur.total.l, { zero: '0' })}</span></div>
            <div className="r"><span>재료비</span><span>{won(cur.total.m, { zero: '0' })}</span></div>
            <div className="r"><span>경비</span><span>{won(cur.total.e, { zero: '0' })}</span></div>
            <div className="r"><span>합계 / {cur.def.unit}</span><b>{won(cur.total.l + cur.total.m + cur.total.e)}</b></div>
          </div>
          <div><b style={{ fontSize: 12.5 }}>사용처</b><div className="hint">{used.length ? used.join(' · ') : '없음'}</div></div>
          <fieldset><legend>줄 넣기</legend>
            <label style={{ alignItems: "center" }}>노임 <select style={{ flex: 1, minWidth: 0 }} defaultValue="" onChange={(e) => { if (e.target.value) addLine('labor', e.target.value); e.target.value = ''; }}>
              <option value="">— 고르기 —</option>
              {Object.entries(s.basis.wages).map(([k, w]) => <option key={k} value={k}>{w.name} ({won(wageOf(w))})</option>)}
            </select></label>
            <label style={{ alignItems: "center" }}>자재 <select style={{ flex: 1, minWidth: 0 }} defaultValue="" onChange={(e) => { if (e.target.value) addLine('mat', e.target.value); e.target.value = ''; }}>
              <option value="">— 고르기 —</option>
              {Object.values(s.basis.mats).map((m) => <option key={m.key} value={m.key}>{m.name} {m.spec} ({won(m.price)})</option>)}
            </select></label>
          </fieldset>
          {cur.def.from && <div className="note">출처: {cur.def.from}</div>}
        </aside>
      )}
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead>
            <tr><th rowSpan={2} /><th rowSpan={2}>호 표</th><th rowSpan={2}>품    명</th><th rowSpan={2}>규 격</th><th rowSpan={2}>수량</th><th rowSpan={2}>단위</th><th rowSpan={2}>구분</th><th rowSpan={2}>단가</th><th colSpan={4}>금    액</th><th rowSpan={2}>비 고</th><th rowSpan={2} /></tr>
            <tr><th>합계</th><th>노무비</th><th>재료비</th><th>경비</th></tr>
          </thead>
          <tbody>
            {shown.map((def) => {
              const uc = units.get(def.no)!;
              const t = uc.total;
              const op = fold.isOpen(def.no);
              return (
                <Fragment key={def.no}>
                  <tr id={'u-' + def.no} className={'g click' + (sel === def.no ? ' sel' : '') + (def.from ? ' sub' : '')} onClick={() => setSel(def.no)}>
                    <td className="c"><Tg open={op} onClick={() => fold.toggle(def.no)} label={def.name} /></td>
                    <td className="c">{def.no}</td><td>{def.name}</td><td>{def.spec}</td><td className="n">1</td><td className="c">{def.unit}</td><td />
                    <td className="n">{won(t.l + t.m + t.e)}</td><td className="n">{won(t.l + t.m + t.e)}</td><td className="n">{won(t.l)}</td><td className="n">{won(t.m)}</td><td className="n">{won(t.e)}</td>
                    <td>{def.from ?? def.note ?? ''}</td><td />
                  </tr>
                  {op && uc.lines.map((lc) => {
                    const ln = lc.line;
                    const sum = lc.l + lc.m + lc.e;
                    const f1 = (x: number) => (x ? x.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '');
                    return (
                      <tr key={ln.id}>
                        <td /><td />
                        <td style={{ paddingLeft: 20 }}>{ln.name}</td><td>{ln.spec}</td>
                        <td className="n">{ln.kind === 'fixed' ? '1' : <input className="q" style={{ width: 64 }} value={ln.qty} onChange={(e) => setQty(def.no, ln.id, Number(e.target.value) || 0)} />}</td>
                        <td className="c">{ln.unit}</td>
                        <td className="c">{ln.kind === 'unit' || ln.kind === 'calc'
                          ? <a className="lk" href="#" onClick={(e) => { e.preventDefault(); if (ln.kind === 'unit' && ln.ref) { setSel(ln.ref); if (!fold.isOpen(ln.ref)) fold.toggle(ln.ref); setTimeout(() => document.getElementById('u-' + ln.ref)?.scrollIntoView({ block: 'center' }), 30); } }}>{ln.ref}</a>
                          : KIND_LABEL[ln.kind]}</td>
                        <td className="n">{ln.kind === 'pct' ? `${f1(lc.price)}의` : won(lc.price)}</td>
                        <td className="n">{f1(sum)}</td><td className="n">{f1(lc.l)}</td><td className="n">{f1(lc.m)}</td><td className="n">{f1(lc.e)}</td>
                        <td>{ln.note ?? ''}</td>
                        <td className="c"><button type="button" className="tg" title="줄 지우기" onClick={() => delLine(def.no, ln.id)}>×</button></td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 단가산출 ---------- */
type CRow = [string, string, string, string, string, string, string, string, string, string, string];

export function Calc() {
  const { s, set, toast } = useStore();
  const { open } = usePopup();
  const rows = calcRows as CRow[];
  const groups = rows.filter((r) => r[0] === 'grp').map((r) => r[1]);
  const fold = useFold(groups, ['S2', 'S3', 'S7']);
  return (
    <Shell
      doc="단가산출"
      toolbar={<>
        <Group label="근거 불러오기">
          <FB icon="labor" label="노임" to="/labor" /><FB icon="material" label="자재" to="/material" /><FB icon="machine" label="장비" to="/machine" />
          <FB icon="calc" label="단산" onClick={() => open('refcopy')} /><FB icon="unit" label="일위" to="/unit" />
        </Group>
        <Group label="산출">
          <FB icon="folder" label="공종" onClick={() => toast('공종 만들기')} />
          <FB icon="net" label="계산" primary title="수식 계산 (Alt+Z)" onClick={() => toast('수식을 다시 계산했습니다')} />
          <FB icon="sum" label="ADD" onClick={() => toast('위 줄들을 더했습니다')} />
          <FB icon="plus" label="합계" onClick={() => toast('같은 레벨 합계')} />
          <FB icon="pct" label="잡비" onClick={() => toast('잡비 (비목 비율)')} />
        </Group>
        <Group label="비목 지정">
          <FB icon="labor" label="노무" onClick={() => toast('노무비로 지정 (Shift+F5)')} />
          <FB icon="material" label="재료" onClick={() => toast('재료비로 지정')} />
          <FB icon="machine" label="경비" onClick={() => toast('경비로 지정')} />
        </Group>
        <Group label="계산"><FB icon="book" label="품셈" onClick={() => open('pumsem')} /><FB icon="recalc" label="재계산" onClick={() => toast('전체재계산했습니다')} /></Group>
      </>}
      info={<FoldBar fold={fold} extra={<><div style={{ flex: 1 }} /><span className="k">산출 {groups.length}건 · 노란 칸은 산출 당시 단가 · 산출근거의 노임 줄은 노임단가에 연결되어 갱신 차이가 합계에 더해집니다</span></>} />}
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 26 }} /><th>산   출   근   거</th><th>합 계</th><th>노무비</th><th>재료비</th><th>경 비</th><th>구분</th><th>참 조</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const grp = r[0] === 'grp';
              if (!grp && !fold.isOpen(r[1])) return null;
              const pad = r[3] === 'i1' ? 16 : r[3] === 'i2' ? 30 : r[3] === 'i3' ? 44 : 6;
              return (
                <tr key={i} className={grp ? 'g' : r[0] === 'sub' ? 'sum' : ''}>
                  <td className="c">{grp && <Tg open={fold.isOpen(r[1])} onClick={() => fold.toggle(r[1])} label={r[4]} />}</td>
                  <td style={{ paddingLeft: pad, whiteSpace: 'pre', fontWeight: r[2] ? 700 : undefined }}>{r[4]}</td>
                  {grp ? (() => {
                    const no = '단산' + r[1].slice(1);
                    const c = s.basis.calcs.find((x) => x.no === no)!;
                    const setC = (f: 'l' | 'm' | 'e', v: number) => set((st) => ({ ...st, basis: { ...st.basis, calcs: st.basis.calcs.map((x) => (x.no === no ? { ...x, [f]: v } : x)) } }));
                    return <>
                      <td className="n" id={no} title={c.laborLines?.length ? `노임 줄 ${c.laborLines.length}개 연결` : '고정값'}>{(() => { const p = calcPrice(s.basis, c); const t = p.l + p.m + p.e; const t0 = c.l + c.m + c.e; return <>{won(t)}{t !== t0 && <div className="cf">근거 갱신 {t - t0 > 0 ? "+" : ""}{won(t - t0, { tri: false })}</div>}</>; })()}</td>
                      {(['l', 'm', 'e'] as const).map((f) => <td key={f} className="n"><input className="q" style={{ width: 84 }} value={c[f]} onClick={(e) => e.stopPropagation()} onChange={(e) => setC(f, Number(e.target.value) || 0)} /></td>)}
                    </>;
                  })() : [5, 6, 7, 8].map((k) => <td key={k} className="n">{r[k]}</td>)}
                  <td className="c">{grp ? <span className="lk">{'단산' + r[1].slice(1)}</span> : r[9]}</td>
                  <td>{r[10] && <span className="lk">{r[10]}</span>}</td>
                </tr>
              );
            })}
                      {s.basis.calcs.filter((c) => !groups.includes('S' + c.no.replace('단산', ''))).map((c) => (
              <tr key={c.no} className="g sub">
                <td /><td>{c.no.replace('단산', '')}.{c.name} [{c.unit}] <span className="cf">· 다른 내역서에서 가져옴</span></td>
                <td className="n" id={c.no}>{won(c.l + c.m + c.e)}</td><td className="n">{won(c.l)}</td><td className="n">{won(c.m)}</td><td className="n">{won(c.e)}</td>
                <td /><td><span className="lk">{c.no}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 기계경비 ---------- */
export function Machine() {
  const { s, set, design, toast } = useStore();
  const ms = s.basis.machines ?? [];
  const fold = useFold(ms.map((m) => m.no), ['M1', 'M2']);
  const fuel = s.basis.fuel ?? {};
  const upd = (no: string, patch: Partial<MachineDef>) => set((st) => ({ ...st, basis: { ...st.basis, machines: (st.basis.machines ?? []).map((m) => (m.no === no ? { ...m, ...patch } : m)) } }));
  const setFuel = (k: string, v: number) => set((st) => ({ ...st, basis: { ...st.basis, fuel: { ...(st.basis.fuel ?? {}), [k]: v } } }));
  const f1 = (x: number) => x.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  const usedBy = (no: string) => s.basis.calcs.filter((c) => c.machineLines?.some((x) => x.machine === no)).map((c) => c.no);
  return (
    <Shell
      doc="기계경비"
      toolbar={<>
        <Group label="장비"><FB icon="machine" label="장비" onClick={() => toast('Main에서 장비 불러오기 (데스크톱 판)')} /></Group>
        <Group label="기준"><FB icon="rate" label="적용기준" primary onClick={() => document.getElementById('fuel')?.scrollIntoView()} /></Group>
        <Group label="기타"><FB icon="search" label="사용처" onClick={() => toast(ms.map((m) => `${m.name}: ${usedBy(m.no).join(', ') || '없음'}`).join(' · '))} /></Group>
      </>}
      info={<FoldBar fold={fold} extra={<><div style={{ flex: 1 }} /><span className="k">노란 칸을 고치면 이 장비를 쓰는 단가산출 → 호표 → 내역서까지 다시 계산됩니다 · 운전사 노임은 노임단가에 연결</span></>} />}
      right={
        <aside className="rp" aria-label="기계경비 적용기준" id="fuel" style={{ width: 260 }}>
          <h2>기계경비 적용기준</h2>
          <table className="f" style={{ width: '100%' }}>
            <tbody>
              {Object.entries(fuel).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td className="n"><input className="q" style={{ width: 80 }} value={v} onChange={(e) => setFuel(k, Number(e.target.value) || 0)} /> 원/ℓ</td></tr>
              ))}
            </tbody>
          </table>
          <div className="hint">운전사 노임 = 노임 × 1/8 × 16/12 × 25/20 (시간당, 상여금·휴일 반영). 노임단가를 갱신하면 함께 바뀝니다.</div>
          {design && null}
        </aside>
      }
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 26 }} /><th>장비 · 항목</th><th>규 격</th><th>산 출 근 거</th><th>시간당 합계</th><th>노무비</th><th>재료비</th><th>경 비</th><th>사용처</th></tr></thead>
          <tbody>
            {ms.map((m) => {
              const c = machinePrice(s.basis, m);
              const t = c.total;
              const op = fold.isOpen(m.no);
              const wage = Object.values(s.basis.wages).find((w) => normName(w.name) === normName(m.operator));
              return (
                <Fragment key={m.no}>
                  <tr className="g">
                    <td className="c"><Tg open={op} onClick={() => fold.toggle(m.no)} label={m.name} /></td>
                    <td>{m.no.slice(1)}. {m.name}</td><td>{m.spec}</td><td />
                    <td className="n">{won(t.l + t.m + t.e)}</td><td className="n">{won(t.l)}</td><td className="n">{won(t.m)}</td><td className="n">{won(t.e)}</td>
                    <td>{usedBy(m.no).join(', ')}</td>
                  </tr>
                  {op && <>
                    {m.losses.map((x, k) => (
                      <tr key={'l' + k}>
                        <td /><td style={{ paddingLeft: 20 }}>{x.name}</td><td>{m.note ?? ''}</td>
                        <td><input className="q" style={{ width: 110 }} value={x.price} onChange={(e) => upd(m.no, { losses: m.losses.map((y, kk) => (kk === k ? { ...y, price: Number(e.target.value) || 0 } : y)) })} /> ￦ × <input className="q" style={{ width: 54 }} value={x.coef} onChange={(e) => upd(m.no, { losses: m.losses.map((y, kk) => (kk === k ? { ...y, coef: Number(e.target.value) || 0 } : y)) })} /> × 10⁻⁷</td>
                        <td className="n">{f1(Math.floor(x.price * x.coef * 1e-7 * 10 + 1e-6) / 10)}</td><td /><td /><td className="n">{f1(Math.floor(x.price * x.coef * 1e-7 * 10 + 1e-6) / 10)}</td><td />
                      </tr>
                    ))}
                    <tr><td /><td style={{ paddingLeft: 20 }}>주연료</td><td>{m.fuel}</td>
                      <td><input className="q" style={{ width: 54 }} value={m.fuelQty} onChange={(e) => upd(m.no, { fuelQty: Number(e.target.value) || 0 })} /> ℓ × {won(fuel[m.fuel] ?? 0)}</td>
                      <td className="n">{f1(c.fuelAmt)}</td><td /><td className="n">{f1(c.fuelAmt)}</td><td /><td /></tr>
                    <tr><td /><td style={{ paddingLeft: 20 }}>잡품</td><td>주연료의</td>
                      <td><input className="q" style={{ width: 44 }} value={m.sundry} onChange={(e) => upd(m.no, { sundry: Number(e.target.value) || 0 })} /> % × {f1(c.fuelAmt)}</td>
                      <td className="n">{f1(c.sundryAmt)}</td><td /><td className="n">{f1(c.sundryAmt)}</td><td /><td /></tr>
                    <tr><td /><td style={{ paddingLeft: 20 }}>{m.operator}</td><td>{wage?.use === 'cur' ? '2026년(하)' : '2022년(상)'}</td>
                      <td>1 인 × {won(wage ? wageOf(wage) : 0)} × 1/8 × 16/12 × 25/20</td>
                      <td className="n">{f1(c.op)}</td><td className="n">{f1(c.op)}</td><td /><td /><td /></tr>
                  </>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 자재단가 ---------- */
export function Material() {
  const { s, set, toast, design } = useStore();
  const t = (tables as Record<string, string[][][]>).Material[0];
  const ref = t.slice(2);
  const mats = Object.values(s.basis.mats);
  const [sel, setSel] = useState(mats[0]?.key ?? '');
  const m = s.basis.mats[sel];
  const findSrc = (name: string, spec: string) => ref.find((r) => normName(r[1]) === normName(name) && normName(r[2]) === normName(spec)) ?? ref.find((r) => normName(r[1]) === normName(name) && !r[2]);
  const src = m ? findSrc(m.name, m.spec) : undefined;
  const SRC = ['가격정보', '물가자료', '유통물가', '물가정보', '거래가격', '견적가1'];
  const prices = src ? SRC.map((name, k) => ({ name, price: src[4 + k * 2], page: src[5 + k * 2] })).filter((x) => x.price) : [];
  const setPrice = (key: string, price: number) => set((st) => ({ ...st, basis: { ...st.basis, mats: { ...st.basis.mats, [key]: { ...st.basis.mats[key], price } } } }));
  const used = m ? usages(s.basis, design, m.key) : [];
  return (
    <Shell
      doc="자재단가"
      toolbar={<>
        <Group label="자재"><FB icon="material" label="자재" onClick={() => toast('Main에서 자재 불러오기 (데스크톱 판)')} /><FB icon="recalc" label="물가갱신" onClick={() => toast('물가지 최신 호로 갱신 (자료실 연결은 데스크톱 판)')} /></Group>
        <Group label="적용">
          <FB icon="check" label="최저가 적용" onClick={() => {
            if (!prices.length || !m) { toast('출처 단가가 없는 자재입니다'); return; }
            const min = Math.min(...prices.map((p) => parseNum(p.price)));
            setPrice(m.key, min); toast(`${m.name} 최저가 ${won(min)}원을 적용했습니다`);
          }} />
        </Group>
        <Group label="기타"><FB icon="search" label="사용처" onClick={() => toast(used.length ? `${m?.name} 사용처: ${used.join(', ')}` : '쓰는 곳이 없습니다')} /></Group>
      </>}
      info={<><span><span className="k">자재</span> {mats.length}종 (일위대가에서 쓰는 자재)</span><div style={{ flex: 1 }} /><span className="k">적용단가를 고치면 이 자재를 쓰는 호표와 내역서가 바로 다시 계산됩니다</span></>}
      right={m && (
        <aside className="rp" aria-label="선택 자재">
          <h2>{m.name} · {m.spec} · {m.unit}</h2>
          {prices.length ? (
            <table className="f" style={{ width: '100%' }}>
              <thead><tr><th>출처</th><th>단가</th><th>page</th><th /></tr></thead>
              <tbody>{prices.map((p) => (
                <tr key={p.name} className={parseNum(p.price) === m.price ? 'sel' : ''}>
                  <td>{p.name}</td><td className="n">{p.price}</td><td className="c">{p.page}</td>
                  <td className="c"><button type="button" className="tg" style={{ width: 34 }} onClick={() => setPrice(m.key, parseNum(p.price))}>적용</button></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="hint">발췌한 출처 단가가 없습니다. 적용단가를 직접 넣으세요.</div>}
          <div><b style={{ fontSize: 12.5 }}>사용처</b><div className="hint">{used.join(' · ') || '없음'}</div></div>
        </aside>
      )}
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th>No</th><th>품     명</th><th>규   격</th><th>단위</th><th>적용단가</th><th>출처 단가</th><th>사용처</th></tr></thead>
          <tbody>
            {mats.map((x, i) => {
              const r = findSrc(x.name, x.spec);
              return (
                <tr key={x.key} className={'click' + (sel === x.key ? ' sel' : '')} onClick={() => setSel(x.key)}>
                  <td className="c">{i + 1}</td><td>{x.name}</td><td>{x.spec}</td><td className="c">{x.unit}</td>
                  <td className="n"><input className="q" style={{ width: 90 }} value={x.price} onChange={(e) => setPrice(x.key, Number(e.target.value) || 0)} /></td>
                  <td className="n">{r ? `${r[16]} (${r[17]})` : ''}</td>
                  <td>{usages(s.basis, design, x.key).join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 노임단가 ---------- */
export function Labor() {
  const { s, set, toast } = useStore();
  const docs = useDocs();
  const list = Object.entries(s.basis.wages);
  const [pick, setPick] = useState<Set<string>>(new Set(list.filter(([, w]) => w.cur).map(([k]) => k)));
  const anyCur = list.some(([, w]) => w.use === 'cur');
  const diff = list.reduce((a, [k, w]) => a + (pick.has(k) && w.cur && w.use === 'old' ? w.cur - w.old : 0), 0);
  const before = docs.get('design').cost.total;
  const sim = useMemo(() => {
    const wages = Object.fromEntries(list.map(([k, w]) => [k, pick.has(k) && w.cur ? { ...w, use: 'cur' as const } : w]));
    const b = { ...s.basis, wages };
    const d = resolveSheet(s.design, b);
    return costSheet({ direct: sectionAmount(d, 'main'), waste: sectionAmount(d, 'waste').t, supplied: sectionAmount(d, 'supplied').t, rates: s.rates }).total;
  }, [s.basis, s.design, s.rates, pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = (use: 'old' | 'cur') => set((st) => ({
    ...st, basis: { ...st.basis, wages: Object.fromEntries(Object.entries(st.basis.wages).map(([k, w]) => [k, pick.has(k) && w.cur ? { ...w, use } : w])) },
  }));
  return (
    <Shell
      doc="노임단가"
      toolbar={<>
        <Group label="노임"><FB icon="labor" label="노임" onClick={() => toast('노임 불러오기 (데스크톱 판)')} /></Group>
        <Group label="갱신">
          <FB icon="recalc" label="일괄갱신" primary onClick={() => { apply('cur'); toast(`${pick.size}개 직종을 2026년 하반기 노임으로 바꿨습니다 — 호표·내역서·원가계산서가 다시 계산됐습니다`); }} />
          <FB icon="undo" label="되돌리기" onClick={() => { apply('old'); toast('공사 작성 당시 노임(2022 상반기)으로 되돌렸습니다'); }} />
          <FB icon="chart" label="영향보기" onClick={() => toast(`설계 도급액 ${won(before)} → ${won(sim)} (${sim - before >= 0 ? '+' : ''}${won(sim - before, { tri: false, zero: '0' })})`)} />
        </Group>
      </>}
      info={<><span><span className="k">현재 적용</span> {anyCur ? '2026년 하반기 (일부/전체)' : '2022년 상반기 (공사 작성 당시)'}</span><div style={{ flex: 1 }} /><span className="k">대한건설협회 2026년 하반기 시중노임단가</span></>}
      right={
        <aside className="rp" aria-label="일괄 갱신">
          <h2>2026년 하반기로 일괄 갱신</h2>
          <div className="calc">
            <div className="r"><span>선택 직종</span><span>{pick.size}개</span></div>
            <div className="r"><span>단가 차이 합 (미적용분)</span><span>+{won(diff, { zero: '0' })}</span></div>
            <div className="r"><span>설계 도급액 지금</span><span>{won(before)}</span></div>
            <div className="r"><span>선택 직종 갱신 후</span><b>{won(sim)}</b></div>
            <div className="r"><span>차이</span><b>{sim - before >= 0 ? '+' : ''}{won(sim - before, { tri: false, zero: '0' })}</b></div>
          </div>
          <div className="hint">노임을 쓰는 일위대가 호표 → 내역서 단가 → 원가계산서까지 다시 계산됩니다. 단가산출(단산)은 산출근거에서 읽은 노임 줄만큼 반영됩니다 (기계경비 운전사 노임도 함께).</div>
          <button type="button" className="btn pri" onClick={() => { apply('cur'); toast('일괄 갱신했습니다'); }}>선택 직종 갱신</button>
          <button type="button" className="btn" onClick={() => apply('old')}>선택 직종 되돌리기</button>
        </aside>
      }
    >
      <div style={{ padding: 10 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead>
            <tr><th rowSpan={2}>선택</th><th rowSpan={2}>품    명</th><th rowSpan={2}>단위</th><th rowSpan={2}>적용단가</th><th rowSpan={2}>적용 기준</th><th colSpan={3}>노임 단가</th></tr>
            <tr><th>2022 상반기</th><th>2026 하반기 (직종번호)</th><th>차이 (증감률)</th></tr>
          </thead>
          <tbody>
            {list.map(([k, w]) => (
              <tr key={k} className={w.use === 'cur' ? 'sub' : ''}>
                <td className="c"><input type="checkbox" disabled={!w.cur} checked={pick.has(k)} aria-label={w.name} onChange={() => setPick((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} /></td>
                <td>{w.name}</td><td className="c">{w.unit}</td>
                <td className="n"><b>{won(wageOf(w))}</b></td><td className="c">{w.use === 'cur' ? '2026년(하)' : '2022년(상)'}</td>
                <td className="n">{won(w.old)}</td>
                <td className="n">{w.cur ? `${won(w.cur)} (${w.code})` : <span className="cf">미공표 · 대응 직종 지정 필요</span>}</td>
                <td className="n">{w.cur ? `+${won(w.cur - w.old)} (${(((w.cur - w.old) / w.old) * 100).toFixed(1)}%)` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 견적단가 ---------- */
export function Quote() {
  const { s, set, design, toast } = useStore();
  const qs = s.basis.quotes ?? [];
  const [sel, setSel] = useState(qs[0]?.no ?? '');
  const q = qs.find((x) => x.no === sel);
  const upd = (no: string, patch: Partial<QuoteDef>) => set((st) => ({ ...st, basis: { ...st.basis, quotes: (st.basis.quotes ?? []).map((x) => (x.no === no ? { ...x, ...patch } : x)) } }));
  const add = () => {
    const no = `견적${qs.length + 1}`;
    set((st) => ({ ...st, basis: { ...st.basis, quotes: [...(st.basis.quotes ?? []), { no, name: '새 견적 품목', spec: '', unit: '식', col: 'm', method: 'min', vendors: [{ name: '업체 1', price: 0 }, { name: '업체 2', price: 0 }, { name: '업체 3', price: 0 }] }] } }));
    setSel(no);
  };
  const COL = { l: '노무비', m: '재료비', e: '경비' } as const;
  return (
    <Shell
      doc="견적단가"
      toolbar={<>
        <Group label="견적"><FB icon="new" label="견적 추가" onClick={add} /><FB icon="search" label="사용처" onClick={() => toast(q ? `${q.no} 사용처: ${usages(s.basis, design, q.no).join(', ') || '없음'}` : '')} /></Group>
      </>}
      info={<><span className="k">업체 견적을 3곳 이상 받아 최저가·평균·지정 중 하나를 적용합니다. 내역서 줄의 비고에 견적N으로 연결됩니다.</span></>}
      left={
        <nav className="lp" aria-label="견적 목록">
          <div className="lp-h">견적 품목</div>
          {qs.map((x) => <a key={x.no} href="#" className={x.no === sel ? 'on' : ''} onClick={(e) => { e.preventDefault(); setSel(x.no); }}><span>{x.no} {x.name}</span><span className="st">{won(quotePrice(x))}</span></a>)}
        </nav>
      }
    >
      {q ? (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
          <table className="f" style={{ width: '100%' }}>
            <tbody>
              <tr><th>품명</th><td><input className="q" style={{ width: 260, textAlign: 'left' }} value={q.name} onChange={(e) => upd(q.no, { name: e.target.value })} /></td><th>규격</th><td><input className="q" style={{ width: 160, textAlign: 'left' }} value={q.spec} onChange={(e) => upd(q.no, { spec: e.target.value })} /></td><th>단위</th><td><input className="q" style={{ width: 50, textAlign: 'center' }} value={q.unit} onChange={(e) => upd(q.no, { unit: e.target.value })} /></td></tr>
              <tr><th>비목</th><td><select value={q.col} onChange={(e) => upd(q.no, { col: e.target.value as QuoteDef['col'] })}>{(['l', 'm', 'e'] as const).map((c) => <option key={c} value={c}>{COL[c]}</option>)}</select></td>
                <th>적용</th><td colSpan={3}><select value={q.method} onChange={(e) => upd(q.no, { method: e.target.value as QuoteDef['method'] })}><option value="min">최저가</option><option value="avg">평균 (원 미만 버림)</option><option value="pick">지정한 업체</option></select></td></tr>
            </tbody>
          </table>
          <table className="f" style={{ width: '100%' }}>
            <thead><tr><th>지정</th><th>업 체</th><th>견적일</th><th>견 적 가</th><th /></tr></thead>
            <tbody>
              {q.vendors.map((v, k) => {
                const applied = quotePrice(q) === v.price && v.price > 0;
                return (
                  <tr key={k} className={applied ? 'sel' : ''}>
                    <td className="c"><input type="radio" name={'pick' + q.no} checked={q.method === 'pick' && (q.pick ?? 0) === k} onChange={() => upd(q.no, { method: 'pick', pick: k })} /></td>
                    <td><input className="q" style={{ width: 200, textAlign: 'left' }} value={v.name} onChange={(e) => upd(q.no, { vendors: q.vendors.map((x, kk) => (kk === k ? { ...x, name: e.target.value } : x)) })} /></td>
                    <td><input className="q" style={{ width: 90, textAlign: 'left' }} value={v.date ?? ''} onChange={(e) => upd(q.no, { vendors: q.vendors.map((x, kk) => (kk === k ? { ...x, date: e.target.value } : x)) })} /></td>
                    <td className="n"><input className="q" style={{ width: 120 }} value={v.price} onChange={(e) => upd(q.no, { vendors: q.vendors.map((x, kk) => (kk === k ? { ...x, price: Number(e.target.value) || 0 } : x)) })} /></td>
                    <td className="c"><button type="button" className="tg" title="업체 지우기" onClick={() => upd(q.no, { vendors: q.vendors.filter((_, kk) => kk !== k) })}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => upd(q.no, { vendors: [...q.vendors, { name: `업체 ${q.vendors.length + 1}`, price: 0 }] })}>업체 추가</button>
          </div>
          <div className="calc"><div className="r"><span>적용 단가 ({q.method === 'min' ? '최저가' : q.method === 'avg' ? '평균' : '지정'}) · {COL[q.col]}</span><b>{won(quotePrice(q))} 원/{q.unit}</b></div>
            <div className="r"><span>사용처</span><span>{usages(s.basis, design, q.no).join(', ') || '없음'}</span></div></div>
        </div>
      ) : <div style={{ padding: 20 }}><button className="btn pri" onClick={add}>견적 추가</button></div>}
    </Shell>
  );
}
