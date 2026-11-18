import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // 로그인 화면(login.html)은 서버에서 로그인 전에도 받을 수 있는 파일 — assets/login.js · assets/auth.js 만 씀
      // 단일 파일(--mode single)은 프로그램만 — 로그인 없음
      input: mode === 'single' ? { app: 'index.html' } : { app: 'index.html', login: 'login.html' },
      output: {
        // 파일 이름을 고정해 두면 웹에 다시 올릴 때 같은 경로를 덮어쓴다
        entryFileNames: (c) => (c.name === 'login' ? 'assets/login.js' : 'assets/app.js'),
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
}));
