import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell, FB, Group, usePopup } from '../ui/Shell';
import { useStore } from '../store';
import { useDocs } from '../docs';
import { won } from '../engine';

const OTHERS = [
  { no: 5, name: '○○천 하천환경정비사업', client: '○○군', kind: '하천', phase: '당초', amount: '[금액]', date: '2026.11.11' },
  { no: 4, name: '○○초등학교 진입로 개설공사', client: '○○시', kind: '도로', phase: '1차 변경', amount: '[금액]', date: '2026.10.28' },
  { no: 3, name: '국도3호선 ○○교 보수공사', client: '○○국토관리사무소', kind: '교량 보수', phase: '준공', amount: '[금액]', date: '2026.09.03' },
  { no: 2, name: '○○배수지 증설공사', client: '○○수자원', kind: '상하수도', phase: '당초', amount: '[금액]', date: '2026.08.19' },
];

export default function Main() {
  const nav = useNavigate();
  const { toast } = useStore();
  const { open } = usePopup();
  const docs = useDocs();
  const design = docs.get('design');
  const [sel, setSel] = useState(6);
  const [cat, setCat] = useState('전체');
  return (
    <Shell
      doc="공사 목록"
      tabs="none"
      toolbar={<>
        <Group label="공사">
          <FB icon="new" label="새공사" onClick={() => toast('새 공사: 설계내역서와 착공내역서가 함께 만들어집니다 (프로토타입은 예시 공사 1개)')} />
          <FB icon="open" label="열기" primary onClick={() => nav('/project')} />
          <FB icon="docs" label="다른공사" title="다른 공사를 참고 창으로 열기" onClick={() => open('refcopy')} />
          <FB icon="copy" label="복사" onClick={() => toast('공사 복사 (준비 중)')} />
          <FB icon="trash" label="삭제" onClick={() => toast('예시 공사는 지울 수 없습니다')} />
        </Group>
        <Group label="가져오기">
          <FB icon="upload" label="EST" title="EST 파일 가져오기" onClick={() => toast('EST(.est) 가져오기는 데스크톱 판에서 붙입니다')} />
          <FB icon="excel" label="엑셀" title="엑셀 내역서 가져오기" onClick={() => toast('엑셀 내역서 가져오기 (준비 중)')} />
        </Group>
        <Group label="자료실">
          <FB icon="db" label="Main" onClick={() => toast('Main 데이터: 2026년 하반기')} />
          <FB icon="book" label="품셈" onClick={() => open('pumsem')} />
          <FB icon="recalc" label="자료갱신" onClick={() => nav('/labor')} />
        </Group>
      </>}
      info={<>
        <span><span className="k">작업 폴더</span> D:\적산\Data</span>
        <span><span className="k">단가 기준</span> 2026년 하반기 (노임 2026.9 공표)</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn pri" style={{ height: 26 }} onClick={() => nav('/guide')}>테스트 순서 보기</button>
        <span className="k">공사를 두 번 누르면 엽니다</span>
      </>}
      left={
        <nav className="lp" aria-label="공사 분류">
          <div className="lp-h">공사 분류</div>
          {['전체', '교량 보수', '도로', '하천', '상하수도'].map((c) => (
            <a key={c} href="#" className={cat === c ? 'on' : ''} onClick={(e) => { e.preventDefault(); setCat(c); }}>
              <span>{c}</span><span className="st">{c === '전체' ? 5 : c === '교량 보수' ? 2 : 1}</span>
            </a>
          ))}
          <div className="lp-h" style={{ marginTop: 10 }}>자료실</div>
          <a href="#" onClick={(e) => { e.preventDefault(); nav('/labor'); }}><span>노임단가 2026 하반기</span></a>
          <a href="#" onClick={(e) => { e.preventDefault(); open('pumsem'); }}><span>표준품셈 2026</span></a>
          <a href="#" onClick={(e) => { e.preventDefault(); open('market'); }}><span>표준시장단가 2026 하반기</span></a>
          <a href="#" onClick={(e) => { e.preventDefault(); nav('/material'); }}><span>자재단가</span></a>
        </nav>
      }
      right={
        <aside className="rp" aria-label="선택한 공사">
          <h2>국도43호선 용암교 보수공사</h2>
          <dl>
            <dt>발주처</dt><dd>○○국토관리사무소</dd>
            <dt>문서</dt><dd>설계 · 착공 · 차수 2 · 기성 3 · 하도급 {docs.subs.length}</dd>
          </dl>
          <table className="f" style={{ width: '100%' }}>
            <tbody>
              <tr><td>직접공사비</td><td className="n">{won(design.cost.get('A') + design.cost.get('dl') + design.cost.get('exp'))}</td></tr>
              <tr><td>순공사원가</td><td className="n">{won(design.cost.get('D'))}</td></tr>
              <tr><td>총원가</td><td className="n">{won(design.cost.get('H'))}</td></tr>
              <tr className="red"><td>도급액</td><td className="n">{won(design.cost.total)}</td></tr>
            </tbody>
          </table>
          <button type="button" className="btn pri" style={{ marginTop: 'auto' }} onClick={() => nav('/project')}>공사 열기</button>
        </aside>
      }
      footer={<><span>공사 5개</span><span>[금액] 칸은 예시용 빈칸입니다</span></>}
    >
      <div style={{ padding: 12 }}>
        <table className="f" style={{ width: '100%' }}>
          <thead><tr><th>번호</th><th>공  사  명</th><th>발 주 처</th><th>공종</th><th>차수</th><th>도급액 (원)</th><th>단가 기준</th><th>수정일</th></tr></thead>
          <tbody>
            {(cat === '전체' || cat === '교량 보수') && (
              <tr className={'click' + (sel === 6 ? ' sel' : '')} onClick={() => setSel(6)} onDoubleClick={() => nav('/project')}>
                <td className="c">6</td><td><b>국도43호선 용암교 보수공사</b></td><td>○○국토관리사무소</td><td className="c">교량 보수</td><td className="c">당초 · 2차분</td><td className="n">{won(design.cost.total)}</td><td className="c">2026.11</td><td className="c">2026.11.12</td>
              </tr>
            )}
            {OTHERS.filter((o) => cat === '전체' || o.kind === cat).map((o) => (
              <tr key={o.no} className={'click' + (sel === o.no ? ' sel' : '')} onClick={() => setSel(o.no)} onDoubleClick={() => toast('프로토타입은 용암교 공사만 열립니다. 다른 공사는 참고 내역서 창으로 볼 수 있습니다')}>
                <td className="c">{o.no}</td><td>{o.name}</td><td>{o.client}</td><td className="c">{o.kind}</td><td className="c">{o.phase}</td><td className="n">{o.amount}</td><td className="c">2026.11</td><td className="c">{o.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
