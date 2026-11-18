// 로그인 (그룹웨어 홈 서버 Supabase 계정). VITE_REQUIRE_LOGIN=1 로 빌드할 때만 씀 — 서버(gw.worknium.co.kr/estimation)와 안드로이드 앱
//   아이디만 적으면 적산 계정(<아이디>@naeyuk.local) → 안 되면 그룹웨어 계정(<아이디>@worknium.local) 순서로 로그인
//   열 수 있는지는 서버 DB 함수 groupware.estimation_access 가 정함 (적산 계정 · 대표 · 기술팀)
//   웹에서는 토큰을 쿠키 gw_at 에도 넣음 → nginx가 이 쿠키로 프로그램 파일을 줄지 정함
const API = ((import.meta.env.VITE_API_URL as string | undefined) || 'https://api.worknium.co.kr').replace(/\/$/, '');
const ANON = (import.meta.env.VITE_ANON_KEY as string | undefined) ?? '';
export const LOGIN_REQUIRED = import.meta.env.VITE_REQUIRE_LOGIN === '1';
const KEY = 'naeyuk-auth';

type Sess = { access_token: string; refresh_token: string; expires_at: number; email: string };
const now = () => Math.floor(Date.now() / 1000);

function load(): Sess | null { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } }
function cookie(t: string, age: number) {
  document.cookie = `gw_at=${t}; path=/estimation; max-age=${age}; samesite=strict${location.protocol === 'https:' ? '; secure' : ''}`;
}
function save(s: Sess) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ }
  cookie(s.access_token, Math.max(60, s.expires_at - now()));
}
function clear() { try { localStorage.removeItem(KEY); } catch { /* */ } cookie('', 0); }

async function token(body: object, grant: 'password' | 'refresh_token'): Promise<Sess | number> {
  const r = await fetch(`${API}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) return r.status;
  const j = await r.json();
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at ?? now() + (j.expires_in ?? 3600), email: j.user?.email ?? '' };
}
async function allowed(t: string): Promise<number> {
  const r = await fetch(`${API}/rest/v1/rpc/estimation_access`, { headers: { apikey: ANON, Authorization: `Bearer ${t}`, 'Accept-Profile': 'groupware' } });
  return r.status;
}

/** 로그인. 성공하면 null, 아니면 화면에 보일 말 */
export async function login(id: string, pw: string): Promise<string | null> {
  id = id.trim();
  if (!id || !pw) return '아이디와 비밀번호를 넣어 주세요';
  const emails = id.includes('@') ? [id] : [`${id}@naeyuk.local`, `${id}@worknium.local`];
  try {
    for (const email of emails) {
      const s = await token({ email, password: pw }, 'password');
      if (typeof s === 'number') continue;
      const st = await allowed(s.access_token);
      if (st === 200) { save(s); return null; }
      if (st === 401 || st === 403) return '이 계정은 적산프로그램을 열 권한이 없어요';
      return `서버 확인에 실패했어요 (${st})`;
    }
    return '아이디 또는 비밀번호가 맞지 않아요';
  } catch {
    return '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요';
  }
}

/** 시작할 때·주기적으로: 로그인 유지 확인 (토큰 새로 받기). 인터넷이 끊겼으면 전에 로그인한 상태로 계속 */
export async function ensure(): Promise<'ok' | 'login' | 'denied'> {
  let s = load();
  if (!s) return 'login';
  try {
    if (s.expires_at - now() < 300) {
      const n = await token({ refresh_token: s.refresh_token }, 'refresh_token');
      if (typeof n === 'number') { clear(); return 'login'; }
      s = n; save(s);
    }
    const st = await allowed(s.access_token);
    if (st === 200) { save(s); return 'ok'; }
    if (st === 403) return 'denied';
    if (st === 401) { clear(); return 'login'; }
    return 'ok';
  } catch {
    return 'ok'; // 인터넷 없음 — 이 기기에서 이미 로그인했으므로 계속 (현장용)
  }
}

export function goLogin(why?: 'denied') { location.replace(`./login.html${why ? '?denied=1' : ''}`); }

export function logout() { clear(); goLogin(); }

export function keepFresh() {
  setInterval(() => { ensure().then((r) => { if (r !== 'ok') goLogin(r === 'denied' ? 'denied' : undefined); }); }, 10 * 60 * 1000);
}

export const loginEmail = () => load()?.email ?? '';
