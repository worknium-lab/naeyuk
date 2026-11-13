import { won } from '../engine';
import { useDocs } from '../docs';

/** 설계가 → 도급액 → 하도급대상액 → 하도급액 구성 도표 (겹친 금액을 차이로 쌓은 막대) */
export function BudgetBar({ compact = false }: { compact?: boolean }) {
  const docs = useDocs();
  const design = docs.get('design').cost;
  const start = docs.get('start').cost;
  const supplied = design.get('supplied');
  const designTotal = design.get('L') || design.total + supplied;
  const contract = start.total;
  const target = docs.subs.reduce((a, x) => a + x.result.target.total, 0);
  const sub = docs.subs.reduce((a, x) => a + x.result.sub.total, 0);
  const segs = [
    { key: 'sub', label: '하도급액', amt: sub, color: '#1B6B22' },
    { key: 'target', label: '하도급대상액', amt: target - sub, color: '#4CA830' },
    { key: 'contract', label: '도급액', amt: contract - target, color: '#149ED6' },
    { key: 'supplied', label: '관급자재', amt: supplied, color: '#9C2A97' },
    { key: 'design', label: '설계가', amt: designTotal - contract - supplied, color: '#1A1A1A' },
  ].filter((x) => x.amt > 0);
  const sum = segs.reduce((a, x) => a + x.amt, 0) || 1;
  const rows: [string, number, string?][] = [
    ['설계가', designTotal],
    ['총공사비', design.total],
    ['관급자재대', supplied],
    [`도급액 (설계 대비 ${design.total ? ((contract / design.total) * 100).toFixed(3) : '0'}%)`, contract],
    ['하도급대상액', target],
    [`하도급액 (대상 대비 ${target ? ((sub / target) * 100).toFixed(3) : '0'}%)`, sub],
  ];
  return (
    <div className={'bb' + (compact ? ' compact' : '')}>
      <div className="bb-bar" role="img" aria-label={`설계가 ${won(designTotal)}원 중 도급액 ${won(contract)}원, 하도급액 ${won(sub)}원`}>
        {segs.map((x) => {
          const w = (x.amt / sum) * 100;
          return (
            <div key={x.key} className="bb-seg" style={{ flexBasis: `${w}%`, background: x.color }} title={`${x.label} 구간 ${won(x.amt)}`}>
              <span className={w < 9 ? 'v' : ''}>{x.label}</span>
            </div>
          );
        })}
      </div>
      <div className="bb-list">
        {rows.map(([k, v], i) => (
          <div key={k} className={'bb-r' + (i === 0 ? ' top' : '')}>
            <span>{k}</span><b>{won(v, { zero: '0' })} 원</b>
          </div>
        ))}
      </div>
    </div>
  );
}
