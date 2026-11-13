import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shell, FB, Group } from '../ui/Shell';
import { canPrint } from '../ui/Ask';
import { exportXlsx } from '../xlsx';
import { sheetRows, costRows, compareRows, docBook } from '../exports';
import { useStore, FIXED_DEFAULT } from '../store';
import { useAsk } from '../ui/Ask';
import { useDocs } from '../docs';
import { won, DEFAULT_RATES, type CostRates, type CostKey } from '../engine';

const FIX_CHOICES: [CostKey, string][] = [['health', '건강보험료'], ['pension', '연금보험료'], ['care', '노인장기요양보험료'], ['retire', '퇴직공제부금비'], ['safety', '산업안전보건관리비'], ['env', '환경보전비'], ['ind', '산재보험료'], ['emp', '고용보험료']];

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
  const off = new Set<string>(s.exclude ?? []);
  const fixedKeys = s.fixedKeys ?? FIXED_DEFAULT;
  const setRound = (v: number) => { set((st) => ({ ...st, roundAdj: { ...(st.roundAdj ?? {}), [key]: v } })); toast(`단수정리값 ${won(v, { zero: '0', tri: false })}원 — 이윤 ${won(Math.trunc(v / (1 + R.vat)), { zero: '0', tri: false })}원 반영`); };
  const fitTotal = async () => {
    const t = await ask({ title: '도급액 맞추기', label: `${d.name} 도급액(부가세 포함)을 얼마로 맞출까요? 단수정리값을 찾아 이윤에 TRUNC(값 ÷ 1.1)로 넣습니다.`, value: String(d.cost.total) });
    if (!t) return;
    const target = Number(t.replace(/[^0-9]/g, ''));
    const cur = s.roundAdj?.[key] ?? 0;
    // 단수정리값을 바꾸면 이윤(공급가액)이 TRUNC(x/1.1) 만큼, 도급액은 그 1.1배쯤 바뀐다 — 가까운 값부터 찾아본다
    const vat = R.vat;
    const H0 = d.cost.supply - Math.trunc(cur / (1 + vat));
    const J = (x: number) => { const H = H0 + Math.trunc(x / (1 + vat)); return H + Math.floor(H * vat + 1e-9); };
    const guess = Math.round((target - J(0)));
    let best = guess, bestErr = Infinity;
    for (let dx = -30; dx <= 30; dx++) { const x = guess + dx; const e = Math.abs(J(x) - target); if (e < bestErr || (e === bestErr && Math.abs(x) < Math.abs(best))) { best = x; bestErr = e; } }
    setRound(best);
    if (bestErr) toast(`정확히 ${won(target)}원은 안 되고 ${won(J(best))}원이 가장 가깝습니다 (단수정리값 ${won(best, { zero: '0', tri: false })})`);
  };
  const toggleRow = () => {
    const r = d.cost.rows.find((x) => x.key === sel);
    if (!r) { toast('끄거나 켤 비목을 표에서 먼저 고르세요'); return; }
    if (!r.optional && !off.has(r.key)) { toast(`${r.label}은(는) 요율 비목이 아니라 끌 수 없습니다`); return; }
    set((st) => { const cur = new Set(st.exclude ?? []); if (cur.has(r.key)) cur.delete(r.key); else cur.add(r.key); return { ...st, exclude: [...cur] }; });
    toast(off.has(r.key) ? `${r.label}을(를) 다시 넣었습니다` : `${r.label}을(를) 뺐습니다 — 모든 문서의 원가계산서에 같이 적용됩니다`);
  };

  return (
    <Shell
      doc={`원가계산서 : ${d.name}`}
      toolbar={<>
        <Group label="요율">
          <FB icon="pct" label="요율" title="요율 기준 바꾸기" onClick={() => document.getElementById('rates')?.scrollIntoView()} />
          <FB icon="trash" label="기본 요율" onClick={() => { set((st) => ({ ...st, rates: {} })); toast('요율을 기본값으로 되돌렸습니다'); }} />
        </Group>
        <Group label="비목">
          <FB icon="del" label={sel && off.has(sel) ? '비목 켜기' : '비목 끄기'} title="고른 비목을 이 공사의 모든 원가계산서에서 빼거나 다시 넣기 (요율로 계산하는 비목만)" onClick={toggleRow} />
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
          <FB icon="recalc" label="재계산" primary onClick={() => toast(`전체재계산 — ${d.name} 도급액 ${won(d.cost.total)}원`)} />
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
          <h2 style={{ marginTop: 14 }}>단수정리 ({d.name})</h2>
          <div className="hint">이윤 = 원래 이윤 수식 + TRUNC(단수정리값 ÷ 1.1, 0). 도급액(부가세 포함)이 1원씩 안 맞을 때 넣습니다.</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="k">단수정리값</span>
            <input className="q" style={{ width: 110 }} key={`${key}-${s.roundAdj?.[key] ?? 0}`} defaultValue={s.roundAdj?.[key] ?? 0}
              onBlur={(e) => { const v = Math.trunc(Number(e.target.value.replace(/[^0-9.-]/g, '')) || 0); if (v !== (s.roundAdj?.[key] ?? 0)) setRound(v); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />원</label>
          <div className="calc"><div className="r"><span>이윤에 반영</span><b>{won(Math.trunc((s.roundAdj?.[key] ?? 0) / (1 + R.vat)), { zero: '0' })}</b></div><div className="r"><span>도급액</span><b>{won(d.cost.total)}</b></div></div>
          <button type="button" className="btn" onClick={fitTotal}>도급액 맞추기…</button>
          <h2 style={{ marginTop: 14 }}>설계가 고정 비목</h2>
          <div className="hint">착공·설계변경 원가계산서에서 낙찰률과 상관없이 설계내역서 금액을 그대로 씁니다.</div>
          {FIX_CHOICES.map(([k, lab]) => (
            <label key={k} style={{ display: 'flex', gap: 6 }}><input type="checkbox" checked={fixedKeys.includes(k)} onChange={(e) => set((st) => { const cur = new Set(st.fixedKeys ?? FIXED_DEFAULT); if (e.target.checked) cur.add(k); else cur.delete(k); return { ...st, fixedKeys: [...cur] }; })} />{lab}</label>
          ))}
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
                  <td className="n">{off.has(r.key) ? <span className="cf">뺌</span> : r.amount === null ? '' : won(r.amount, { zero: '0' })}</td>
                  <td className="c">{r.fixed ? <span className="cf">설계가 고정</span> : r.rate ?? ''}</td>
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
