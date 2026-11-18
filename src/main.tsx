import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LOGIN_REQUIRED, ensure, goLogin, keepFresh } from './auth/auth';
import './styles.css';

function start() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// 서버·안드로이드 앱 빌드(VITE_REQUIRE_LOGIN=1)는 로그인부터. 데스크톱·claude.ai 단일 파일은 그대로
if (LOGIN_REQUIRED) ensure().then((r) => { if (r === 'ok') { start(); keepFresh(); } else goLogin(r === 'denied' ? 'denied' : undefined); });
else start();
