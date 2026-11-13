import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shell, FB, Group, usePopup, Win } from '../ui/Shell';
import { useDocs } from '../docs';
import { exportXlsx } from '../xlsx';
import { sheetRows, costRows, compareRows, docBook } from '../exports';
import { useStore } from '../store';
import { useAsk } from '../ui/Ask';
import {
  flatten, won, qtyFmt, sectionAmount, unitTotal, calcPrice, quotePrice, insertAfter, removeLine, cloneLine, mapSheet, newId,
  type Line, type Sheet, type FlatRow,
} from '../engine';

type Field = 'name' | 'spec' | 'unit' | 'qty' | 'lu' | 'mu' | 'eu';

interface Row { kind: 'line' | 'ns' | 'blank'; r?: FlatRow }

/** lv: 0 = 모두, n = 레벨 n 이상 줄만 (● 3 > ○ 2 > …) */
function buildRows(sheet: Sheet, collapsed: Set<string>, lv: number): Row[] {
  const out: Row[] = [];
  for (const sec of sheet.sections) {
    for (const fr of flatten(sec.lines)) {
      if (lv > 0 && (fr.line.level || 0) < lv) continue;
      if (lv === 0 && fr.ancestors.some((a) => collapsed.has(a))) continue;
      out.push({ kind: 'line', r: fr });
    }
    if (sec.section === 'main') {
      out.push({ kind: 'blank' }, { kind: 'ns' }, { kind: 'blank' });
    } else {
      out.push({ kind: 'blank' });
    }
  }
  return out;
}

export default function Estimate() {
  const { s, set, start, design, editLine, toast } = useStore();
  const { open } = usePopup();
  const ask = useAsk();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const doc = params.get('doc') === 'start' ? 'start' : 'design';
  const sheet = doc === 'start' ? start : design;
  const editable = doc === 'design';

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string>(() => { const all = sheet.sections.flatMap((x) => flatten(x.lines)); return (all.find((r) => r.line.id === 'L18') ?? all.find((r) => !r.line.children) ?? all[0])?.line.id ?? ''; });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<{ id: string; f: Field } | null>(null);
  const [clip, setClip] = useState<Line | null>(null);
  const [find, setFind] = useState('');
  const findRef = useRef<HTMLInputElement>(null);

  const [lvView, setLvView] = useState(0);
  const rows = useMemo(() => buildRows(sheet, collapsed, lvView), [sheet, collapsed, lvView]);
  const levelsUsed = useMemo(() => new Set(sheet.sections.flatMap((x) => flatten(x.lines)).map((r) => r.line.level).filter(Boolean)), [sheet]);
  const allCount = useMemo(() => sheet.sections.reduce((n, x) => n + flatten(x.lines).length, 0), [sheet]);
  const main = sectionAmount(sheet, 'main');
  const docsAll = useDocs();
  const cost = docsAll.get(doc).cost;
  const [dlg, setDlg] = useState<null | 'pct' | 'link'>(null);


  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'F9') { e.preventDefault(); toast(`전체재계산 — 순공사비 ${won(main.t)}원 · 도급액 ${won(cost.total)}원`); }
      if (e.shiftKey && /^F[1-4]$/.test(e.key)) { e.preventDefault(); setLevel(Number(e.key[1]) as Line['level']); }
      if (e.shiftKey && e.key === 'F10') { e.preventDefault(); setLevel(0); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const needDesign = () => {
    if (!editable) { toast('착공내역서는 설계 × 낙찰률로 계산됩니다. 고칠 때는 설계내역서에서 고치세요'); return true; }
    return false;
  };
  const setLevel = (lv: Line['level']) => {
    if (needDesign()) return;
    editLine(sel, { level: lv, mark: lv === 3 ? '●' : lv === 2 ? '○' : lv === 0 ? '' : '' });
    setMenu(null);
  };
  const updateDesign = (fn: (sh: Sheet) => Sheet) => set((st) => ({ ...st, design: fn(st.design) }));
  const insertItem = () => {
    if (needDesign()) return;
    const id = newId('n');
    updateDesign((d) => insertAfter(d, sel, [{ id, level: 0, mark: '', name: '새 항목', spec: '', unit: '식', qty: 1, lu: 0, mu: 0, eu: 0 }]));
    setSel(id); setEdit({ id, f: 'name' }); setMenu(null);
  };
  const insertGroup = () => {
    if (needDesign()) return;
    const id = newId('g');
    updateDesign((d) => insertAfter(d, sel, [{ id, level: 2, mark: '○', name: '새 공종', spec: '', unit: '', qty: 0, lu: 0, mu: 0, eu: 0, children: [] }]));
    setSel(id); setEdit({ id, f: 'name' });
  };
  /** 고른 줄이 들어 있는 공종 (공종을 골랐으면 그 공종) */
  const groupOfSel = () => {
    const all = s.design.sections.flatMap((x) => flatten(x.lines));
    const r = all.find((x) => x.line.id === sel);
    if (!r) return null;
    if (r.line.children) return r.line;
    const pid = r.ancestors[r.ancestors.length - 1];
    return all.find((x) => x.line.id === pid)?.line ?? null;
  };
  const addPct = (o: { name: string; pct: number; of: 'l' | 'm' | 'e' | 't'; to: 'l' | 'm' | 'e' }) => {
    const g = groupOfSel();
    if (!g) { toast('잡비를 넣을 공종이나 그 안의 항목을 먼저 고르세요'); return; }
    const id = newId('p');
    const of = { l: '노무비', m: '재료비', e: '경비', t: '합계' }[o.of];
    updateDesign((d) => mapSheet(d, (x) => (x.id === g.id ? { ...x, children: [...(x.children ?? []), { id, level: 0, mark: '', name: o.name, spec: `${of}의 ${o.pct}%`, unit: '식', qty: 1, lu: 0, mu: 0, eu: 0, pct: { of: o.of, pct: o.pct, to: o.to } }] } : x)));
    setSel(id);
    toast(`[${g.name}]에 ${o.name}(${of}의 ${o.pct}%)을 넣었습니다 — 공종 안 항목이 바뀌면 같이 다시 계산됩니다`);
  };
  const linkRef = (ref: string, asExpense: boolean) => {
    if (needDesign()) return;
    editLine(sel, { ref: ref || undefined, link: !!ref, asExpense: asExpense || undefined });
    toast(ref ? `${ref}에 연결했습니다 — 단가를 근거에서 가져옵니다` : '연결을 풀었습니다');
  };
  const del = () => {
    if (needDesign()) return;
    updateDesign((d) => removeLine(d, sel)); setMenu(null); toast('줄을 지웠습니다');
  };
  const copy = () => {
    const l = flatten(sheet.sections.flatMap((x) => x.lines)).find((r) => r.line.id === sel)?.line;
    if (l) { setClip(l); toast(`복사: ${l.name}`); }
    setMenu(null);
  };
  const paste = () => {
    if (needDesign() || !clip) return;
    const c = cloneLine(clip);
    updateDesign((d) => insertAfter(d, sel, [c])); setSel(c.id); setMenu(null);
  };
  const commit = (id: string, f: Field, v: string) => {
    const num = ['qty', 'lu', 'mu', 'eu'].includes(f);
    const val = num ? Number(v.replace(/[^0-9.\-]/g, '')) || 0 : v;
    const cur = flatten(design.sections.flatMap((x) => x.lines)).find((r) => r.line.id === id)?.line;
    const priceField = ['lu', 'mu', 'eu'].includes(f);
    if (priceField && cur?.link) {
      // 근거 연결을 풀고, 지금 보이는 단가를 직접 단가로 고정
      editLine(id, { link: false, lu: cur.lu, mu: cur.mu, eu: cur.eu, [f]: val } as Partial<Line>);
      toast(`${cur.ref} 연결을 풀고 직접 넣은 단가로 바꿨습니다`);
    } else editLine(id, { [f]: val } as Partial<Line>);
    setEdit(null);
  };
  const doFind = () => {
    if (!find) return;
    const hit = sheet.sections.flatMap((x) => flatten(x.lines)).find((r) => r.line.name.includes(find) || r.line.spec.includes(find));
    if (hit) {
      setCollapsed(new Set([...collapsed].filter((c) => !hit.ancestors.includes(c))));
      setSel(hit.line.id);
      setTimeout(() => document.getElementById('row-' + hit.line.id)?.scrollIntoView({ block: 'center' }), 0);
    } else toast(`'${find}'을(를) 찾지 못했습니다`);
  };

  let no = 0;
  const cell = (fr: FlatRow, f: Field, text: string, cls: string) => {
    const isEd = edit && edit.id === fr.line.id && edit.f === f;
    if (isEd) {
      const raw = f === 'qty' ? String(fr.line.qty) : ['lu', 'mu', 'eu'].includes(f) ? String(fr.line[f as 'lu']) : String(fr.line[f as 'name']);
      return (
        <div className={cls}>
          <input className="cell" autoFocus defaultValue={raw}
            onBlur={(e) => commit(fr.line.id, f, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEdit(null); }} />
        </div>
      );
    }
    return (
      <div className={cls} onDoubleClick={() => {
        if (needDesign()) return;
        if (fr.line.children && !['name', 'spec'].includes(f)) return;
        setEdit({ id: fr.line.id, f });
      }}>{text}</div>
    );
  };

  return (
    <Shell
      doc={`${doc === 'start' ? '착공내역서' : '설계내역서'} : ${s.info.name}`}
      toolbar={<>
        <Group label="기초자료 불러오기">
          <FB icon="labor" label="노임" title="노임단가" to="/labor" />
          <FB icon="material" label="자재" title="자재단가" to="/material" />
          <FB icon="machine" label="장비" title="기계경비" to="/machine" />
          <FB icon="calc" label="단가" title="단가산출" to="/calc" />
          <FB icon="unit" label="일위" title="일위대가" to="/unit" />
          <FB icon="market" label="표준" title="표준시장단가 검색 (팝업)" onClick={() => open('market')} />
          <FB icon="quote" label="견적" title="견적단가" to="/quote" />
        </Group>
        <Group label="자료 관리">
          <FB icon="folder" label="공종" title="공종 넣기" onClick={insertGroup} />
          <FB icon="docs" label="내역서" title="참고 내역서 열기 (별도 창, 근거와 함께 복사)" onClick={() => open('refcopy')} />
          <FB icon="link" label="근거 연결" title="고른 항목을 일위대가·단가산출·견적단가에 연결" onClick={() => { if (!needDesign()) setDlg('link'); }} />
          <FB icon="book" label="품셈" title="표준품셈 검색 (팝업)" onClick={() => open('pumsem')} />
          <FB icon="search" label="통합검색" onClick={() => findRef.current?.focus()} />
        </Group>
        <Group label="계산">
          <FB icon="net" label="순공사비 계산" onClick={() => toast(`순공사비 ${won(main.t)}원 (노무 ${won(main.l)} · 재료 ${won(main.m)} · 경비 ${won(main.e)})`)} />
          <FB icon="pct" label="잡비" title="공종 안 항목 금액의 % 로 잡비 줄 넣기" onClick={() => { if (!needDesign()) setDlg('pct'); }} />
          <FB icon="bid" label="낙찰" title="낙찰률 적용 → 착공내역서" onClick={async () => {
            const v = await ask({ title: '낙찰률 적용', label: '낙찰률(%)을 넣으세요. 착공내역서 단가 = 설계 단가 × 낙찰률 (비목별 원 미만 버림)', value: String(+(s.bidRate * 100).toFixed(4)) });
            if (v && +v > 0) { set((st) => ({ ...st, bidRate: +v / 100 })); setParams({ doc: 'start' }); toast(`낙찰률 ${v}% 적용 — 착공내역서로 바꿨습니다`); }
          }} />
          <FB icon="recalc" label="재계산" title="일건서류 전체 재계산 (F9)" primary onClick={() => toast(`전체재계산 — 순공사비 ${won(main.t)}원 · 도급액 ${won(cost.total)}원`)} />
        </Group>
        <Group label="편집">
          <FB icon="insert" label="삽입" title="줄 삽입 (Insert)" onClick={insertItem} />
          <FB icon="del" label="삭제" title="줄 삭제" onClick={del} />
        </Group>
        <Group label="차수공사">
          <FB icon="phase" label="차수분개" title="차수공사 분개" to="/phase" />
        </Group>
        <Group label="출력">
          <FB icon="excel" label="엑셀" title="내역서 + 원가계산서" onClick={() => exportXlsx(`${doc === 'start' ? '착공' : '설계'}내역서 — ${s.info.name}.xlsx`, docBook(doc === 'start' ? '착공내역서' : '설계내역서', sheet, cost)).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다'))} />
        </Group>
      </>}
      info={<>
        <div className="vg" role="group" aria-label="펼침 단계">
          <button type="button" className={'vb' + (lvView === 0 ? ' on' : '')} onClick={() => { setLvView(0); setCollapsed(new Set()); }}>모두 펼침</button>
          {[4, 3, 2, 1].map((n) => (
            <button key={n} type="button" className={'vb' + (lvView === n ? ' on' : '')} disabled={!levelsUsed.has(n as Line['level'])}
              title={levelsUsed.has(n as Line['level']) ? `L ${n} 이상인 줄만 보기` : `L ${n}로 지정한 줄이 없습니다`}
              onClick={() => setLvView(n)}>레벨 {n}</button>
          ))}
        </div>
        <label>문서
          <select value={doc} style={{ fontWeight: 700 }} onChange={(e) => {
            const v = e.target.value;
            if (v === 'design' || v === 'start') setParams({ doc: v });
            else nav(v);
          }}>
            <option value="design">설계내역서</option>
            <option value="start">착공내역서</option>
            {s.phaseOn && <option value="/phase">차수별 내역서 …</option>}
            {s.progressOn && <option value="/progress">기성내역서 …</option>}
            <option value="/sub">하도급내역서 …</option>
          </select>
        </label>
        <Link to="/project" style={{ fontSize: 12 }}>내역서 체계 보기</Link>
        <span className="k">{doc === 'start' ? `낙찰률 ${+(s.bidRate * 100).toFixed(3)}% 적용 · 읽기 전용` : '낙찰률 미적용 · 칸을 두 번 누르면 고칩니다'}</span>
        <div style={{ flex: 1 }} />
        <label><span className="k">찾기</span>
          <input ref={findRef} type="text" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doFind()} placeholder="품명·규격" style={{ width: 150, padding: '0 6px' }} />
        </label>
        <span className="k">단가 기준 2026년 하반기</span>
      </>}
      footer={<>
        <span>줄 {sel}</span>
        <span>표시 {rows.filter((r) => r.kind === 'line').length} / {allCount}줄</span>
        <span>순공사비 {won(main.t)}</span>
        <span>도급액 {won(cost.total)}</span>
        <span style={{ marginLeft: 'auto' }}>Shift+F1~F4 레벨 · Shift+F10 해제 · F9 재계산 · 오른쪽 클릭 팝업메뉴</span>
      </>}
    >
      <div className="grid" role="grid" aria-label="내역서" onClick={() => setMenu(null)}>
        <div className="cols hd" role="row">
          <div className="g" style={{ gridRow: '1 / 3', gridColumn: 1, height: 'auto' }} />
          <div className="lv" style={{ gridRow: '1 / 3', gridColumn: 2, height: 'auto' }}>L</div>
          <div style={{ gridRow: '1 / 3', gridColumn: 3, height: 'auto' }}>공종</div>
          <div style={{ gridRow: '1 / 3', gridColumn: 4, height: 'auto' }}>품    명</div>
          <div style={{ gridRow: '1 / 3', gridColumn: 5, height: 'auto' }}>규   격</div>
          <div style={{ gridRow: '1 / 3', gridColumn: 6, height: 'auto' }}>수 량</div>
          <div style={{ gridRow: '1 / 3', gridColumn: 7, height: 'auto' }}>단위</div>
          <div style={{ gridRow: 1, gridColumn: '8 / 10' }}>합    계</div>
          <div style={{ gridRow: 1, gridColumn: '10 / 12' }}>노무비</div>
          <div style={{ gridRow: 1, gridColumn: '12 / 14' }}>재료비</div>
          <div style={{ gridRow: 1, gridColumn: '14 / 16' }}>경    비</div>
          <div style={{ gridRow: '1 / 3', gridColumn: 16, height: 'auto' }}>비    고</div>
          {[8, 10, 12, 14].map((c) => <div key={c} style={{ gridRow: 2, gridColumn: c }}>단  가</div>)}
          {[9, 11, 13, 15].map((c) => <div key={c} style={{ gridRow: 2, gridColumn: c }}>금   액</div>)}
        </div>
        {rows.map((row, i) => {
          if (row.kind === 'blank') return <div key={'b' + i} className="cols r">{Array.from({ length: 16 }, (_, k) => <div key={k} className={k === 0 ? 'g' : k === 1 ? 'lv' : ''} />)}</div>;
          if (row.kind === 'ns') {
            return (
              <div key="ns" className="cols r ns">
                <div className="g" /><div className="lv" /><div /><div style={{ textAlign: 'center', letterSpacing: '.5em' }}>순 공 사 비</div><div /><div /><div /><div />
                <div className="n">{won(main.t)}</div><div /><div className="n">{won(main.l)}</div><div /><div className="n">{won(main.m)}</div><div /><div className="n">{won(main.e)}</div><div />
              </div>
            );
          }
          const fr = row.r!;
          const l = fr.line;
          const grp = !!l.children;
          const a = fr.amount;
          no += 1;
          const isOpen = !collapsed.has(l.id);
          return (
            <div key={l.id} id={'row-' + l.id} className={'cols r' + (sel === l.id ? ' sel' : '')} role="row"
              onClick={(e) => { e.stopPropagation(); setSel(l.id); setMenu(null); }}
              onContextMenu={(e) => { e.preventDefault(); setSel(l.id); setMenu({ x: Math.min(e.clientX, window.innerWidth - 260), y: Math.min(e.clientY, window.innerHeight - 470) }); }}>
              <div className="g">{no}</div>
              <div className="lv">{l.level || ''}</div>
              <div className="c">{l.mark}</div>
              {grp ? (
                <div className="b" style={{ paddingLeft: 2 + fr.depth * 10 }} onDoubleClick={() => !needDesign() && setEdit({ id: l.id, f: 'name' })}>
                  <button type="button" className="tg" aria-expanded={isOpen} aria-label={(isOpen ? '접기: ' : '펼치기: ') + l.name}
                    onClick={(e) => { e.stopPropagation(); if (lvView) { setLvView(0); setCollapsed(new Set()); return; } const n = new Set(collapsed); if (isOpen) n.add(l.id); else n.delete(l.id); setCollapsed(n); }}>{isOpen && !lvView ? '▾' : '▸'}</button>
                  {edit && edit.id === l.id && edit.f === 'name'
                    ? <input className="cell" style={{ width: 'calc(100% - 26px)' }} autoFocus defaultValue={l.name} onBlur={(e) => commit(l.id, 'name', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                    : l.name}
                </div>
              ) : cell(fr, 'name', l.name, 'it')}
              {cell(fr, 'spec', l.spec, '')}
              {grp ? <div className="n" /> : cell(fr, 'qty', qtyFmt(l.qty), 'n')}
              {grp ? <div className="c" /> : cell(fr, 'unit', l.unit, 'c')}
              <div className="n">{grp ? '' : won(unitTotal(l))}</div>
              <div className="n">{won(a.t)}</div>
              {grp ? <div className="n" /> : cell(fr, 'lu', won(l.lu), 'n')}
              <div className="n">{won(a.l)}</div>
              {grp ? <div className="n" /> : cell(fr, 'mu', won(l.mu), 'n')}
              <div className="n">{won(a.m)}</div>
              {grp ? <div className="n" /> : cell(fr, 'eu', won(l.eu), 'n')}
              <div className="n">{won(a.e)}</div>
              <div>{l.ref && <Link className="lk" style={l.link ? undefined : { opacity: .5, textDecoration: 'line-through' }} title={l.link ? `${l.ref}에 연결 — 근거를 고치면 단가가 바뀝니다` : '연결 해제 (직접 단가)'} to={l.ref.startsWith('단산') ? `/calc#${l.ref}` : l.ref.startsWith('견적') ? '/quote' : `/unit?no=${l.ref}`} onClick={(e) => e.stopPropagation()}>{l.ref}</Link>}</div>
            </div>
          );
        })}
      </div>
      {menu && (
        <div className="pm" role="menu" aria-label="팝업메뉴" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => { setEdit({ id: sel, f: 'name' }); setMenu(null); }}>고치기<span>더블클릭</span></button>
          <hr />
          {[1, 2, 3, 4].map((n) => <button key={n} type="button" role="menuitem" onClick={() => setLevel(n as Line['level'])}>레벨 {n}<span>Shift+F{n}</span></button>)}
          <button type="button" role="menuitem" onClick={() => setLevel(0)}>레벨 해제<span>Shift+F10</span></button>
          <hr />
          <button type="button" role="menuitem" onClick={copy}>복사<span>Ctrl+C</span></button>
          <button type="button" role="menuitem" disabled={!clip} onClick={paste}>붙여넣기<span>Ctrl+V</span></button>
          <button type="button" role="menuitem" onClick={insertItem}>줄 삽입<span>Insert</span></button>
          <button type="button" role="menuitem" onClick={del}>블록 삭제<span>Ctrl+Del</span></button>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); if (!needDesign()) setDlg('link'); }}>근거 연결 (호표·단산·견적)…<span /></button>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); if (!needDesign()) setDlg('pct'); }}>잡비 줄 넣기…<span /></button>
          <hr />
          <button type="button" role="menuitem" onClick={() => { setMenu(null); open('refcopy'); }}>다른 내역서에서 복사<span>창</span></button>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); open('pumsem'); }}>표준품셈 검색<span>팝업</span></button>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); open('market'); }}>표준시장단가 검색<span>팝업</span></button>
          <hr />
          <button type="button" role="menuitem" style={{ fontWeight: 700 }} onClick={() => nav('/phase')}>차수 배정 ▸<span>Ctrl+Shift+D</span></button>
          <button type="button" role="menuitem" onClick={() => {
            if (needDesign()) return;
            set((st) => ({ ...st, design: mapSheet(st.design, (x) => (x.id === sel && !x.children ? (x.link ? { ...x, asExpense: true } : { ...x, eu: x.eu + x.mu, mu: 0 }) : x)) }));
            setMenu(null); toast('재료비를 경비성 단가로 옮겼습니다');
          }}>경비성 단가 지정<span /></button>
        </div>
      )}
      {dlg === 'pct' && <PctDialog onClose={() => setDlg(null)} onOk={(o) => { setDlg(null); addPct(o); }} />}
      {dlg === 'link' && <LinkDialog cur={flatten(s.design.sections.flatMap((x) => x.lines)).find((r) => r.line.id === sel)?.line} onClose={() => setDlg(null)} onOk={(r, e) => { setDlg(null); linkRef(r, e); }} />}
    </Shell>
  );
}

function PctDialog({ onClose, onOk }: { onClose: () => void; onOk: (o: { name: string; pct: number; of: 'l' | 'm' | 'e' | 't'; to: 'l' | 'm' | 'e' }) => void }) {
  const [name, setName] = useState('공구손료');
  const [pct, setPct] = useState('3');
  const [of, setOf] = useState<'l' | 'm' | 'e' | 't'>('l');
  const [to, setTo] = useState<'l' | 'm' | 'e'>('e');
  return (
    <Win title="잡비 줄 넣기" onClose={onClose} w={460} h={330}
      buttons={<><span className="grow" /><button type="button" className="btn" onClick={onClose}>취소</button><button type="button" className="btn pri" onClick={() => onOk({ name: name.trim() || '잡비', pct: Number(pct) || 0, of, to })}>넣기</button></>}>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, alignItems: 'center' }}>
        <label htmlFor="pc-n">품명</label><input id="pc-n" type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ height: 26 }} />
        <span>기준</span>
        <div>같은 공종 안 항목의 <select value={of} onChange={(e) => setOf(e.target.value as typeof of)}><option value="l">노무비</option><option value="m">재료비</option><option value="e">경비</option><option value="t">합계</option></select> ×
          <input type="text" value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 60, height: 24, textAlign: 'right', marginLeft: 6 }} /> %</div>
        <span>넣을 비목</span>
        <select value={to} onChange={(e) => setTo(e.target.value as typeof to)} style={{ height: 26, width: 140 }}><option value="l">노무비</option><option value="m">재료비</option><option value="e">경비</option></select>
      </div>
      <div className="hint" style={{ padding: '0 16px' }}>공구손료·잡재료비처럼 공종 안 다른 항목 금액의 비율로 계산되는 줄입니다. 항목이 바뀌면 같이 다시 계산됩니다.</div>
    </Win>
  );
}

function LinkDialog({ cur, onClose, onOk }: { cur?: Line; onClose: () => void; onOk: (ref: string, asExpense: boolean) => void }) {
  const { s, units } = useStore();
  const [ref, setRef] = useState(cur?.ref ?? '');
  const [asExp, setAsExp] = useState(!!cur?.asExpense);
  const [q, setQ] = useState(cur?.name ?? '');
  const opts = [
    ...s.basis.units.map((u) => { const t = units.get(u.no)?.total; return { ref: u.no, kind: '일위대가', name: `${u.name} ${u.spec}`.trim(), unit: u.unit, price: t ? t.l + t.m + t.e : 0 }; }),
    ...s.basis.calcs.map((c) => { const p = calcPrice(s.basis, c); return { ref: c.no, kind: '단가산출', name: c.name, unit: c.unit, price: p.l + p.m + p.e }; }),
    ...(s.basis.quotes ?? []).map((x) => ({ ref: x.no, kind: '견적단가', name: `${x.name} ${x.spec}`.trim(), unit: x.unit, price: quotePrice(x) })),
  ];
  const words = q.trim().split(/\s+/).filter(Boolean);
  const shown = opts.filter((o) => !words.length || words.some((w) => o.name.includes(w) || o.ref.includes(w)));
  return (
    <Win title={`근거 연결 — ${cur?.name ?? ''}`} onClose={onClose} w={760} h={560}
      buttons={<>
        <label className="grow"><input type="checkbox" checked={asExp} onChange={(e) => setAsExp(e.target.checked)} /> 근거 합계를 경비로 (중기운반 등)</label>
        <button type="button" className="btn" onClick={() => onOk('', false)}>연결 풀기</button>
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="button" className="btn pri" disabled={!ref} onClick={() => onOk(ref, asExp)}>연결</button>
      </>}>
      <div className="ib"><label><span className="k">찾기</span><input type="text" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} /></label><span className="k">{shown.length} / {opts.length}건 · 없으면 일위대가나 단가산출에서 먼저 만드세요</span></div>
      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th>근거</th><th>구분</th><th>품명 · 규격</th><th>단위</th><th>단가</th></tr></thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.ref} className={'click' + (ref === o.ref ? ' sel' : '')} onClick={() => setRef(o.ref)} onDoubleClick={() => onOk(o.ref, asExp)}>
                <td className="c"><span className="lk">{o.ref}</span></td><td className="c">{o.kind}</td><td>{o.name}</td><td className="c">{o.unit}</td><td className="n">{won(o.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!opts.length && <div className="note">이 공사에는 아직 일위대가·단가산출이 없습니다. [기초자료] 탭에서 일위대가나 단가산출을 만든 뒤 연결하세요.</div>}
      </div>
    </Win>
  );
}
