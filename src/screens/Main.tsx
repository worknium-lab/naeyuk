import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell, FB, Group, usePopup, Win } from '../ui/Shell';
import { useAsk } from '../ui/Ask';
import { useStore, EXAMPLE_ID, migrate, type State } from '../store';
import { useDocs } from '../docs';
import { won } from '../engine';
import { readEstimateXlsx, pickFile } from '../importXlsx';

const KINDS = ['도로', '교량', '교량 보수', '하천', '상하수도', '건축', '토목', '조경', '전기·통신', '기타'];

type NewFrom = 'blank' | 'copy' | 'example' | 'excel';

export default function Main() {
  const nav = useNavigate();
  const { s, toast, projects, openProject, createProject, deleteProject } = useStore();
  const { open } = usePopup();
  const ask = useAsk();
  const docs = useDocs();
  const design = docs.get('design');
  const [sel, setSel] = useState(s.info.id);
  const [cat, setCat] = useState('전체');
  const [dlg, setDlg] = useState<null | { from: NewFrom }>(null);
  const selMeta = projects.find((p) => p.id === sel) ?? projects[0];
  const kinds = useMemo(() => ['전체', ...new Set(projects.map((p) => p.kind || '기타'))], [projects]);
  const shown = projects.filter((p) => cat === '전체' || (p.kind || '기타') === cat);

  const go = (id: string) => { openProject(id); setSel(id); nav('/project'); };
  const del = async () => {
    if (!selMeta) return;
    if (projects.length <= 1) { toast('공사가 하나뿐이라 지울 수 없습니다'); return; }
    if (await ask({ title: '공사 지우기', label: `${selMeta.name}을(를) 지울까요? 이 PC(브라우저)에 저장된 내용이 모두 지워집니다. 필요하면 먼저 [파일 → 공사 파일 저장]으로 보관하세요.`, confirmOnly: true, ok: '지우기' })) {
      deleteProject(selMeta.id);
      setSel(projects.find((p) => p.id !== selMeta.id)!.id);
      toast(`${selMeta.name}을(를) 지웠습니다`);
    }
  };
  const importWnx = async () => {
    const f = await pickFile('.wnx,.json');
    if (!f) return;
    try {
      const j = JSON.parse(new TextDecoder().decode(f.buf));
      if (j.app !== 'naeyuk' || !j.state) throw new Error();
      const st = migrate({ ...j.state }) as State;
      const id = createProject({ name: st.info?.name ?? f.name.replace(/\.wnx(\.json)?$/, ''), client: st.info?.client ?? '', kind: st.info?.kind ?? '' }, st.bidRate ?? 0.88, st);
      setSel(id);
      toast(`${f.name}을(를) 새 공사로 가져왔습니다`);
    } catch {
      toast('이 프로그램에서 저장한 공사 파일(.wnx)이 아닙니다');
    }
  };

  return (
    <Shell
      doc="공사 목록"
      tabs="none"
      toolbar={<>
        <Group label="공사">
          <FB icon="new" label="새 공사" primary onClick={() => setDlg({ from: 'blank' })} />
          <FB icon="open" label="열기" onClick={() => selMeta && go(selMeta.id)} />
          <FB icon="copy" label="복사" title="고른 공사를 복사해 새 공사로" onClick={() => setDlg({ from: 'copy' })} />
          <FB icon="trash" label="삭제" onClick={del} />
        </Group>
        <Group label="가져오기">
          <FB icon="excel" label="엑셀 내역서" title="엑셀 내역서로 새 공사 만들기 (품명·규격·수량·단위·단가 머리글)" onClick={() => setDlg({ from: 'excel' })} />
          <FB icon="upload" label="공사 파일" title="공사 파일(.wnx) 가져오기" onClick={importWnx} />
          <FB icon="docs" label="참고 창" title="다른 공사를 참고 창으로 열기" onClick={() => open('refcopy')} />
        </Group>
        <Group label="자료실">
          <FB icon="labor" label="노임" onClick={() => nav('/labor')} />
          <FB icon="material" label="자재" onClick={() => nav('/material')} />
          <FB icon="book" label="품셈" onClick={() => open('pumsem')} />
          <FB icon="market" label="시장단가" onClick={() => open('market')} />
        </Group>
      </>}
      info={<>
        <span><span className="k">지금 열린 공사</span> <b>{s.info.name}</b></span>
        <span><span className="k">단가 기준</span> 2026년 하반기 (노임 2026.9 공표)</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" style={{ height: 26 }} onClick={() => nav('/guide')}>테스트 순서 보기</button>
        <span className="k">공사를 두 번 누르면 엽니다</span>
      </>}
      left={
        <nav className="lp" aria-label="공사 분류">
          <div className="lp-h">공사 분류</div>
          {kinds.map((c) => (
            <a key={c} href="#" className={cat === c ? 'on' : ''} onClick={(e) => { e.preventDefault(); setCat(c); }}>
              <span>{c}</span><span className="st">{c === '전체' ? projects.length : projects.filter((p) => (p.kind || '기타') === c).length}</span>
            </a>
          ))}
          <div className="lp-h" style={{ marginTop: 10 }}>자료실</div>
          <a href="#" onClick={(e) => { e.preventDefault(); nav('/labor'); }}><span>노임단가 2026 하반기</span></a>
          <a href="#" onClick={(e) => { e.preventDefault(); open('pumsem'); }}><span>표준품셈 2026</span></a>
          <a href="#" onClick={(e) => { e.preventDefault(); open('market'); }}><span>표준시장단가 2026 하반기</span></a>
          <a href="#" onClick={(e) => { e.preventDefault(); nav('/material'); }}><span>자재단가</span></a>
        </nav>
      }
      right={selMeta && (
        <aside className="rp" aria-label="선택한 공사">
          <h2>{selMeta.name}</h2>
          <dl>
            <dt>발주처</dt><dd>{selMeta.client || '—'}</dd>
            <dt>공종</dt><dd>{selMeta.kind || '—'}</dd>
            <dt>단계</dt><dd>{selMeta.phase}</dd>
            <dt>수정일</dt><dd>{selMeta.updated}</dd>
          </dl>
          {selMeta.id === s.info.id ? (
            <table className="f" style={{ width: '100%' }}>
              <tbody>
                <tr><td>직접공사비</td><td className="n">{won(design.cost.get('A') + design.cost.get('dl') + design.cost.get('exp'), { zero: '0' })}</td></tr>
                <tr><td>순공사원가</td><td className="n">{won(design.cost.get('D'), { zero: '0' })}</td></tr>
                <tr><td>총원가</td><td className="n">{won(design.cost.get('H'), { zero: '0' })}</td></tr>
                <tr className="red"><td>도급액</td><td className="n">{won(design.cost.total, { zero: '0' })}</td></tr>
              </tbody>
            </table>
          ) : <div className="calc"><div className="r"><span>설계 도급액</span><b>{won(selMeta.amount, { zero: '0' })}</b></div></div>}
          <button type="button" className="btn pri" style={{ marginTop: 'auto' }} onClick={() => go(selMeta.id)}>공사 열기</button>
        </aside>
      )}
      footer={<><span>공사 {projects.length}개</span><span>공사마다 따로 저장됩니다 · 다른 PC로 옮길 때는 [파일 → 공사 파일 저장]</span></>}
    >
      <div style={{ padding: 12 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th>번호</th><th>공  사  명</th><th>발 주 처</th><th>공종</th><th>단계</th><th>설계 도급액 (원)</th><th>수정일</th></tr></thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={p.id} className={'click' + (sel === p.id ? ' sel' : '')} onClick={() => setSel(p.id)} onDoubleClick={() => go(p.id)}>
                <td className="c">{i + 1}</td>
                <td>{p.id === s.info.id ? <b>{p.name}</b> : p.name}{p.id === EXAMPLE_ID && <span className="cf"> · 예시</span>}{p.id === s.info.id && <span className="cf"> · 열려 있음</span>}</td>
                <td>{p.client}</td><td className="c">{p.kind}</td><td className="c">{p.phase}</td>
                <td className="n">{won(p.id === s.info.id ? design.cost.total : p.amount, { zero: '0' })}</td><td className="c">{p.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <div className="note" style={{ marginTop: 10 }}>이 분류의 공사가 없습니다. [새 공사]로 만드세요.</div>}
      </div>
      {dlg && <NewProject from={dlg.from} copyOf={selMeta} onClose={() => setDlg(null)} onMade={(id) => { setDlg(null); setSel(id); nav('/estimate'); }} />}
    </Shell>
  );
}

function NewProject({ from: from0, copyOf, onClose, onMade }: { from: NewFrom; copyOf?: { id: string; name: string }; onClose: () => void; onMade: (id: string) => void }) {
  const { createProject, toast } = useStore();
  const [from, setFrom] = useState<NewFrom>(from0);
  const [name, setName] = useState(from0 === 'copy' && copyOf ? `${copyOf.name} (복사)` : '');
  const [client, setClient] = useState('');
  const [kind, setKind] = useState('도로');
  const [rate, setRate] = useState('88.000');
  const [file, setFile] = useState<{ name: string; buf: ArrayBuffer } | null>(null);
  const [err, setErr] = useState('');
  const make = () => {
    if (!name.trim()) { setErr('공사명을 넣으세요'); return; }
    const bid = Number(rate) / 100;
    if (!(bid > 0 && bid <= 1.2)) { setErr('낙찰률은 % 로 넣으세요 (예: 87.745)'); return; }
    const info = { name: name.trim(), client: client.trim(), kind };
    if (from === 'excel') {
      if (!file) { setErr('엑셀 파일을 고르세요'); return; }
      try {
        const r = readEstimateXlsx(file.buf, info.name);
        const id = createProject(info, bid, { design: r.sheet } as State);
        toast(`${file.name}의 [${r.sheetName}]에서 공종 ${r.groups}개 · 항목 ${r.items}개를 가져왔습니다${r.note.length ? ' — ' + r.note.join(', ') : ''}`);
        onMade(id);
      } catch (e) {
        setErr((e as Error).message || '엑셀을 읽지 못했습니다');
      }
      return;
    }
    const id = createProject(info, bid, from === 'blank' ? 'blank' : from === 'example' ? EXAMPLE_ID : copyOf?.id ?? 'blank');
    toast(`${info.name}을(를) 만들었습니다${from === 'blank' ? ' — 설계내역서에 공종과 항목을 넣으세요' : ''}`);
    onMade(id);
  };
  return (
    <Win title="새 공사" onClose={onClose} w={620} h={520}
      buttons={<>
        <span className="grow" style={{ color: '#C00000' }}>{err}</span>
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="button" className="btn pri" onClick={make}>만들기</button>
      </>}>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 12px', alignItems: 'center' }}>
        <label htmlFor="np-name">공사명</label><input id="np-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus style={{ height: 28, padding: '0 8px' }} />
        <label htmlFor="np-client">발주처</label><input id="np-client" type="text" value={client} onChange={(e) => setClient(e.target.value)} style={{ height: 28, padding: '0 8px' }} />
        <label htmlFor="np-kind">공종</label>
        <select id="np-kind" value={kind} onChange={(e) => setKind(e.target.value)} style={{ height: 28 }}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <label htmlFor="np-rate">낙찰률 (%)</label><input id="np-rate" type="text" value={rate} onChange={(e) => setRate(e.target.value)} style={{ height: 28, padding: '0 8px', width: 120 }} />
        <span>시작 방법</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label><input type="radio" checked={from === 'blank'} onChange={() => setFrom('blank')} /> 빈 공사 — 공종 하나와 빈 항목 하나로 시작 (노임·자재·기계경비 자료실 포함)</label>
          <label><input type="radio" checked={from === 'excel'} onChange={() => setFrom('excel')} /> 엑셀 내역서에서 — 품명·규격·수량·단위·단가 열을 읽어 설계내역서로</label>
          <label><input type="radio" checked={from === 'copy'} onChange={() => setFrom('copy')} disabled={!copyOf} /> 고른 공사 복사{copyOf ? ` — ${copyOf.name}` : ''}</label>
          <label><input type="radio" checked={from === 'example'} onChange={() => setFrom('example')} /> 예시 공사(용암교) 복사 — 호표·단산까지</label>
        </div>
        {from === 'excel' && <>
          <span>엑셀 파일</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={async () => { const f = await pickFile('.xlsx,.xls'); if (f) { setFile(f); setErr(''); } }}>파일 고르기…</button>
            <span className="k">{file ? file.name : '고른 파일 없음'}</span>
          </div>
        </>}
      </div>
      <div className="hint" style={{ padding: '0 16px' }}>설계내역서를 만들면 착공내역서(설계 × 낙찰률)와 원가계산서가 함께 계산됩니다. 낙찰률은 프로젝트 홈에서 바꿀 수 있습니다.</div>
    </Win>
  );
}
