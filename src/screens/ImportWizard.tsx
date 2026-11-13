import { useMemo, useState } from 'react';
import { Win } from '../ui/Shell';
import { useAsk } from '../ui/Ask';
import { useStore, blankState, type State } from '../store';
import { won } from '../engine';
import {
  readBook, guessKind, defaultCfg, autoMap, colNames, parseSheet, combine, pickFile, colLetter,
  FIELDS, KIND_LABEL, RULE_LABEL, type Book, type SheetCfg, type SheetKind, type Rule,
} from '../importXlsx';

const KINDS: SheetKind[] = ['skip', 'nae', 'chong', 'unit', 'unitSum', 'calcSum', 'machSum', 'mat', 'labor', 'cost'];
const PREVIEW_HEAD: Partial<Record<SheetKind, string[]>> = {
  nae: ['품명', '규격', '수량', '단위', '노무 단가', '재료 단가', '경비 단가'],
  unit: ['품명', '규격', '수량', '단위', '노무 단가', '재료 단가', '경비 단가'],
  unitSum: ['품명', '규격', '단위', '노무비', '재료비', '경비'], calcSum: ['품명', '규격', '단위', '노무비', '재료비', '경비'], machSum: ['품명', '규격', '단위', '노무비', '재료비', '경비'],
  mat: ['품명', '규격', '단위', '단가'], labor: ['직종', '노임'], cost: ['비목', '요율'], chong: ['품명', '합계'],
};

/** 엑셀 가져오기 — 시트마다 종류를 정하고, 열을 항목에 맞춘 뒤 결과를 미리 보고 가져온다 */
export default function ImportWizard({ onClose, onDone, initial }: { onClose: () => void; onDone?: (id?: string) => void; initial?: { name: string; buf: ArrayBuffer } }) {
  const { s, set, toast, createProject } = useStore();
  const ask = useAsk();
  const [book, setBook] = useState<Book | null>(() => (initial ? readBook(initial.name, initial.buf) : null));
  const [cfgs, setCfgs] = useState<SheetCfg[]>(() => (book ? book.sheets.map((x) => defaultCfg(x.rows, guessKind(x.name, x.rows))) : []));
  const [sel, setSel] = useState(() => Math.max(0, cfgs.findIndex((c) => c.kind === 'nae')));
  const [tab, setTab] = useState<'raw' | 'result'>('raw');
  const [target, setTarget] = useState<'new' | 'cur'>('new');
  const [info, setInfo] = useState({ name: initial ? initial.name.replace(/\.(xlsx?|xlsm)$/i, '') : '', client: '', kind: '도로', rate: '88.000' });
  const [err, setErr] = useState('');

  const open = async () => {
    const f = await pickFile('.xlsx,.xls,.xlsm');
    if (!f) return;
    try {
      const b = readBook(f.name, f.buf);
      const c = b.sheets.map((x) => defaultCfg(x.rows, guessKind(x.name, x.rows)));
      setBook(b); setCfgs(c); setSel(Math.max(0, c.findIndex((x) => x.kind === 'nae'))); setErr('');
      if (!info.name) setInfo((v) => ({ ...v, name: f.name.replace(/\.(xlsx?|xlsm)$/i, '') }));
    } catch {
      setErr('엑셀 파일을 읽지 못했습니다 (암호가 걸렸거나 손상된 파일일 수 있습니다)');
    }
  };

  const sh = book?.sheets[sel];
  const cfg = cfgs[sel];
  const upd = (patch: Partial<SheetCfg>) => setCfgs((cs) => cs.map((c, i) => {
    if (i !== sel) return c;
    const n = { ...c, ...patch };
    if (patch.kind !== undefined && patch.kind !== c.kind) return defaultCfg(book!.sheets[i].rows, patch.kind);
    if ((patch.head !== undefined || patch.head2 !== undefined) && book) {
      n.map = autoMap(n.kind, book.sheets[i].rows, n.head, n.head2);
      if (patch.head !== undefined || patch.head2 !== undefined) n.start = n.head + (n.head2 ? 2 : 1);
    }
    return n;
  }));
  const names = useMemo(() => (sh && cfg ? colNames(sh.rows, cfg.head, cfg.head2) : { top: [], sub: [] }), [sh, cfg]);
  const nCols = sh ? Math.min(40, Math.max(...sh.rows.slice(0, 200).map((r) => r.length), 1)) : 0;
  const colOpt = (c: number) => `${colLetter(c)}${names.top[c] ? ' · ' + names.top[c] : ''}${names.sub[c] ? ' ' + names.sub[c] : ''}`;
  const parsed = useMemo(() => (sh && cfg && cfg.kind !== 'skip' ? parseSheet(sh.rows, cfg, { wages: s.basis.wages }) : null), [sh, cfg, s.basis.wages]);
  const out = useMemo(() => (book ? combine(book, cfgs, info.name || '새 공사', { wages: s.basis.wages }) : null), [book, cfgs, info.name, s.basis.wages]);
  const fieldOf = (c: number) => (cfg ? FIELDS[cfg.kind].filter((f) => cfg.map[f.k] === c).map((f) => f.label) : []);
  const missing = cfg ? FIELDS[cfg.kind].filter((f) => f.need && (cfg.map[f.k] ?? -1) < 0) : [];

  // 총괄표와 비교
  const check = useMemo(() => {
    if (!book || !out?.design) return [];
    const cis = cfgs.map((c, i) => (c.kind === 'chong' ? i : -1)).filter((i) => i >= 0);
    if (!cis.length) return [];
    const chong = cis.flatMap((ci) => parseSheet(book.sheets[ci].rows, cfgs[ci]).chong ?? []);
    const amt = new Map<string, number>();
    const walk = (ls: NonNullable<typeof out.design>['sections'][0]['lines']): number => ls.reduce((a, l) => {
      const v = l.children ? walk(l.children) : Math.floor(l.qty * l.lu) + Math.floor(l.qty * l.mu) + Math.floor(l.qty * l.eu);
      if (l.children) amt.set(l.name.replace(/\s+/g, ''), (amt.get(l.name.replace(/\s+/g, '')) ?? 0) + v);
      return a + v;
    }, 0);
    out.design.sections.forEach((x) => walk(x.lines));
    const seen = new Set<string>();
    return chong.filter((x) => { const k = x.name.replace(/\s+/g, ''); if (!x.t || !amt.has(k) || seen.has(k)) return false; seen.add(k); return true; }).map((x) => ({ name: x.name, xls: x.t, app: amt.get(x.name.replace(/\s+/g, ''))! }));
  }, [book, cfgs, out]);
  const diff = check.filter((x) => Math.abs(x.xls - x.app) > 0);

  const go = async () => {
    if (!book || !out) return;
    if (!out.design && !out.units.length && !out.calcs.length && !Object.keys(out.mats).length && !Object.keys(out.wages).length && !Object.keys(out.rates).length) { setErr('가져올 내용이 없습니다 — 시트 종류를 고르세요'); return; }
    if (target === 'new') {
      if (!info.name.trim()) { setErr('공사명을 넣으세요'); return; }
      const bid = Number(info.rate) / 100;
      if (!(bid > 0 && bid <= 1.2)) { setErr('낙찰률은 % 로 넣으세요 (예: 87.745)'); return; }
      const base = blankState({ id: 'x', name: info.name.trim(), client: info.client, kind: info.kind, created: '' }, bid);
      const st: Partial<State> = {
        design: out.design ?? base.design,
        rates: out.rates,
        basis: { ...base.basis, wages: { ...base.basis.wages, ...out.wages }, mats: { ...base.basis.mats, ...out.mats }, units: out.units, calcs: out.calcs },
      };
      const id = createProject({ name: info.name.trim(), client: info.client.trim(), kind: info.kind }, bid, st as State);
      toast(`${info.name}을(를) 만들었습니다 — ${out.report.join(' · ')}`);
      onDone?.(id);
    } else {
      if (out.design && !(await ask({ title: '엑셀 가져오기', label: `지금 공사(${s.info.name})의 설계내역서를 엑셀 내역서로 바꿀까요? 일위대가·단가 등은 더해집니다.`, confirmOnly: true, ok: '바꾸기' }))) return;
      set((st) => {
        const units = [...st.basis.units.filter((u) => !out.units.some((x) => x.no === u.no)), ...out.units];
        const calcs = [...st.basis.calcs.filter((c) => !out.calcs.some((x) => x.no === c.no)), ...out.calcs];
        return { ...st, design: out.design ?? st.design, rates: { ...st.rates, ...out.rates }, basis: { ...st.basis, wages: { ...st.basis.wages, ...out.wages }, mats: { ...st.basis.mats, ...out.mats }, units, calcs } };
      });
      toast(`${s.info.name}에 가져왔습니다 — ${out.report.join(' · ')}`);
      onDone?.();
    }
    onClose();
  };

  return (
    <Win title={`엑셀 가져오기${book ? ' — ' + book.name : ''}`} onClose={onClose} w={1380} h={900}
      buttons={<>
        <span className="grow" style={{ color: err ? '#C00000' : undefined }}>{err || (out ? `가져올 것: ${out.report.join(' · ')}${check.length ? ` · 총괄표 비교 ${check.length - diff.length}/${check.length} 일치` : ''}` : '')}</span>
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="button" className="btn pri" disabled={!book} onClick={go}>{target === 'new' ? '새 공사로 가져오기' : '지금 공사에 가져오기'}</button>
      </>}>
      <div className="ib" style={{ gap: 10 }}>
        <button type="button" className="btn" onClick={open}>{book ? '다른 파일…' : '엑셀 파일 고르기…'}</button>
        <label><input type="radio" checked={target === 'new'} onChange={() => setTarget('new')} />새 공사로</label>
        <label><input type="radio" checked={target === 'cur'} onChange={() => setTarget('cur')} />지금 공사({s.info.name})에</label>
        {target === 'new' && <>
          <label><span className="k">공사명</span><input type="text" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} style={{ width: 240 }} /></label>
          <label><span className="k">발주처</span><input type="text" value={info.client} onChange={(e) => setInfo({ ...info, client: e.target.value })} style={{ width: 120 }} /></label>
          <label><span className="k">공종</span><input type="text" value={info.kind} onChange={(e) => setInfo({ ...info, kind: e.target.value })} style={{ width: 70 }} /></label>
          <label><span className="k">낙찰률</span><input type="text" value={info.rate} onChange={(e) => setInfo({ ...info, rate: e.target.value })} style={{ width: 64, textAlign: 'right' }} />%</label>
        </>}
      </div>
      {!book ? (
        <div style={{ padding: 30 }}>
          <p>내역서·일위대가·총괄표·자재단가·노임단가·원가계산서가 든 엑셀(.xlsx · .xls)을 고르세요.</p>
          <p className="hint">시트 이름과 머리글을 보고 종류와 열을 자동으로 맞춥니다. 양식이 달라 잘못 맞춰지면 시트마다 종류·머리글 줄·열을 직접 고칠 수 있습니다.</p>
          <button type="button" className="btn pri" onClick={open}>엑셀 파일 고르기…</button>
        </div>
      ) : (
        <div className="body">
          <nav className="lp" aria-label="시트" style={{ width: 250 }}>
            <div className="lp-h">시트 {book.sheets.length}개 · 종류</div>
            {book.sheets.map((x, i) => (
              <div key={x.name} className={'imp-sh' + (i === sel ? ' on' : '') + (cfgs[i].kind === 'skip' ? ' off' : '')} onClick={() => setSel(i)}>
                <div><b>{x.name}</b> <span className="k">{x.rows.length}줄</span></div>
                <select value={cfgs[i].kind} onClick={(e) => e.stopPropagation()} onChange={(e) => { setSel(i); setCfgs((cs) => cs.map((c, k) => (k === i ? defaultCfg(book.sheets[i].rows, e.target.value as SheetKind) : c))); }}>
                  {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
            ))}
          </nav>
          <main className="main" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {sh && cfg && (<>
              <div className="ib" style={{ gap: 12 }}>
                <b>{sh.name}</b>
                <label><span className="k">종류</span><select value={cfg.kind} onChange={(e) => upd({ kind: e.target.value as SheetKind })}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
                {cfg.kind !== 'skip' && <>
                  <label><span className="k">머리글 줄</span><input type="number" min={1} value={cfg.head + 1} onChange={(e) => upd({ head: Math.max(0, Number(e.target.value) - 1) })} style={{ width: 56 }} /></label>
                  <label><input type="checkbox" checked={cfg.head2} onChange={(e) => upd({ head2: e.target.checked })} />두 줄 머리글 (단가/금액)</label>
                  <label><span className="k">가져올 줄</span><input type="number" min={1} value={cfg.start + 1} onChange={(e) => upd({ start: Math.max(0, Number(e.target.value) - 1) })} style={{ width: 64 }} /> ~ <input type="number" min={1} value={cfg.end + 1} onChange={(e) => upd({ end: Math.max(0, Number(e.target.value) - 1) })} style={{ width: 70 }} /></label>
                  {(cfg.kind === 'nae' || cfg.kind === 'unit') && <label><input type="checkbox" checked={cfg.skipSums} onChange={(e) => upd({ skipSums: e.target.checked })} />계·소계·합계 줄 빼기</label>}
                  {cfg.kind === 'nae' && <label><span className="k">공종 판단</span><select value={cfg.rule} onChange={(e) => upd({ rule: e.target.value as Rule })}>{(Object.keys(RULE_LABEL) as Rule[]).map((r) => <option key={r} value={r}>{RULE_LABEL[r]}</option>)}</select></label>}
                  {cfg.kind === 'mat' && <label><input type="checkbox" checked={cfg.minPrice} onChange={(e) => upd({ minPrice: e.target.checked })} />단가 열이 여러 개면 최저가</label>}
                </>}
              </div>
              {cfg.kind !== 'skip' && (
                <div className="imp-map">
                  {FIELDS[cfg.kind].map((f) => (
                    <label key={f.k} className={f.need && (cfg.map[f.k] ?? -1) < 0 ? 'need' : ''}>
                      <span>{f.label}{f.need ? ' *' : ''}</span>
                      <select value={cfg.map[f.k] ?? -1} onChange={(e) => upd({ map: { ...cfg.map, [f.k]: Number(e.target.value) } })}>
                        <option value={-1}>— 없음 —</option>
                        {Array.from({ length: nCols }, (_, c) => <option key={c} value={c}>{colOpt(c)}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              {missing.length > 0 && <div className="note" style={{ margin: '0 10px' }}>꼭 필요한 열이 없습니다: {missing.map((f) => f.label).join(', ')} — 위에서 열을 고르세요</div>}
              <div className="vg" style={{ padding: '6px 10px' }}>
                <button type="button" className={'vb' + (tab === 'raw' ? ' on' : '')} onClick={() => setTab('raw')}>원본 (열 확인)</button>
                <button type="button" className={'vb' + (tab === 'result' ? ' on' : '')} onClick={() => setTab('result')} disabled={cfg.kind === 'skip'}>읽은 결과{parsed ? ` (${parsed.preview.length})` : ''}</button>
                {parsed?.note.map((n) => <span key={n} className="k" style={{ marginLeft: 10 }}>{n}</span>)}
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 10px' }}>
                {tab === 'raw' ? (
                  <table className="f imp-raw">
                    <thead>
                      <tr><th />{Array.from({ length: nCols }, (_, c) => <th key={c}>{colLetter(c)}{fieldOf(c).length > 0 && <div className="imp-tag">{fieldOf(c).join(' · ')}</div>}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sh.rows.slice(Math.max(0, cfg.head - 2), Math.max(0, cfg.head - 2) + 120).map((r, k) => {
                        const i = Math.max(0, cfg.head - 2) + k;
                        const isHead = i === cfg.head || (cfg.head2 && i === cfg.head + 1);
                        const out2 = i < cfg.start || i > cfg.end;
                        return (
                          <tr key={i} className={isHead ? 'imp-h' : out2 ? 'imp-out' : ''}>
                            <td className="c imp-no" title="이 줄을 머리글로" onClick={() => upd({ head: i })}>{i + 1}</td>
                            {Array.from({ length: nCols }, (_, c) => <td key={c} className={fieldOf(c).length ? 'imp-m' : ''}>{typeof r[c] === 'number' ? (r[c] as number).toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : String(r[c] ?? '')}</td>)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : parsed && (
                  <table className="f" style={{ width: '100%' }}>
                    <thead><tr><th>구분</th>{(PREVIEW_HEAD[cfg.kind] ?? []).map((h) => <th key={h}>{h}</th>)}<th>확인</th></tr></thead>
                    <tbody>
                      {parsed.preview.slice(0, 600).map((p, k) => (
                        <tr key={k} className={p.tag === '공종' || /호표$/.test(p.tag) ? 'g' : ''}>
                          <td className="c"><span className="lk">{p.tag}</span></td>
                          {p.cells.map((v, c) => <td key={c} className={typeof v === 'number' ? 'n' : ''} style={c === 0 ? { paddingLeft: 6 + p.depth * 14 } : undefined}>{typeof v === 'number' ? (Number.isInteger(v) ? won(v, { zero: '0' }) : v.toLocaleString('ko-KR', { maximumFractionDigits: 4 })) : v}</td>)}
                          <td className="cf">{p.warn ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>)}
          </main>
          <aside className="rp" style={{ width: 280 }}>
            <h2>가져올 내용</h2>
            <div className="calc">{out?.report.map((r) => <div key={r} className="r"><span>{r}</span></div>)}</div>
            {check.length > 0 && <>
              <h2>총괄표와 비교</h2>
              <div className="hint">{diff.length ? `${diff.length}개 공종 금액이 다릅니다 — 열 매핑이나 공종 판단을 확인하세요` : `공종 ${check.length}개 금액이 모두 같습니다`}</div>
              <table className="f" style={{ width: '100%' }}><tbody>
                {check.slice(0, 20).map((x) => <tr key={x.name}><td>{x.name}</td><td className="n" style={{ color: x.xls === x.app ? undefined : '#C00000' }}>{won(x.app)}{x.xls !== x.app && <div className="cf">엑셀 {won(x.xls)}</div>}</td></tr>)}
              </tbody></table>
            </>}
            <div className="hint">· 시트를 누르면 열 맞춤을 보고 고칠 수 있습니다<br />· 원본에서 줄 번호를 누르면 그 줄을 머리글로 씁니다<br />· 내역서의 비고에 있는 호표 번호는 근거로 붙여 두되, 단가는 엑셀 값을 그대로 씁니다 (연결은 내역서에서 [근거 연결])</div>
          </aside>
        </div>
      )}
    </Win>
  );
}
