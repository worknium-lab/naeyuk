import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import { PROJECT } from '../data/project';
import { useStore, migrate } from '../store';
import { useAsk, canPrint } from './Ask';
import { saveFile } from '../platform';

/* ---------- 팝업 열기 (표준품셈 · 표준시장단가 · 참고 내역서) ---------- */
export type PopupKind = 'pumsem' | 'market' | 'refcopy' | null;
export const PopupCtx = createContext<{ open: (k: PopupKind) => void; kind: PopupKind }>({ open: () => {}, kind: null });
export const usePopup = () => useContext(PopupCtx);

/* ---------- 기능버튼 ---------- */
export function FB({ icon, label, title, to, onClick, on, primary }: {
  icon: string; label: string; title?: string; to?: string; onClick?: () => void; on?: boolean; primary?: boolean;
}) {
  const cls = 'fb' + (on ? ' on' : '') + (primary ? ' primary' : '');
  if (to) return <Link to={to} className={cls} title={title ?? label}><Icon name={icon} />{label}</Link>;
  return <button type="button" className={cls} title={title ?? label} onClick={onClick}><Icon name={icon} />{label}</button>;
}

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grp" role="group" aria-label={label}>{children}</div>;
}

/* ---------- 주메뉴 ---------- */
type MenuItem = { label: string; to?: string; key?: string; act?: () => void } | '-';

function Menu() {
  const nav = useNavigate();
  const { reset, toast, s, set } = useStore();
  const ask = useAsk();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saveText, setSaveText] = useState<string | null>(null);
  const save = async () => {
    const text = JSON.stringify({ app: 'naeyuk', format: 1, saved: new Date().toISOString(), project: PROJECT.name, state: s });
    if (await saveFile(`${PROJECT.name}.wnx`, text, canPrint())) toast('공사 파일(.wnx)을 내려받았습니다');
    else setSaveText(text);
  };
  const load = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      if (j.app !== 'naeyuk' || !j.state) throw new Error('형식');
      set((cur) => migrate({ ...cur, ...j.state }));
      toast(`${f.name}을(를) 열었습니다`);
    } catch {
      toast('이 프로그램에서 저장한 공사 파일(.wnx)이 아닙니다');
    }
  };
  const { open: openPopup } = usePopup();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const menus: Record<string, MenuItem[]> = {
    파일: [
      { label: '공사 목록', to: '/' }, { label: '프로젝트 홈', to: '/project' }, '-',
      { label: '공사 파일 열기…', act: () => fileRef.current?.click() }, { label: '공사 파일 저장 (.wnx)', key: 'Ctrl+S', act: save }, '-',
      { label: '다른 내역서 열기 (참고)', act: () => openPopup('refcopy') }, '-',
      { label: '예시 데이터로 되돌리기', act: async () => { if (await ask({ title: '예시 데이터로 되돌리기', label: '입력한 내용을 지우고 예시 데이터로 되돌릴까요?', confirmOnly: true, ok: '되돌리기' })) { reset(); toast('예시 데이터로 되돌렸습니다'); } } },
      { label: '모바일 화면', to: '/m' },
    ],
    편집: [{ label: '내역서', to: '/estimate' }, { label: '일위대가', to: '/unit' }, { label: '단가산출', to: '/calc' }],
    레벨: [{ label: '레벨 지정은 내역서에서 오른쪽 클릭', to: '/estimate' }],
    재계산: [{ label: '일건서류 전체재계산', key: 'F9', act: () => toast('전체재계산했습니다 — 모든 문서가 같은 엔진으로 다시 계산됩니다') }],
    원가계산서: [{ label: '원가계산서', to: '/cost' }],
    차수공사: [{ label: '차수별 내역서 (분개)', to: '/phase' }],
    설계변경: [{ label: '설계변경 내역서 (당초·변경·증감)', to: '/change' }, { label: '변경 원가계산서', to: '/cost?doc=change' }],
    작업도구: [
      { label: '표준품셈 검색', act: () => openPopup('pumsem') }, { label: '표준시장단가 검색', act: () => openPopup('market') }, '-',
      { label: '자재단가', to: '/material' }, { label: '노임단가', to: '/labor' }, { label: '기계경비', to: '/machine' },
    ],
    양식도구: [{ label: '하도급내역서', to: '/sub' }, { label: '원·하도급 대비내역서', to: '/sub/compare' }],
    작업모드: [{ label: '기성내역서', to: '/progress' }, { label: '통합 모드로 보기', to: '/progress?host=1' }],
    도움말: [{ label: '테스트 순서 (처음 쓰는 분)', to: '/guide' }, { label: 'WORKNIUM 적산 웹 프로토타입 v0.3', act: () => {} }],
  };
  return (
    <>
    <div className="menu" role="menubar" aria-label="주메뉴" ref={ref}>
      <input ref={fileRef} type="file" accept=".wnx,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
      {Object.entries(menus).map(([name, items]) => (
        <div key={name} className="mi">
          <button type="button" className={open === name ? 'on' : ''} onClick={() => setOpen(open === name ? null : name)} aria-haspopup="menu" aria-expanded={open === name}>{name}</button>
          {open === name && (
            <div className="dd" role="menu">
              {items.map((it, i) => it === '-' ? <hr key={i} style={{ border: 0, borderTop: '1px solid #D5D9DF', margin: '3px 2px' }} /> : (
                <button key={i} type="button" role="menuitem" onClick={() => { setOpen(null); if (it.to) nav(it.to); it.act?.(); }}>
                  {it.label}<span>{it.key}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
      {saveText && (
        <Win title="공사 파일 저장" onClose={() => setSaveText(null)} w={640} h={420}
          buttons={<>
            <span className="grow">이 창에서는 파일 내려받기가 막혀 있습니다. 복사해서 메모장에 붙여 넣고 .wnx로 저장하세요.</span>
            <button type="button" className="btn" onClick={() => setSaveText(null)}>닫기</button>
            <button type="button" className="btn pri" onClick={async () => { try { await navigator.clipboard.writeText(saveText); toast('복사했습니다'); } catch { toast('복사가 막혔습니다 — 글을 선택해 Ctrl+C 하세요'); } }}>복사</button>
          </>}>
          <textarea readOnly value={saveText} style={{ flex: 1, margin: 10, fontFamily: 'monospace', fontSize: 11 }} onFocus={(e) => e.target.select()} />
        </Win>
      )}
    </>
  );
}

/* ---------- 아래 작업화면 탭 ---------- */
export type TabSet = 'work' | 'sub' | 'none';

function WorkTabs({ set }: { set: TabSet }) {
  const { open } = usePopup();
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '');
  if (set === 'none') return null;
  if (set === 'sub') {
    return (
      <nav className="tabs" aria-label="작업화면 이동">
        <NavLink to="/sub" end className={cls}>하도급내역서</NavLink>
        <NavLink to="/sub/compare" className={cls}>원·하도급 대비내역서</NavLink>
        <NavLink to="/sub/change" className={cls}>하도급 설계변경</NavLink>
        <span className="sp" />
        <NavLink to="/unit" className={cls}>일위대가</NavLink>
        <NavLink to="/calc" className={cls}>단가산출</NavLink>
        <NavLink to="/machine" className={cls}>기계경비</NavLink>
        <NavLink to="/material" className={cls}>자재단가</NavLink>
        <NavLink to="/labor" className={cls}>노임단가</NavLink>
      </nav>
    );
  }
  return (
    <nav className="tabs" aria-label="작업화면 이동">
      <NavLink to="/estimate" className={cls}>내역서</NavLink>
      <NavLink to="/unit" className={cls}>일위대가</NavLink>
      <NavLink to="/calc" className={cls}>단가산출</NavLink>
      <NavLink to="/machine" className={cls}>기계경비</NavLink>
      <a href="#" onClick={(e) => { e.preventDefault(); open('market'); }}>표준시장단가</a>
      <NavLink to="/quote" className={cls}>견적단가</NavLink>
      <NavLink to="/material" className={cls}>자재단가</NavLink>
      <NavLink to="/labor" className={cls}>노임단가</NavLink>
      <span className="sp" />
      <NavLink to="/cost" className={cls}>원가계산서</NavLink>
      <NavLink to="/phase" className={cls}>차수공사</NavLink>
    </nav>
  );
}

function SaveBadge() {
  const { saveWhere } = useStore();
  const t = saveWhere === 'account' ? '내 계정에 저장됨' : saveWhere === 'saving' ? '저장 중…' : '이 브라우저에 저장';
  return <span style={{ opacity: 0.85 }} title="입력한 내용이 저장되는 곳">{t}</span>;
}

/* ---------- 화면 틀 ---------- */
export function Shell({ doc, toolbar, info, left, right, children, tabs = 'work', footer, mainClass = 'main' }: {
  doc: string;
  toolbar?: ReactNode;
  info?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  tabs?: TabSet;
  footer?: ReactNode;
  mainClass?: string;
}) {
  return (
    <div className="app">
      <div className="titlebar">
        <span style={{ flex: 1 }}>[{PROJECT.file}] {doc}</span>
        <SaveBadge />
        <Link to="/m" title="모바일 화면 보기">모바일</Link>
      </div>
      <Menu />
      {toolbar && <div className="toolbar" role="toolbar" aria-label="기능버튼">{toolbar}</div>}
      {info && <div className="ib">{info}</div>}
      <div className="body">
        {left}
        <main className={mainClass}>{children}</main>
        {right}
      </div>
      <WorkTabs set={tabs} />
      {footer && <footer className="footer">{footer}</footer>}
    </div>
  );
}

/* ---------- 창 (팝업 · 별도 창) ---------- */
export function Win({ title, onClose, children, w, h, x, y, float = false, modal = true, buttons }: {
  title: string; onClose: () => void; children: ReactNode; w: number; h: number; x?: number; y?: number;
  float?: boolean; modal?: boolean; buttons?: ReactNode;
}) {
  const [pos, setPos] = useState(() => ({
    x: x ?? Math.max(10, (window.innerWidth - w) / 2),
    y: y ?? Math.max(10, (window.innerHeight - h) / 2),
  }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    const mv = (e: MouseEvent) => { if (drag.current) setPos({ x: e.clientX - drag.current.dx, y: Math.max(0, e.clientY - drag.current.dy) }); };
    const up = () => { drag.current = null; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && modal) onClose(); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); window.removeEventListener('keydown', esc); };
  }, [modal, onClose]);
  const hh = Math.min(h, window.innerHeight - 20);
  const ww = Math.min(w, window.innerWidth - 20);
  return (
    <>
      {modal && <div className="dim" onClick={onClose} />}
      <div className={'win' + (float ? ' float' : '')} role="dialog" aria-label={title} style={{ left: pos.x, top: pos.y, width: ww, height: hh }}>
        <div className="win-t" onMouseDown={(e) => { drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}>
          <span>{title}</span>
          <button type="button" aria-label="닫기" onMouseDown={(e) => e.stopPropagation()} onClick={onClose}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
        {buttons && <div className="btns">{buttons}</div>}
      </div>
    </>
  );
}
