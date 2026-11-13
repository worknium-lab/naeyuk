import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shell, FB, Group, usePopup } from '../ui/Shell';
import { canPrint, useAsk } from '../ui/Ask';
import { useStore } from '../store';
import { won, parseNum, usages, wageOf, normName, resolveSheet, costSheet, sectionAmount, calcPrice, calcEval, mapSheet, machinePrice, quotePrice, type MachineDef, type QuoteDef, type CalcDef, type CalcLine, type Line } from '../engine';
import { basisData } from '../data/basisData';
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
  const calcs = s.basis.calcs;
  const fold = useFold(calcs.map((c) => c.no), ['단산2', '단산3', '단산7']);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const rawGroups = (calcRows as CRow[]).filter((r) => r[0] === 'grp').map((r) => '단산' + r[1].slice(1));
  const f1 = (x: number) => x.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const setCalc = (no: string, patch: Partial<CalcDef>) => set((st) => ({ ...st, basis: { ...st.basis, calcs: st.basis.calcs.map((x) => (x.no === no ? { ...x, ...patch } : x)) } }));
  const setLine = (no: string, i: number, patch: Record<string, unknown>) => set((st) => ({ ...st, basis: { ...st.basis, calcs: st.basis.calcs.map((x) => (x.no === no ? { ...x, lines: x.lines!.map((l, k) => (k === i ? ({ ...l, ...patch } as CalcLine) : l)) } : x)) } }));
  const Num = ({ v, on, w = 52 }: { v: number; on: (n: number) => void; w?: number }) => (
    <input className="qi" style={{ width: w }} defaultValue={v} key={v} onClick={(e) => e.stopPropagation()}
      onBlur={(e) => { const n = Number(e.target.value.replace(/,/g, '')); if (Number.isFinite(n) && n !== v) on(n); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
  const ask = useAsk();
  const wageList = Object.values(s.basis.wages);
  const matList = Object.values(s.basis.mats);
  const machList = s.basis.machines ?? [];
  const mutLines = (no: string, f: (ls: CalcLine[]) => CalcLine[]) => set((st) => ({ ...st, basis: { ...st.basis, calcs: st.basis.calcs.map((x) => (x.no === no ? { ...x, lines: f(x.lines ?? []) } : x)) } }));
  const [pick, setPick] = useState<{ no: string; i: number } | null>(null);
  const addLine = (ln: CalcLine) => {
    if (!pick) { toast('먼저 줄을 넣을 단가산출(또는 그 안의 줄)을 누르세요'); return; }
    const { no, i } = pick;
    const at = i < 0 ? (calcs.find((c) => c.no === no)?.lines?.length ?? 0) : i + 1;
    mutLines(no, (ls) => [...ls.slice(0, at), { ...ln, added: true } as CalcLine, ...ls.slice(at)]);
    setPick({ no, i: at });
    if (!fold.isOpen(no)) fold.toggle(no);
  };
  const delLine = (no: string, i: number) => mutLines(no, (ls) => ls.filter((_, k) => k !== i));
  const upLine = (no: string, i: number) => mutLines(no, (ls) => { if (i < 1) return ls; const n = [...ls]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
  const NEW: Record<string, () => CalcLine> = {
    제목: () => ({ k: 'text', text: '가. 항목', ind: 2, bold: true }),
    노임: () => ({ k: 'labor', wage: wageList.find((w) => w.name.includes('보통인부'))?.name ?? wageList[0]?.name ?? '', n: 1, div: 1, per: '', base: 0, ind: 3 }),
    자재: () => { const m = matList[0]; return { k: 'mat', mat: m?.key ?? '', name: m?.name ?? '', spec: m?.spec ?? '', f: [{ v: 1, u: m?.unit }, { v: 1 }], base: 0, ind: 3 }; },
    장비: () => ({ k: 'mach', machine: machList[0]?.no ?? 'M1', col: 'l', ops: [{ op: '×', v: 1, u: 'hr' }], base: 0, ind: 3 }),
    '작업량 Q': () => ({ k: 'q', q: 0.2, K: 1, f: 1, E: 0.8, Cm: 18, unit: '㎥/hr', base: 0, ind: 2 }),
    '노무비 %': () => ({ k: 'pct', pct: 3, col: 'm', base: 0, ind: 2 }),
    소계: () => ({ k: 'sub', label: '소 계', cols: {}, ind: 3 }),
    합계: () => ({ k: 'sub', label: '계', cols: {}, final: true, ind: 2 }),
  };
  const nextNo = () => `단산${Math.max(0, ...calcs.map((c) => Number(c.no.replace('단산', '')) || 0)) + 1}`;
  const newCalc = async () => {
    const name = await ask({ title: '새 단가산출', label: '공종 이름', value: '' });
    if (!name) return;
    const unit = (await ask({ title: '새 단가산출', label: `${name} — 단위`, value: '㎡' })) ?? '';
    const no = nextNo();
    set((st) => ({ ...st, basis: { ...st.basis, calcs: [...st.basis.calcs, { no, name, unit, l: 0, m: 0, e: 0, own: true, lines: [
      { k: 'text', text: '1. 노무비', ind: 1, bold: true, added: true },
    ] }] } }));
    fold.toggle(no);
    setPick({ no, i: 0 });
    toast(`${no} ${name}을(를) 만들었습니다 — 위 [줄 추가]의 노무·재료·장비 버튼으로 줄을 넣으세요`);
  };
  const putToSheet = (c: CalcDef) => {
    const main = s.design.sections.find((x) => x.section === 'main');
    const root = main?.lines[0];
    const g = root?.children?.filter((x) => x.children).at(-1) ?? root;
    if (!g) return;
    const item: Line = { id: 'C' + Date.now().toString(36), level: 0, mark: '', name: c.name, spec: '', unit: c.unit, qty: 1, lu: 0, mu: 0, eu: 0, ref: c.no, link: true };
    set((st) => ({ ...st, design: mapSheet(st.design, (l) => (l.id === g.id ? { ...l, children: [...(l.children ?? []), item] } : l)) }));
    toast(`설계내역서 [${g.name}] 끝에 ${c.name}(${c.no} 연결)을 넣었습니다 — 내역서에서 수량을 고치세요`);
  };
  const delCalc = async (c: CalcDef) => {
    if (await ask({ title: '단가산출 지우기', label: `${c.no} ${c.name}을(를) 지울까요?`, confirmOnly: true, ok: '지우기' })) {
      set((st) => ({ ...st, basis: { ...st.basis, calcs: st.basis.calcs.filter((x) => x.no !== c.no) } }));
      toast(`${c.no}를 지웠습니다`);
    }
  };
  const sel = (v: string, opts: [string, string][], on: (v: string) => void, w = 120) => (
    <select className="qs" style={{ width: w }} value={v} onChange={(e) => on(e.target.value)} onClick={(e) => e.stopPropagation()}>
      {opts.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
    </select>
  );
  const Txt = ({ v, on, w = 160 }: { v: string; on: (t: string) => void; w?: number }) => (
    <input className="qi" style={{ width: w, textAlign: 'left' }} defaultValue={v} key={v} onBlur={(e) => e.target.value !== v && on(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
  const Was = ({ now, base }: { now: number; base: number }) => base !== 0 && Math.abs(now - base) >= 0.05 ? <span className="cf"> (당초 {f1(base)})</span> : null;
  const COL: Record<string, string> = { l: '노무비', m: '재료비', e: '경  비' };
  const cell = (cols: Partial<Record<'l' | 'm' | 'e', number>>, t?: number, strong = false) => {
    const S = ({ x }: { x?: number }) => <td className="n">{x === undefined ? '' : strong ? <b>{f1(x)}</b> : f1(x)}</td>;
    return <><S x={t} /><S x={cols.l} /><S x={cols.m} /><S x={cols.e} /></>;
  };
  const resetAll = () => {
    const fresh = basisData();
    set((st) => ({ ...st, basis: { ...st.basis, calcs: st.basis.calcs.map((c) => { const f = fresh.calcs.find((x) => x.no === c.no); return f ? { ...c, lines: f.lines, l: f.l, m: f.m, e: f.e } : c; }) } }));
    toast('산출근거를 원래 값으로 되돌렸습니다');
  };
  const evals = calcs.map((c) => ({ c, ev: c.lines?.length || c.own ? calcEval(s.basis, c) : null }));
  const changed = evals.filter(({ c, ev }) => ev && (ev.price.l !== c.l || ev.price.m !== c.m || ev.price.e !== c.e));
  return (
    <Shell
      doc="단가산출"
      toolbar={<>
        <Group label="작성">
          <FB icon="new" label="새 단산" primary title="새 단가산출 만들기" onClick={newCalc} />
        </Group>
        <Group label="줄 추가 (구분)">
          <FB icon="lines" label="제목" onClick={() => addLine(NEW['제목']())} />
          <FB icon="labor" label="노무" title="노임 × 인 ÷ 기준수량" onClick={() => addLine(NEW['노임']())} />
          <FB icon="material" label="재료" title="자재단가 × 수량 × 할증" onClick={() => addLine(NEW['자재']())} />
          <FB icon="machine" label="장비" title="기계경비 × 시간, ÷ 작업량 Q" onClick={() => addLine(NEW['장비']())} />
          <FB icon="calc" label="작업량 Q" title="Q = 3,600 × q × K × f × E ÷ Cm" onClick={() => addLine(NEW['작업량 Q']())} />
          <FB icon="pct" label="잡비 %" title="노무비의 % (공구손료 등)" onClick={() => addLine(NEW['노무비 %']())} />
          <FB icon="plus" label="소계" onClick={() => addLine(NEW['소계']())} />
          <FB icon="sum" label="합계" onClick={() => addLine(NEW['합계']())} />
        </Group>
        <Group label="근거 단가">
          <FB icon="labor" label="노임단가" to="/labor" /><FB icon="material" label="자재단가" to="/material" /><FB icon="machine" label="기계경비" to="/machine" />
        </Group>
        <Group label="보기">
          <FB icon="filter" label="바뀐 산출만" on={onlyChanged} onClick={() => setOnlyChanged(!onlyChanged)} />
        </Group>
        <Group label="산출근거">
          <FB icon="undo" label="원래대로" title="산출근거의 수량·효율을 처음 값으로" onClick={resetAll} />
          <FB icon="book" label="품셈" onClick={() => open('pumsem')} />
          <FB icon="unit" label="일위대가" to="/unit" />
        </Group>
      </>}
      info={<FoldBar fold={fold} extra={<><span className="k" style={{ marginLeft: 8 }}>{pick ? <>줄 넣을 곳: <b>{pick.no}</b> {pick.i < 0 ? '끝' : `${pick.i + 1}번째 줄 아래`}</> : '줄을 누른 뒤 [줄 추가] 버튼으로 노무·재료·장비 줄을 넣습니다'}</span><div style={{ flex: 1 }} /><span className="k">산출 {calcs.length}건 · 바뀐 산출 {changed.length}건 · 노란 칸은 고칠 수 있습니다(수량·인·효율) · 노임·자재·기계경비를 고치면 산출근거가 바로 다시 계산됩니다</span></>} />}
    >
      <div style={{ padding: 10 }}>
        <table className="f calc" style={{ width: '100%' }}>
          <thead><tr><th style={{ width: 26 }} /><th>산   출   근   거</th><th>합 계</th><th>노무비</th><th>재료비</th><th>경 비</th><th>구분</th><th>참 조</th></tr></thead>
          <tbody>
            {evals.filter(({ c }) => !onlyChanged || changed.some((x) => x.c.no === c.no)).map(({ c, ev }) => {
              const n = c.no.replace('단산', '');
              const p = ev ? ev.price : calcPrice(s.basis, c);
              const t = p.l + p.m + p.e, t0 = c.l + c.m + c.e;
              const isOpen = fold.isOpen(c.no);
              return (
                <Fragment key={c.no}>
                  <tr className={'g click' + (pick?.no === c.no && pick.i < 0 ? ' sel' : '')} onClick={() => setPick({ no: c.no, i: -1 })}>
                    <td className="c">{ev && <Tg open={isOpen} onClick={() => fold.toggle(c.no)} label={c.name} />}</td>
                    <td>{n}.{c.name} [{c.unit}]{c.own && <span className="cf"> · 새로 작성</span>}{!c.own && !rawGroups.includes(c.no) && <span className="cf"> · 다른 내역서에서 가져옴</span>}{!ev && rawGroups.includes(c.no) && <span className="cf"> · 산출근거 없음 (값 직접 입력)</span>}</td>
                    <td className="n" id={c.no}>{won(t)}{!c.own && t !== t0 && <div className="cf">당초 {won(t0)} · {t - t0 > 0 ? '+' : ''}{won(t - t0, { tri: false })}</div>}</td>
                    {(['l', 'm', 'e'] as const).map((f) => <td key={f} className="n">{ev ? <>{won(p[f])}{!c.own && p[f] !== c[f] && <div className="cf">당초 {won(c[f])}</div>}</> : <input className="q" style={{ width: 84 }} value={c[f]} onChange={(e) => setCalc(c.no, { [f]: Number(e.target.value) || 0 })} />}</td>)}
                    <td className="c" /><td><span className="lk">{c.no}</span>{c.own && <button type="button" className="vb mini" style={{ marginLeft: 4 }} title="이 단산을 단가로 쓰는 항목을 설계내역서에 넣기" onClick={() => putToSheet(c)}>내역서에 넣기</button>}{c.own && <button type="button" className="xb" title="이 단산 지우기" onClick={() => delCalc(c)}>×</button>}</td>
                  </tr>
                  {ev && isOpen && ev.rows.map((r, i) => {
                    const l = r.line;
                    const pad = 6 + l.ind * 14;
                    const ad = !!l.added;
                    const td = (body: ReactNode, cols: Partial<Record<'l' | 'm' | 'e', number>> = {}, tag = '', ref: ReactNode = null, total?: number, strong = false) => (
                      <tr key={i} className={(l.k === 'sub' ? 'sum ' : '') + (ad ? 'added ' : '') + (pick?.no === c.no && pick.i === i ? 'sel' : '')} onClick={() => setPick({ no: c.no, i })}>
                        <td className="c ctl">{ad && <><button type="button" className="xb" title="위로" onClick={() => upLine(c.no, i)}>↑</button><button type="button" className="xb" title="이 줄 지우기" onClick={() => delLine(c.no, i)}>×</button></>}</td><td style={{ paddingLeft: pad }}>{body}</td>{cell(cols, total, strong)}<td className="c">{tag}</td><td>{ref}</td>
                      </tr>
                    );
                    switch (l.k) {
                      case 'labor': return td(<>{ad ? sel(l.wage, wageList.map((w) => [w.name, w.name]), (v) => setLine(c.no, i, { wage: v })) : l.wage} : <a className="pl" href="#/labor">{won(r.price!)}</a> × <Num v={l.n} on={(v) => setLine(c.no, i, { n: v })} /> 인{l.div || ad ? <> ÷ <Num v={l.div ?? 1} on={(v) => setLine(c.no, i, { div: v })} /> {ad ? <Txt v={l.per ?? ''} w={36} on={(t) => setLine(c.no, i, { per: t })} /> : l.per}</> : null} = <b>{f1(r.now)}</b><Was now={r.now} base={l.base} /></>, { l: r.now }, '노무', l.ref && <span className="lk">{l.ref}</span>);
                      case 'mat': return td(<>{ad ? sel(l.mat, matList.map((m) => [m.key, `${m.name} (${m.spec})`]), (v) => { const m = s.basis.mats[v]; setLine(c.no, i, { mat: v, name: m.name, spec: m.spec, f: [{ ...l.f[0], u: m.unit }, ...l.f.slice(1)] }); }, 220) : <>{l.name} ({l.spec})</>} &nbsp;<a className="pl" href="#/material">{won(r.price!)}</a>{l.f.map((x, k) => <Fragment key={k}> × <Num v={x.v} w={46} on={(v) => setLine(c.no, i, { f: l.f.map((y, z) => (z === k ? { ...y, v } : y)) })} />{x.u ? ` ${x.u}` : ''}</Fragment>)} = <b>{f1(r.now)}</b><Was now={r.now} base={l.base} /></>, { m: r.now }, '재료', l.ref && <span className="lk">{l.ref}</span>);
                      case 'mach': return td(<>{ad ? <>{sel(l.machine, machList.map((m) => [m.no, `${m.no.replace('M', '기계')} ${m.name}`]), (v) => setLine(c.no, i, { machine: v }), 170)} {sel(l.col, [['l', '노무비'], ['m', '재료비'], ['e', '경비']], (v) => setLine(c.no, i, { col: v }), 72)}</> : COL[l.col]} : <a className="pl" href="#/machine">{won(r.price!)}</a>{l.ops.map((o, k) => <Fragment key={k}> {ad ? sel(o.op, [['×', '×'], ['÷', '÷']], (v) => setLine(c.no, i, { ops: l.ops.map((y, z) => (z === k ? { ...y, op: v } : y)) }), 40) : o.op} {o.v === 'Q' ? <b title="위 작업량 Q">Q</b> : <Num v={o.v} w={40} on={(v) => setLine(c.no, i, { ops: l.ops.map((y, z) => (z === k ? { ...y, v } : y)) })} />}{o.u ? ` ${o.u}` : ''}</Fragment>)}{ad && <> <button type="button" className="vb mini" onClick={() => setLine(c.no, i, { ops: [...l.ops, { op: '×', v: 1 }] })}>+ ×</button> <button type="button" className="vb mini" title="같은 산출의 작업량 Q로 나누기" onClick={() => setLine(c.no, i, { ops: [...l.ops, { op: '÷', v: 'Q' }] })}>÷ Q</button></>} = <b>{f1(r.now)}</b><Was now={r.now} base={l.base} /></>, { [l.col]: r.now }, '장비', <span className="lk">{l.machine.replace('M', '기계')}</span>);
                      case 'q': return td(<div className="qf">
                        <div>q = <Num v={l.q} w={44} on={(v) => setLine(c.no, i, { q: v })} /> &nbsp; K = <Num v={l.K} w={44} on={(v) => setLine(c.no, i, { K: v })} /> &nbsp; f = <Num v={l.f} w={44} on={(v) => setLine(c.no, i, { f: v })} /> &nbsp; E = <Num v={l.E} w={44} on={(v) => setLine(c.no, i, { E: v })} /> &nbsp; Cm = <Num v={l.Cm} w={44} on={(v) => setLine(c.no, i, { Cm: v })} /> sec</div>
                        <div>Q = 3,600 × q × K × f × E ÷ Cm = 3,600 × {l.q} × {l.K} × {l.f} × {l.E} ÷ {l.Cm} = <b>{f1(r.now)} {l.unit}</b><Was now={r.now} base={l.base} /></div>
                      </div>, {}, '작업량');
                       case 'pct': return td(<>{ad && <>노무비 소계 → {sel(l.col, [['m', '재료비'], ['e', '경비']], (v) => setLine(c.no, i, { col: v }), 72)} : </>}{f1(r.price!)} × <Num v={l.pct} w={40} on={(v) => setLine(c.no, i, { pct: v })} /> % = <b>{f1(r.now)}</b><Was now={r.now} base={l.base} /></>, { [l.col]: r.now }, l.col === 'm' ? '재료' : '경비');
                      case 'sub': return td(<b>{ad ? <Txt v={l.label} w={90} on={(t) => setLine(c.no, i, { label: t })} /> : l.label} : {f1(r.now)}</b>, r.cols ?? {}, l.final ? '합계' : (l.tag ?? '소계'), null, r.now, true);
                      default: return td(ad ? <Txt v={l.text} w={260} on={(t) => setLine(c.no, i, { text: t })} /> : <span style={{ fontWeight: l.bold ? 700 : undefined, whiteSpace: 'pre' }}>{l.text}</span>, {}, '', l.ref && <span className="lk">{l.ref}</span>);
                    }
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
