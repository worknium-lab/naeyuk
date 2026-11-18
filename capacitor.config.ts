import type { CapacitorConfig } from '@capacitor/cli';

// 안드로이드 앱 (scripts/build-apk.sh — 홈 서버에서 빌드). 웹 화면은 dist (VITE_REQUIRE_LOGIN=1 로 빌드)
const config: CapacitorConfig = {
  appId: 'com.worknium.naeyuk',
  appName: 'WORKNIUM 적산',
  webDir: 'dist',
  android: { backgroundColor: '#F1EFEA' },
};

export default config;
