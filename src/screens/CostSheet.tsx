import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { canPrint } from '../ui/Ask';
import { exportXlsx } from '../xlsx';
import { sheetRows, costRows, compareRows, docBook } from '../exports';
import { useStore } from '../store';
import { useAsk } from '../ui/Ask';
import { useDocs } from '../docs';
import { won, DEFAULT_RATES, type CostRates } from '../engine';

const RATE_LABELS: [keyof CostRates, string][] = [
  ['il', '간접노무비'], ['ind', '산재보험료'], ['emp', '고용보험료'], ['health', '건강보험료'], ['pension', '연금보험료'],
  ['care', '노인장기요양보험료'], ['retire', '퇴직공제부금비'], ['machGuar', '건설기계대여 보증'], ['safety', '산업안전보건관리비'],
  ['env', '환경보전비'], ['etc', '기타경비'], ['gen', '일반관리비'], ['profit', '이윤'],
];

export default function CostSheet() {
  const { s, set, toast } = useStore();
  const docs = useDocs();
  const ask = useAsk();
  const [params, setParams] = useSearchParams();
  const key = params.get('doc') ?? 'design';
  const d = docs.get(key);
  const [sel, setSel] = useState<string | null>(null);
  const R = { ...DEFAULT_RATES, ...s.rates };
  const groupSpan: Record<string, number> = { 재료비: 4, 노무비: 3, 경비: 14 };
  const seen = new Set<string>();

  return (
    <Shell
      doc={`원가계산서 : ${d.name}`}
      toolbar={<>
        <Group label="양식">
          <FB icon="form" label="양식" title="원가계산서 양식" onClick={() => toast('표준 원가계산서 양식 (1~18, A~L)')} />
          <FB icon="pct" label="요율" title="요율 기준 바꾸기" onClick={() => document.getElementById('rates')?.scrollIntoView()} />
        </Group>
        <Group label="편집">
          <FB icon="del" label="한줄삭제" onClick={() => toast('비목을 끄려면 하도급 원가계산서의 반영 체크를 쓰세요')} />
          <FB icon="trash" label="내용삭제" onClick={() => { set((st) => ({ ...st, rates: {} })); toast('요율을 기본값으로 되돌렸습니다'); }} />
        </Group>
        <Group label="계산">
          <FB icon="adj" label="역산" title="목표 도급액에서 이윤 역산" onClick={async () => {
            const v = await ask({ title: '역산', label: '맞출 도급액(부가세 포함)을 넣으세요', value: String(d.cost.total) });
            if (!v) return;
            const target = Math.floor(Number(v.replace(/[^0-9]/g, '')) / (1 + R.vat));
            const need = target - (d.cost.get('D') + d.cost.get('gen') + d.cost.get('waste'));
            const base = d.cost.get('B') + d.cost.get('C') + d.cost.get('gen');
            set((st) => ({ ...st, rates: { ...st.rates, profit: Math.max(0, need / base) } }));
            toast('이윤 요율을 역산했습니다');
          }} />
          <FB icon="safety" label="안전비교" title="산업안전보건관리비 비교" onClick={() => toast(`산업안전보건관리비 ${won(d.cost.get('safety'))}원 — (재료비+직노) × ${(R.safety * 100).toFixed(2)}%`)} />
          <FB icon="bid" label="낙찰" to="/estimate?doc=start" title="착공내역서 (낙찰률)" />
          <FB icon="recalc" label="재계산" primary onClick={() => toast('전체재계산했습니다')} />
        </Group>
        <Group label="출력">
          <FB icon="print" label="인쇄" onClick={() => (canPrint() ? window.print() : toast('이 화면에서는 인쇄 창이 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 인쇄됩니다'))} />
          <FB icon="excel" label="엑셀" onClick={() => exportXlsx(`${d.name} 원가계산서.xlsx`, docBook(d.name, d.sheet, d.cost)).then((ok) => toast(ok ? '엑셀 파일을 내려받았습니다' : '내려받기가 막혀 있습니다 — 내 PC에서 npm run dev로 띄우면 됩니다'))} />
        </Group>
      </>}
      info={<>
        <label><span className="k">문서</span>
          <select value={key} onChange={(e) => setParams({ doc: e.target.value })} style={{ fontWeight: 700 }}>
            {docs.list.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
          </select>
        </label>
        <span><span className="k">도급액</span> <b>{won(d.cost.total)}</b></span>
        <span><span className="k">총공사비</span> {won(d.cost.get('L'))}</span>
        <div style={{ flex: 1 }} />
        <span className="k">모든 비목은 원 미만 버림</span>
      </>}
      right={
        <aside className="rp" aria-label="요율 기준" id="rates">
          <h2>요율 기준</h2>
          <div className="hint">고치면 모든 문서의 원가계산서가 같이 바뀝니다.</div>
          <table className="f" style={{ width: '100%' }}>
            <tbody>
              {RATE_LABELS.map(([k, lab]) => (
                <tr key={k}>
                  <td>{lab}</td>
                  <td className="n">
                    <input className="q" style={{ width: 64 }} defaultValue={+(R[k] * 100).toFixed(4)} key={R[k]}
                      onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v)) set((st) => ({ ...st, rates: { ...st.rates, [k]: v / 100 } })); }} />%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn" onClick={() => set((st) => ({ ...st, rates: {} }))}>기본 요율로</button>
        </aside>
      }
    >
      <div style={{ padding: '16px 20px' }}>
        <h1 style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 18, letterSpacing: '.6em' }}>원 가 계 산 서</h1>
        <table className="f" style={{ width: '100%', maxWidth: 980, margin: '0 auto' }}>
          <thead><tr><th colSpan={3}>비            목</th><th>구분</th><th>금    액</th><th>요율</th><th>산   출   근   거</th></tr></thead>
          <tbody>
            {d.cost.rows.map((r, i) => {
              const inNet = i < 21;
              let first: React.ReactNode = null;
              if (i === 0) first = <td rowSpan={21} className="c" style={{ writingMode: 'vertical-rl', letterSpacing: '.5em', fontWeight: 700 }}>순공사원가</td>;
              let grp: React.ReactNode = null;
              if (r.group && !seen.has(r.group)) {
                seen.add(r.group);
                grp = <td rowSpan={groupSpan[r.group]} className="c" style={{ writingMode: 'vertical-rl', letterSpacing: '.4em' }}>{r.group}</td>;
              }
              const cls = (r.total ? 'sum ' : '') + (r.key === 'J' || r.key === 'L' ? 'red ' : '') + (sel === r.key ? 'sel ' : '') + 'click';
              return (
                <tr key={r.key} className={cls} onClick={() => setSel(r.key)}>
                  {first}
                  {inNet ? grp : null}
                  {inNet ? <td>{r.label}</td> : <td colSpan={3}>{r.label}</td>}
                  <td className="c">{r.no}</td>
                  <td className="n">{r.amount === null ? '' : won(r.amount, { zero: '0' })}</td>
                  <td className="c">{r.rate ?? ''}</td>
                  <td>{r.basis ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
