import { useState } from 'react';
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AskProvider, canPrint } from './ui/Ask';
import { StoreProvider } from './store';
import { PopupCtx, type PopupKind } from './ui/Shell';
import Main from './screens/Main';
import Project from './screens/Project';
import Estimate from './screens/Estimate';
import CostSheet from './screens/CostSheet';
import Phase from './screens/Phase';
import Progress from './screens/Progress';
import Subcontract from './screens/Subcontract';
import SubCompare from './screens/SubCompare';
import Change from './screens/Change';
import Guide from './screens/Guide';
import { UnitCost, Calc, Machine, Material, Labor, Quote } from './screens/Basis';
import { Pumsem, MarketPrice, RefCopy } from './screens/Popups';
import { MobileHome, MobileEstimate, MobileCost } from './screens/Mobile';

/** claude.ai 같은 샌드박스 창 안에서는 주소창 해시를 못 쓰므로 메모리 라우터 */
const Router = canPrint() ? HashRouter : MemoryRouter;

export default function App() {
  const [kind, setKind] = useState<PopupKind>(null);
  const close = () => setKind(null);
  return (
    <StoreProvider>
      <Router>
        <AskProvider>
        <PopupCtx.Provider value={{ open: setKind, kind }}>
          <Routes>
            <Route path="/" element={<Main />} />
            <Route path="/project" element={<Project />} />
            <Route path="/estimate" element={<Estimate />} />
            <Route path="/cost" element={<CostSheet />} />
            <Route path="/phase" element={<Phase />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/sub" element={<Subcontract />} />
            <Route path="/sub/compare" element={<SubCompare />} />
            <Route path="/change" element={<Change />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/unit" element={<UnitCost />} />
            <Route path="/calc" element={<Calc />} />
            <Route path="/machine" element={<Machine />} />
            <Route path="/material" element={<Material />} />
            <Route path="/labor" element={<Labor />} />
            <Route path="/quote" element={<Quote />} />
            <Route path="/m" element={<MobileHome />} />
            <Route path="/m/estimate" element={<MobileEstimate />} />
            <Route path="/m/cost" element={<MobileCost />} />
          </Routes>
          {kind === 'pumsem' && <Pumsem onClose={close} />}
          {kind === 'market' && <MarketPrice onClose={close} />}
          {kind === 'refcopy' && <RefCopy onClose={close} />}
        </PopupCtx.Provider>
        </AskProvider>
      </Router>
    </StoreProvider>
  );
}
