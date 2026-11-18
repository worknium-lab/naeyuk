import { ensure, login } from './auth';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('f'), msg = $('msg'), btn = $<HTMLButtonElement>('go');
const show = (t: string) => { msg.textContent = t; msg.hidden = !t; };

if (new URLSearchParams(location.search).has('denied')) show('이 계정은 적산프로그램을 열 권한이 없어요. 다른 계정으로 로그인해 주세요');
else ensure().then((r) => { if (r === 'ok') location.replace('./'); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true; show('');
  const err = await login($<HTMLInputElement>('id').value, $<HTMLInputElement>('pw').value);
  btn.disabled = false;
  if (err) show(err); else location.replace('./');
});
