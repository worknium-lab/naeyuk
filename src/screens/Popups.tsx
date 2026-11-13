import { useEffect, useMemo, useState } from 'react';
import { Win } from '../ui/Shell';
import { useStore, peekProject } from '../store';
import { useNavigate } from 'react-router-dom';
import { won, flatten, insertAfter, newId, floor, normName, resolveSheet, type Basis, type Line, type ULine, type UnitDef } from '../engine';

/** 내역서에 넣을 공종 — 예시 공사는 포장면, 그 밖에는 순공사비의 마지막 공종 */
function targetGroup(design: { sections: { section: string; lines: Line[] }[] }): Line | undefined {
  const all = design.sections.flatMap((x) => flatten(x.lines as Line[]));
  const g23 = all.find((r) => r.line.id === 'G23')?.line;
  if (g23) return g23;
  const root = design.sections.find((x) => x.section === 'main')?.lines[0];
  return root?.children?.filter((c) => c.children).at(-1) ?? root;
}
const nextUnitNo = (units: UnitDef[]) => Math.max(0, ...units.map((u) => Number(u.no.replace(/\D/g, '')) || 0)) + 1;
import tables from '../data/tables.json';
import { REF_PROJECT, REF_BASIS, CURRENT_LABOR, CURRENT_MATERIAL, LABOR_INDEX } from '../data/reference';

/* ================= 표준품셈 검색 ================= */
const PUMSEM_TOC = [
  { t: '제1장 공 통', d: 0 }, { t: '제2장 토 목', d: 0 }, { t: '제3장 건 축', d: 0 },
  { t: '3-1 철거 공사', d: 1 }, { t: '3-2 방수 공사', d: 1 }, { t: '3-3 칠공사', d: 1 },
  { t: '3-3-1 재도장 시 바탕처리(콘크리트·모르타르면)', d: 2 }, { t: '3-3-2 재도장 시 바탕처리(철재면)', d: 2, hit: true }, { t: '3-3-3 재도장 시 바탕처리(목재면)', d: 2 },
  { t: '3-4 수선 및 보수공사', d: 1 }, { t: '제4장 기계설비', d: 0 },
];

export function Pumsem({ onClose }: { onClose: () => void }) {
  const { set, toast, s } = useStore();
  const nav = useNavigate();
  const [grade, setGrade] = useState<'A' | 'B'>('A');
  const [q, setQ] = useState('재도장 바탕처리 철재');
  const area = grade === 'A' ? 20 : 60;
  const painter = 268_225, worker = 172_698;
  const l1 = (2 / area) * painter, l2 = (1 / area) * worker;
  const tool = (l1 + l2) * 0.03;
  const lines = [
    { n: '도 장 공', q: 2 / area, f: `2인 ÷ ${area}㎡`, u: painter, l: l1, m: 0 },
    { n: '보통인부', q: 1 / area, f: `1인 ÷ ${area}㎡`, u: worker, l: l2, m: 0 },
    { n: '공구손료 및 잡재료비(연마지)', q: 3, f: '[주]④ 노무비의 3%', u: 0, l: 0, m: tool },
  ];
  const L = floor(l1 + l2), M = floor(tool);
  const [into, setInto] = useState(s.basis.units[0]?.no ?? '');
  const addTo = () => {
    const u = s.basis.units.find((x) => x.no === into);
    if (!u) return;
    const stamp = Date.now().toString(36);
    const add: ULine[] = [
      { id: `${into}-${stamp}-1`, kind: 'labor', ref: '도장공', name: '도 장 공', spec: '', unit: '인', qty: +(2 / area).toFixed(4), note: `2인/${area}㎡` },
      { id: `${into}-${stamp}-2`, kind: 'labor', ref: '보통인부', name: '보통인부', spec: '', unit: '인', qty: +(1 / area).toFixed(4), note: `1인/${area}㎡` },
      { id: `${into}-${stamp}-3`, kind: 'pct', col: 'm', name: '공구손료 및 잡재료비(연마지)', spec: '노무비의', unit: '%', qty: 3 },
    ];
    set((st) => ({ ...st, basis: { ...st.basis, units: st.basis.units.map((x) => (x.no === into ? { ...x, lines: [...x.lines, ...add] } : x)) } }));
    toast(`${into} ${u.name}에 품셈 3줄을 넣었습니다`);
    nav(`/unit?no=${into}`);
    onClose();
  };
  const make = () => {
    const no = `제${nextUnitNo(s.basis.units)}호표`;
    const lines: ULine[] = [
      { id: `${no}-1`, kind: 'labor', ref: '도장공', name: '도 장 공', spec: '', unit: '인', qty: +(2 / area).toFixed(4), note: `2인/${area}㎡` },
      { id: `${no}-2`, kind: 'labor', ref: '보통인부', name: '보통인부', spec: '', unit: '인', qty: +(1 / area).toFixed(4), note: `1인/${area}㎡` },
      { id: `${no}-3`, kind: 'pct', col: 'm', name: '공구손료 및 잡재료비(연마지)', spec: '노무비의', unit: '%', qty: 3 },
    ];
    set((st) => ({ ...st, basis: { ...st.basis, units: [...st.basis.units, { no, name: '재도장 시 바탕처리', spec: `철재면 (${grade}급)`, unit: '㎡', lines, from: '품셈 유지관리 3-3-2' }] } }));
    toast(`${no} 재도장 시 바탕처리를 만들었습니다 — 노임은 현재 공사 노임단가에 연결됩니다`);
    nav(`/unit?no=${no}`);
    onClose();
  };
  return (
    <Win title="표준품셈 검색 — 2026 건설공사 표준품셈" onClose={onClose} w={1200} h={820}
      buttons={<>
        <span className="grow">팝업을 띄운 채로 뒤의 작업 화면을 계속 쓸 수 있습니다</span>
        <button type="button" className="btn" onClick={onClose}>닫기</button>
        {s.basis.units.length > 0 && <>
          <select value={into} onChange={(e) => setInto(e.target.value)} style={{ maxWidth: 220 }}>
            {s.basis.units.map((u) => <option key={u.no} value={u.no}>{u.no} {u.name}</option>)}
          </select>
          <button type="button" className="btn" onClick={addTo}>이 호표에 줄로 넣기</button>
        </>}
        <button type="button" className="btn pri" onClick={make}>새 일위대가로 만들기</button>
      </>}>
      <div className="ib">
        <label>품셈 <select><option>2026 건설공사 표준품셈</option><option>2025 건설공사 표준품셈</option></select></label>
        <label>검색어 <input type="text" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240, padding: '0 8px' }} /></label>
        <button type="button" className="btn pri" style={{ height: 26 }}>찾기</button>
        <label><input type="checkbox" defaultChecked />본문까지</label>
        <div style={{ flex: 1 }} /><span className="k">검색 결과 4건</span>
      </div>
      <div className="body">
        <nav className="lp" aria-label="목차">
          <div className="lp-h">목차 · 유지관리부문</div>
          {PUMSEM_TOC.map((x) => <a key={x.t} href="#" className={x.hit ? 'on' : ''} style={{ paddingLeft: 10 + x.d * 12 }} onClick={(e) => e.preventDefault()}><span>{x.t}</span></a>)}
        </nav>
        <main className="main pad">
          <h2>3-3-2 재도장 시 바탕처리(철재면) <span className="k" style={{ fontWeight: 400 }}>('21년 신설) · 유지관리부문 제3장 · 918쪽</span></h2>
          <table className="f">
            <thead><tr><th rowSpan={2}>구분</th><th rowSpan={2}>단위</th><th rowSpan={2}>수량</th><th colSpan={2}>시공량(㎡)</th></tr><tr><th>A급</th><th>B급</th></tr></thead>
            <tbody><tr><td>도 장 공</td><td className="c">인</td><td className="n">2</td><td className="n" rowSpan={2}>20</td><td className="n" rowSpan={2}>60</td></tr><tr><td>보 통 인 부</td><td className="c">인</td><td className="n">1</td></tr></tbody>
          </table>
          <div className="hint" style={{ fontFamily: 'var(--form)', color: '#000' }}>
            [주] ① 본 품은 철재면 재도장 시 바탕처리하는 기준이다.<br />② 오염(기름때 등) 및 부착물 제거, 도장면 연마 및 청소 작업을 포함한다.<br />③ 대상면의 상태에 따른 적용기준(A급·B급)은 원문 표를 따른다.<br />④ 공구손료 및 잡재료비(연마지 등)는 인력품의 3%로 계상한다.
          </div>
          <h2>㎡당 품으로 환산 ({grade}급) — 넣을 줄 미리보기</h2>
          <table className="f" style={{ width: '100%' }}>
            <thead><tr><th>품명</th><th>수량</th><th>단위</th><th>산식</th><th>노임단가</th><th>노무비</th><th>재료비</th></tr></thead>
            <tbody>
              {lines.map((x) => <tr key={x.n}><td>{x.n}</td><td className="n">{+x.q.toFixed(4)}</td><td className="c">{x.u ? '인' : '%'}</td><td>{x.f}</td><td className="n">{won(x.u)}</td><td className="n">{x.l ? x.l.toFixed(1) : ''}</td><td className="n">{x.m ? x.m.toFixed(1) : ''}</td></tr>)}
              <tr className="sum"><td>계</td><td /><td /><td /><td /><td className="n">{won(L)}</td><td className="n">{won(M)}</td></tr>
            </tbody>
          </table>
        </main>
        <aside className="rp" style={{ width: 260 }}>
          <h2>환산 설정</h2>
          <fieldset><legend>대상면 상태</legend>
            <label><input type="radio" checked={grade === 'A'} onChange={() => setGrade('A')} />A급 (20㎡/일)</label>
            <label><input type="radio" checked={grade === 'B'} onChange={() => setGrade('B')} />B급 (60㎡/일)</label>
          </fieldset>
          <fieldset><legend>노임 적용</legend>
            <label><input type="radio" defaultChecked name="lab" />현재 공사 노임 (2026 하반기)</label>
            <label><input type="radio" name="lab" />직접 선택</label>
          </fieldset>
          <div className="hint">넣으면 호표 비고에 근거 "품셈 유지관리 3-3-2"가 남고, 노임은 현재 공사의 노임단가에 연결됩니다.</div>
        </aside>
      </div>
    </Win>
  );
}

/* ================= 표준시장단가 검색 ================= */
export function MarketPrice({ onClose }: { onClose: () => void }) {
  const { set, toast } = useStore();
  const t = (tables as Record<string, string[][][]>).MarketPrice[0];
  const rows = t.slice(1);
  const [sel, setSel] = useState(4);
  const [k, setK] = useState(1);
  const r = rows[sel];
  const price = floor(Number(r[4].replace(/,/g, '')) * k);
  const lr = Number(r[5].replace('%', '')) / 100;
  const L = floor(price * lr * 10) / 10, E = +(price - L).toFixed(1);
  const put = () => {
    let g: Line | undefined;
    set((st) => {
      g = targetGroup(st.design);
      return g ? { ...st, design: insertAfter(st.design, g.id, [{ id: newId('m'), level: 0, mark: '', name: `차선도색(${r[1]})`, spec: r[2], unit: '㎡', qty: 1, lu: floor(L), mu: 0, eu: floor(E), ref: r[0] }]) } : st;
    });
    toast(`설계내역서 공종 맨 앞에 ${r[0]}을(를) 넣었습니다 — 수량을 고치세요`);
    onClose();
  };
  return (
    <Win title="표준시장단가 검색 — 설계내역서에 넣기" onClose={onClose} w={1200} h={820}
      buttons={<>
        <span className="grow">넣은 단가는 공사의 표준시장단가 시트에 등록되고, 반기 단가집이 바뀌면 일괄 바꾸기로 갱신합니다</span>
        <button type="button" className="btn" onClick={onClose}>닫기</button>
        <button type="button" className="btn pri" onClick={put}>내역서에 넣기</button>
      </>}>
      <div className="ib">
        <label>단가집 <select><option>2026년 하반기 (국토교통부)</option><option>2026년 상반기</option></select></label>
        <label>찾기 <input type="text" defaultValue="차선도색" style={{ width: 220, padding: '0 8px' }} /></label>
        <button type="button" className="btn pri" style={{ height: 26 }}>찾기</button>
        <div style={{ flex: 1 }} /><span className="k">공종코드 · 명칭 · 규격으로 찾습니다</span>
      </div>
      <div className="body">
        <nav className="lp" aria-label="단가집 분류">
          <div className="lp-h">단가집 분류</div>
          {['제2장 토목공사', 'A 공통공사', 'D 토공사', 'E 현장타설 콘크리트공사', 'I 강구조공사', 'K 교량공사', 'L 도로 및 포장공사', 'LC40* 아스콘포장 / 표층', 'LH21* 차선도색', 'LH22* 도로표지병', '제3장 건축공사'].map((x, i) => (
            <a key={x} href="#" className={i === 8 ? 'on' : ''} style={{ paddingLeft: i === 0 || i === 10 ? 10 : i >= 7 && i <= 9 ? 34 : 22 }} onClick={(e) => e.preventDefault()}><span>{x}</span></a>
          ))}
        </nav>
        <main className="main pad">
          <table className="f" style={{ width: '100%' }}>
            <thead><tr>{t[0].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x[0]} className={'click' + (i === sel ? ' sel' : '')} onClick={() => setSel(i)} onDoubleClick={put}>
                  <td>{x[0]}</td><td>{x[1]}</td><td>{x[2]}</td><td className="c">{x[3]}</td><td className="n">{x[4]}</td><td className="c">{x[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <section className="calc" style={{ lineHeight: 1.8 }}>
            <b>【단가정의】</b><br />① 도로 신설공사의 차선도색 작업을 기준한 것이다.<br />③ 융착식 도료는 도료배합, 차선도색, 유리알 살포 작업을 포함한다.<br />⑤ 재료비(페인트, 유리알, 프로판가스, 프라이머)는 제외되어 있다.<br />
            <b>【단가보정】</b> 노면에 표지병 등이 설치되어 작업능률이 저하되는 경우 × 1.10
          </section>
        </main>
        <aside className="rp" style={{ width: 280 }}>
          <h2>적용 단가 · {r[0]}</h2>
          <fieldset><legend>단가보정</legend>
            <label><input type="radio" checked={k === 1} onChange={() => setK(1)} />일반구간 × 1.00</label>
            <label><input type="radio" checked={k === 1.1} onChange={() => setK(1.1)} />표지병 등 능률 저하 × 1.10</label>
          </fieldset>
          <div className="calc">
            {won(price)} × {r[5]} + {won(price)} × {Math.round((1 - lr) * 100)}%<br />= {L.toLocaleString()} + {E.toLocaleString()} = <b>{won(price)} 원/㎡</b>
          </div>
          <label style={{ display: 'flex', gap: 6, fontSize: 12.5 }}><input type="checkbox" defaultChecked />제외된 재료비(자재 4종)를 함께 연결</label>
        </aside>
      </div>
    </Win>
  );
}

/* ================= 참고 내역서 (별도 창) + 연결 데이터 가져오기 ================= */
/** 근거 하나에 딸린 노임·자재를 하위 호표까지 모은다 */
function collect(ref: string, acc = { labor: [] as string[], material: [] as string[] }) {
  const b = REF_BASIS[ref];
  if (!b) return acc;
  b.labor.forEach((x) => !acc.labor.includes(x) && acc.labor.push(x));
  b.material.forEach((x) => !acc.material.includes(x) && acc.material.push(x));
  b.deps.forEach((d) => collect(d, acc));
  return acc;
}

/** 다른 공사의 근거(호표·단산·견적과 그 안의 노임·자재·기계경비)를 이 공사로 옮긴다 — 번호가 겹치면 새 번호 */
function importBasis(src: Basis, dst: Basis, refs: string[]) {
  const units = new Set<string>(), calcs = new Set<string>(), quotes = new Set<string>(), machines = new Set<string>(), wages = new Set<string>(), mats = new Set<string>();
  const walk = (ref: string) => {
    const u = src.units.find((x) => x.no === ref);
    if (u && !units.has(ref)) {
      units.add(ref);
      for (const ln of u.lines) {
        if ((ln.kind === 'unit' || ln.kind === 'calc') && ln.ref) walk(ln.ref);
        if (ln.kind === 'labor') wages.add(normName(ln.ref ?? ln.name));
        if (ln.kind === 'mat' && ln.ref) mats.add(ln.ref);
        if (ln.kind === 'machine' && ln.ref) machines.add(ln.ref);
      }
      return;
    }
    const c = src.calcs.find((x) => x.no === ref);
    if (c && !calcs.has(ref)) {
      calcs.add(ref);
      for (const ln of c.lines ?? []) {
        if (ln.k === 'labor') wages.add(normName(ln.wage));
        if (ln.k === 'mat') mats.add(ln.mat);
        if (ln.k === 'mach') machines.add(ln.machine);
      }
      return;
    }
    if (src.quotes?.some((x) => x.no === ref)) quotes.add(ref);
  };
  refs.forEach(walk);
  for (const m of machines) { const md = src.machines?.find((x) => x.no === m); if (md?.operator) wages.add(normName(md.operator)); }
  const map = new Map<string, string>();
  let un = nextUnitNo(dst.units);
  for (const u of units) map.set(u, `제${un++}호표`);
  let cn = Math.max(0, ...dst.calcs.map((c) => Number(c.no.replace(/\D/g, '')) || 0)) + 1;
  for (const c of calcs) map.set(c, `단산${cn++}`);
  let qn = Math.max(0, ...(dst.quotes ?? []).map((q) => Number(q.no.replace(/\D/g, '')) || 0)) + 1;
  for (const q of quotes) map.set(q, `견적${qn++}`);
  const dm = [...(dst.machines ?? [])];
  let mn = Math.max(0, ...dm.map((m) => Number(m.no.replace(/\D/g, '')) || 0)) + 1;
  const mmap = new Map<string, string>();
  for (const m of machines) {
    const md = src.machines?.find((x) => x.no === m);
    if (!md) continue;
    const same = dm.find((x) => x.name === md.name && x.spec === md.spec);
    if (same) { mmap.set(m, same.no); continue; }
    const no = dm.some((x) => x.no === m) ? `M${mn++}` : m;
    dm.push({ ...md, no }); mmap.set(m, no);
  }
  const W = { ...dst.wages };
  let wAdd = 0;
  for (const w of wages) if (!W[w] && src.wages[w]) { W[w] = src.wages[w]; wAdd++; }
  const M = { ...dst.mats };
  let mAdd = 0;
  for (const k of mats) if (!M[k] && src.mats[k]) { M[k] = src.mats[k]; mAdd++; }
  const re = (r?: string) => (r ? map.get(r) ?? r : r);
  const newUnits = [...units].map((no): UnitDef => {
    const u = src.units.find((x) => x.no === no)!;
    return { ...u, no: map.get(no)!, from: `${u.no} 가져옴`, lines: u.lines.map((ln) => ({ ...ln, id: `${map.get(no)}-${ln.id}`, ref: ln.kind === 'machine' ? mmap.get(ln.ref ?? '') ?? ln.ref : re(ln.ref) })) };
  });
  const newCalcs = [...calcs].map((no) => {
    const c = src.calcs.find((x) => x.no === no)!;
    return { ...c, no: map.get(no)!, lines: c.lines?.map((ln) => (ln.k === 'mach' ? { ...ln, machine: mmap.get(ln.machine) ?? ln.machine } : ln)) };
  });
  const newQuotes = [...quotes].map((no) => ({ ...src.quotes!.find((x) => x.no === no)!, no: map.get(no)! }));
  return {
    basis: { ...dst, wages: W, mats: M, machines: dm, units: [...dst.units, ...newUnits], calcs: [...dst.calcs, ...newCalcs], quotes: [...(dst.quotes ?? []), ...newQuotes] },
    map, counts: { units: units.size, calcs: calcs.size, quotes: quotes.size, machines: [...mmap.values()].length, wages: wAdd, mats: mAdd },
  };
}

export function RefCopy({ onClose }: { onClose: () => void }) {
  const { s, set, toast, projects } = useStore();
  const [srcId, setSrcId] = useState<string>('ref');
  const srcState = useMemo(() => (srcId === 'ref' ? null : peekProject(srcId)), [srcId]);
  const srcName = srcId === 'ref' ? '국도3호선 ○○교 보수공사' : srcState?.info.name ?? '';
  const srcRows = useMemo(() => (srcState ? flatten(resolveSheet(srcState.design, srcState.basis).sections.flatMap((x) => x.lines)) : null), [srcState]);
  const [checked, setChecked] = useState<Set<string>>(new Set(['R3', 'R6', 'R9']));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['RG2']));
  const [dialog, setDialog] = useState(false);
  const [target, setTarget] = useState('G13');
  const [priceMode, setPriceMode] = useState<'current' | 'keep'>('current');
  const [dupMode, setDupMode] = useState<'link' | 'new'>('link');
  const [zeroQty, setZeroQty] = useState(false);
  const rows = useMemo(() => srcRows ?? flatten(REF_PROJECT.lines), [srcRows]);
  const vis = rows.filter((r) => !r.ancestors.some((a) => collapsed.has(a)));
  const picked = rows.filter((r) => checked.has(r.line.id) && !r.line.children).map((r) => r.line);
  const targets = flatten(s.design.sections[0].lines).filter((r) => r.line.children);
  useEffect(() => { if (!targets.some((t) => t.line.id === target) && targets.length) setTarget(targets[targets.length - 1].line.id); }, [targets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  /** 내 다른 공사에서 붙이기 — 근거는 번호를 새로 매겨 함께 옮긴다 */
  const importFromProject = (withBasis: boolean) => {
    if (!srcState) return;
    const refs = [...new Set(picked.map((l) => l.ref).filter((x): x is string => !!x))];
    const r = withBasis ? importBasis(srcState.basis, s.basis, refs) : null;
    const items: Line[] = picked.map((l) => ({
      ...l, id: newId('r'), qty: zeroQty ? 0 : l.qty, note: `참고: ${srcName}`,
      ref: withBasis && l.ref ? r!.map.get(l.ref) ?? l.ref : undefined, link: withBasis && !!l.ref && !!l.link,
    }));
    set((st) => ({ ...st, design: insertAfter(st.design, target, items), basis: r ? r.basis : st.basis }));
    toast(r ? `${items.length}줄을 붙였습니다 — 호표 ${r.counts.units} · 단산 ${r.counts.calcs} · 견적 ${r.counts.quotes} · 노임 ${r.counts.wages} · 자재 ${r.counts.mats}개를 함께 가져왔습니다` : `${items.length}줄만 복사했습니다 (단가는 값으로)`);
    onClose();
  };

  // 연결된 근거 모으기
  const deps = useMemo(() => {
    const units = new Set<string>(), calcs = new Set<string>(), labor = new Set<string>(), mat = new Set<string>();
    const walk = (ref: string) => {
      const b = REF_BASIS[ref];
      if (!b) return;
      (b.kind === 'unit' ? units : calcs).add(ref);
      b.labor.forEach((x) => labor.add(x));
      b.material.forEach((x) => mat.add(x));
      b.deps.forEach(walk);
    };
    picked.forEach((l) => l.ref && walk(l.ref));
    return { units: [...units], calcs: [...calcs], labor: [...labor], mat: [...mat] };
  }, [picked]);

  const startNo = nextUnitNo(s.basis.units);
  const renumber = new Map<string, string>(deps.units.map((u, i) => [u, `제${startNo + i}호표`]));
  const calcStart = Math.max(0, ...s.basis.calcs.map((c) => Number(c.no.replace(/\D/g, '')) || 0)) + 1;
  const calcNo = new Map<string, string>(deps.calcs.map((c, i) => [c, `단산${calcStart + i}`]));
  const laborConflict = deps.labor.filter((x) => CURRENT_LABOR[x]);
  const matLinked = deps.mat.filter((x) => CURRENT_MATERIAL.includes(x));
  const total = deps.units.length + deps.calcs.length + deps.labor.length + deps.mat.length;
  const linked = (dupMode === 'link' ? laborConflict.length + matLinked.length : 0);

  const doImport = (withBasis: boolean) => {
    const items: Line[] = picked.map((l) => {
      let lu = l.lu;
      if (withBasis && priceMode === 'current') lu = floor(l.lu * LABOR_INDEX);
      const ref = l.ref ? (renumber.get(l.ref) ?? calcNo.get(l.ref) ?? l.ref) : undefined;
      const isUnit = !!(l.ref && (renumber.has(l.ref) || calcNo.has(l.ref)));
      return { ...l, id: newId('r'), qty: zeroQty ? 0 : l.qty, lu, ref: withBasis ? ref : undefined, link: withBasis && isUnit, note: '참고: 국도3호선 ○○교' };
    });
    set((st) => ({
      ...st,
      design: insertAfter(st.design, target, items),
      basis: withBasis ? {
        ...st.basis,
        units: [
          ...st.basis.units,
          ...deps.units.map((u): UnitDef => {
            const b = REF_BASIS[u];
            const lf = priceMode === 'current' ? LABOR_INDEX : 1;
            const no = renumber.get(u)!;
            const lines: ULine[] = [
              { id: `${no}-l`, kind: 'fixed', col: 'l', name: '노무비 (참고 호표)', spec: '', unit: '식', qty: 1, amt: floor(b.l * lf) },
              { id: `${no}-m`, kind: 'fixed', col: 'm', name: '재료비 (참고 호표)', spec: '', unit: '식', qty: 1, amt: b.m },
              { id: `${no}-e`, kind: 'fixed', col: 'e', name: '경비 (참고 호표)', spec: '', unit: '식', qty: 1, amt: b.e },
            ].filter((x) => x.amt) as ULine[];
            return { no, name: b.name, spec: b.spec, unit: b.unit, lines, from: `국도3호선 ○○교 ${u}${priceMode === 'keep' ? ' · 참고 단가(2022상)' : ' · 노임 2026하 적용'}` };
          }),
        ],
        calcs: [
          ...st.basis.calcs,
          ...deps.calcs.map((c) => {
            const b = REF_BASIS[c];
            const lf = priceMode === 'current' ? LABOR_INDEX : 1;
            return { no: calcNo.get(c)!, name: b.name, unit: b.unit, l: floor(b.l * lf), m: b.m, e: b.e };
          }),
        ],
      } : st.basis,
    }));
    toast(withBasis ? `${items.length}줄과 근거 ${total}개를 가져왔습니다 (새로 추가 ${total - linked} · 기존 연결 ${linked})` : `${items.length}줄만 복사했습니다 — 근거 연결은 없습니다`);
    setDialog(false);
    onClose();
  };

  return (
    <>
      <Win title={`참고 내역서 — ${srcName} (읽기 전용)`} onClose={onClose} w={860} h={760} x={Math.max(10, window.innerWidth - 880)} y={130} float modal={false}
        buttons={<>
          <span className="grow" style={{ color: '#1F2329', fontSize: 12.5 }}>선택 <b>{picked.length}줄</b>{srcState ? <> · 연결 근거 {new Set(picked.map((l) => l.ref).filter(Boolean)).size}개 (안의 호표·단산·노임·자재까지 함께 옮깁니다)</> : <> · 함께 가져올 근거: 일위대가 {deps.units.length} · 단가산출 {deps.calcs.length} · 기계경비 0 · 자재 {deps.mat.length} · 노임 {deps.labor.length}</>}</span>
          <button type="button" className="btn" disabled={!picked.length} onClick={() => (srcState ? importFromProject(false) : doImport(false))}>줄만 복사</button>
          <button type="button" className="btn pri" disabled={!picked.length} onClick={() => (srcState ? importFromProject(true) : setDialog(true))}>근거와 함께 붙이기{srcState ? '' : '…'}</button>
        </>}>
        <div className="ib" style={{ gap: 6 }}>
          <label><span className="k">공사</span>
            <select value={srcId} onChange={(e) => { setSrcId(e.target.value); setChecked(new Set()); setCollapsed(new Set()); }} style={{ maxWidth: 260 }}>
              <option value="ref">국도3호선 ○○교 보수공사 (참고 예시)</option>
              {projects.filter((p) => p.id !== s.info.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <span className="k">설계내역서</span>
          <button type="button" className="vb" onClick={() => setCollapsed(new Set())}>모두 펼침</button>
          <button type="button" className="vb" onClick={() => setCollapsed(new Set(rows.filter((r) => r.line.children && r.depth >= 1).map((r) => r.line.id)))}>공종까지</button>
          <div style={{ flex: 1 }} />
          <label><span className="k">붙일 위치</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((r) => <option key={r.line.id} value={r.line.id}>{r.line.mark} {r.line.name} 아래</option>)}
            </select>
          </label>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="f" style={{ width: '100%' }}>
            <thead><tr><th>선택</th><th>L</th><th>품 명</th><th>규 격</th><th>단위</th><th>수 량</th><th>합계 단가</th><th>연결 근거</th></tr></thead>
            <tbody>
              {vis.map((r) => {
                const l = r.line;
                const g = !!l.children;
                const leafIds = g ? flatten(l.children!).map((x) => x.line.id) : [l.id];
                const all = leafIds.every((x) => checked.has(x));
                const b = l.ref ? REF_BASIS[l.ref] : undefined;
                return (
                  <tr key={l.id} className={(g ? 'g ' : '') + (!g && checked.has(l.id) ? 'sel' : '')}>
                    <td className="c"><input type="checkbox" checked={all} aria-label={l.name} onChange={() => setChecked((c) => { const n = new Set(c); leafIds.forEach((x) => (all ? n.delete(x) : n.add(x))); if (g) all ? n.delete(l.id) : n.add(l.id); return n; })} /></td>
                    <td className="c">{l.level || ''}</td>
                    <td style={{ paddingLeft: 6 + r.depth * 14 }}>
                      {g && <button type="button" className="tg" onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })}>{collapsed.has(l.id) ? '▸' : '▾'}</button>}
                      {l.mark} {l.name}
                    </td>
                    <td>{l.spec}</td><td className="c">{l.unit}</td><td className="n">{g ? '' : l.qty.toLocaleString()}</td>
                    <td className="n">{g ? '' : won(l.lu + l.mu + l.eu)}</td>
                    <td>{l.ref && <span className="lk">{l.ref}</span>}{!srcState && b && b.deps.length > 0 && <> → {b.kind === 'unit' ? '일위 ' : ''}{b.deps.map((d) => d.replace(/제|호표/g, '')).join('·')}</>}{!srcState && b && b.deps.length === 0 && b.kind === 'calc' && ' → 노임·자재'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!srcState && picked[0]?.ref && REF_BASIS[picked[0].ref] && (
            <div className="calc" style={{ margin: '10px 12px', fontFamily: 'inherit' }}>
              <b>{picked[0].name}</b>의 연결 근거 — {REF_BASIS[picked[0].ref].name}
              {REF_BASIS[picked[0].ref].deps.length > 0 && <> 안에 {REF_BASIS[picked[0].ref].deps.map((d) => `${d}(${REF_BASIS[d].name})`).join('·')}가 들어 있고,</>} 노임 {collect(picked[0].ref).labor.length}종 · 자재 {collect(picked[0].ref).material.length}종이 연결되어 있습니다.
            </div>
          )}
        </div>
      </Win>

      {dialog && (
        <Win title="연결 데이터 함께 가져오기 — 국도3호선 ○○교 보수공사 → 국도43호선 용암교 보수공사" onClose={() => setDialog(false)} w={1140} h={840}
          buttons={<>
            <span className="grow">추가 {total - linked}개 · 기존 연결 {linked}개 · 단가 입력 필요 {deps.mat.length - matLinked.length}개 (자재)</span>
            <button type="button" className="btn" onClick={() => setDialog(false)}>이전</button>
            <button type="button" className="btn" onClick={() => { setDialog(false); onClose(); }}>취소</button>
            <button type="button" className="btn pri" onClick={() => doImport(true)}>가져오기</button>
          </>}>
          <div className="body">
            <main className="main pad">
              <h2>붙일 줄 {picked.length}개</h2>
              <table className="f" style={{ width: '100%' }}>
                <thead><tr><th>품 명</th><th>규 격</th><th>단위</th><th>수 량</th><th>바로 연결된 근거</th><th>그 아래 연결</th></tr></thead>
                <tbody>{picked.map((l) => {
                  const b = l.ref ? REF_BASIS[l.ref] : undefined;
                  const all = l.ref ? collect(l.ref) : { labor: [], material: [] };
                  return <tr key={l.id}><td>{l.name}</td><td>{l.spec}</td><td className="c">{l.unit}</td><td className="n">{zeroQty ? 0 : l.qty.toLocaleString()}</td><td>{l.ref ?? '—'}</td><td>{b ? [b.deps.length ? `일위 ${b.deps.map((d) => d.replace(/제|호표/g, '')).join('·')}호표` : '', `노임 ${all.labor.length}`, `자재 ${all.material.length}`].filter(Boolean).join(', ') : ''}</td></tr>;
                })}</tbody>
              </table>
              <h2>함께 가져올 근거 {total}개 · 겹치는 것 {deps.units.length + deps.calcs.length + laborConflict.length + matLinked.length}개</h2>
              <table className="f" style={{ width: '100%' }}>
                <thead><tr><th>참고 내역서</th><th>현재 공사</th><th>처 리</th></tr></thead>
                <tbody>
                  <tr className="sum"><td colSpan={3}>일위대가 {deps.units.length}</td></tr>
                  {deps.units.map((u) => {
                    const n = Number(u.replace(/\D/g, ''));
                    return <tr key={u}><td>{u} {REF_BASIS[u].name}</td><td>{n <= 18 ? <span className="cf">번호 겹침 · 현재 {u} 사용 중</span> : '없음'}</td><td>{renumber.get(u)}로 새 번호</td></tr>;
                  })}
                  <tr className="sum"><td colSpan={3}>단가산출 {deps.calcs.length} · 기계경비 0</td></tr>
                  {deps.calcs.map((c) => <tr key={c}><td>{c} {REF_BASIS[c].name}</td><td><span className="cf">번호 겹침 · 현재 {c} 사용 중</span></td><td>{calcNo.get(c)}로 새 번호</td></tr>)}
                  <tr className="sum"><td colSpan={3}>노임 {deps.labor.length}</td></tr>
                  {deps.labor.map((x) => <tr key={x}><td>{x} (2022 상반기)</td><td>{CURRENT_LABOR[x] ? <span className="cf">있음 · {won(CURRENT_LABOR[x])} (2026 하반기)</span> : '없음'}</td><td>{CURRENT_LABOR[x] ? (priceMode === 'current' ? '현재 공사 단가 사용' : '참고 단가 그대로') : '2026 하반기 노임으로 추가'}</td></tr>)}
                  <tr className="sum"><td colSpan={3}>자재 {deps.mat.length}</td></tr>
                  {deps.mat.map((x) => <tr key={x}><td>{x}</td><td>{CURRENT_MATERIAL.includes(x) ? <span className="cf">같은 자재 있음</span> : '없음'}</td><td>{CURRENT_MATERIAL.includes(x) ? (dupMode === 'link' ? '기존 자재에 연결' : '새로 추가') : '자재로 추가 · 단가 [입력]'}</td></tr>)}
                </tbody>
              </table>
            </main>
            <aside className="rp">
              <fieldset><legend>단가 처리</legend>
                <label><input type="radio" checked={priceMode === 'current'} onChange={() => setPriceMode('current')} />현재 공사 단가로 다시 계산 (노임 2026 하반기, 노무비 × {LABOR_INDEX.toFixed(4)})</label>
                <label><input type="radio" checked={priceMode === 'keep'} onChange={() => setPriceMode('keep')} />참고 내역서 단가 그대로 (비고에 출처 표시)</label>
              </fieldset>
              <fieldset><legend>같은 근거가 있을 때</legend>
                <label><input type="radio" checked={dupMode === 'link'} onChange={() => setDupMode('link')} />기존 것에 연결</label>
                <label><input type="radio" checked={dupMode === 'new'} onChange={() => setDupMode('new')} />새로 추가 (번호 새로 매김)</label>
              </fieldset>
              <fieldset><legend>붙일 위치</legend>
                <span>{targets.find((t) => t.line.id === target)?.line.name} 아래</span>
                <label><input type="checkbox" defaultChecked />레벨 맞춤</label>
                <label><input type="checkbox" checked={zeroQty} onChange={(e) => setZeroQty(e.target.checked)} />수량은 0으로 비우기</label>
              </fieldset>
              <div role="status" className="note">새 번호를 받은 호표는 내역서 줄과 상위 호표 안의 참조도 함께 바뀝니다. 붙인 뒤 전체재계산(F9)을 합니다.</div>
            </aside>
          </div>
        </Win>
      )}
    </>
  );
}
