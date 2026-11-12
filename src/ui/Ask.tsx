import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Win } from './Shell';

interface AskOpts { title: string; label?: string; value?: string; ok?: string; confirmOnly?: boolean }
type AskFn = (o: AskOpts) => Promise<string | null>;
const Ctx = createContext<AskFn>(async () => null);

/** 브라우저 prompt/confirm 대신 쓰는 화면 안 대화창 (샌드박스에서도 동작) */
export function AskProvider({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<AskOpts | null>(null);
  const res = useRef<(v: string | null) => void>(() => {});
  const [val, setVal] = useState('');
  const ask: AskFn = (o) => new Promise((r) => { res.current = r; setVal(o.value ?? ''); setCur(o); });
  const done = (v: string | null) => { setCur(null); res.current(v); };
  return (
    <Ctx.Provider value={ask}>
      {children}
      {cur && (
        <Win title={cur.title} onClose={() => done(null)} w={420} h={cur.confirmOnly ? 170 : 200}
          buttons={<><button type="button" className="btn" onClick={() => done(null)}>취소</button><button type="button" className="btn pri" onClick={() => done(cur.confirmOnly ? 'ok' : val)}>{cur.ok ?? '확인'}</button></>}>
          <form style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={(e) => { e.preventDefault(); done(cur.confirmOnly ? 'ok' : val); }}>
            {cur.label && <label htmlFor="ask-in">{cur.label}</label>}
            {!cur.confirmOnly && <input id="ask-in" autoFocus value={val} onChange={(e) => setVal(e.target.value)} style={{ height: 30, border: '1px solid #C9CED6', padding: '0 8px', font: 'inherit' }} />}
          </form>
        </Win>
      )}
    </Ctx.Provider>
  );
}

export const useAsk = () => useContext(Ctx);

/** 샌드박스 안이면 인쇄 대화상자가 막힌다 */
export function canPrint() {
  try { return window.self === window.top; } catch { return false; }
}
