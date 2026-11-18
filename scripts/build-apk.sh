#!/usr/bin/env bash
# ============================================================
# 적산프로그램(가칭) 안드로이드 앱(APK) 빌드 — 홈 서버에서 실행
#   cd ~/naeyuk && git pull && ./scripts/build-apk.sh
# 결과: ~/naeyuk-apk/naeyuk.apk  → https://gw.worknium.co.kr/estimation/app.apk (로그인해야 받음)
#       ~/worknium-site-apk/wnest/app.apk → https://www.worknium.co.kr/wnest (홈페이지 회사 ID wnest, 받기는 누구나 · 쓰려면 로그인)
# 앱은 시작할 때 로그인 (서버 api.worknium.co.kr 계정 확인). 서명 키·암호는 ~/worknium-secrets (처음 한 번 만듦)
# 안드로이드 SDK는 ~/android-sdk 에 처음 한 번 받음 (약 1GB)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."; REPO="$PWD"
SUPA_DIR="${SUPA_DIR:-$HOME/supabase/docker}"
SEC="$HOME/worknium-secrets"; OUT="${APK_OUT:-$HOME/naeyuk-apk}"; SDK="${ANDROID_SDK_DIR:-$HOME/android-sdk}"; GCACHE="$HOME/.cache/naeyuk-gradle"
ok() { printf '  \033[32m✓ %s\033[0m\n' "$*"; }
ANON=$(grep -E '^ANON_KEY=' "$SUPA_DIR/.env" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
[ -n "$ANON" ] || { echo "ANON_KEY를 못 찾았어요 ($SUPA_DIR/.env)"; exit 1; }
mkdir -p "$SEC" "$OUT" "$SDK" "$GCACHE"; chmod 700 "$SEC"
PWF="$SEC/naeyuk-keystore-password"
[ -s "$PWF" ] || { head -c 48 /dev/urandom | base64 | tr -dc A-Za-z0-9 | head -c 32 > "$PWF"; chmod 600 "$PWF"; }
N=$(( $(cat "$OUT/version-code" 2>/dev/null || echo 0) + 1 ))
ME="$(id -u):$(id -g)"

# 1) 웹 화면 빌드 (로그인 켬) → 안드로이드 프로젝트에 복사
docker run --rm -v "$REPO":/app -w /app -e VITE_REQUIRE_LOGIN=1 -e VITE_API_URL=https://api.worknium.co.kr -e VITE_ANON_KEY="$ANON" node:22 \
  sh -c "npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null && npx cap sync android >/dev/null" && ok "웹 화면 빌드 · 안드로이드에 복사"

# 2) 서명 키(처음 한 번) · SDK(처음 한 번) · APK 빌드
docker run --rm -v "$REPO":/app -v "$SDK":/sdk -v "$SEC":/sec -v "$GCACHE":/root/.gradle -w /app/android \
  -e ANDROID_HOME=/sdk -e NY_KEYSTORE_PASSWORD="$(cat "$PWF")" -e NY_VERSION_CODE="$N" -e NY_VERSION_NAME="1.0.$N" -e ME="$ME" \
  eclipse-temurin:21-jdk bash -euc '
    if [ ! -s /sec/naeyuk-release.jks ]; then
      keytool -genkeypair -keystore /sec/naeyuk-release.jks -alias naeyuk -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass "$NY_KEYSTORE_PASSWORD" -keypass "$NY_KEYSTORE_PASSWORD" -dname "CN=WORKNIUM, O=WORKNIUM, C=KR" >/dev/null 2>&1
      chown "$ME" /sec/naeyuk-release.jks; chmod 600 /sec/naeyuk-release.jks; echo "  ✓ 서명 키를 새로 만들었어요 (~/worknium-secrets/naeyuk-release.jks — 잃어버리면 앱 업데이트 설치가 안 돼요)"
    fi
    if [ ! -x /sdk/cmdline-tools/latest/bin/sdkmanager ]; then
      (command -v unzip && command -v curl) >/dev/null || { apt-get update -qq && apt-get install -y -qq unzip curl >/dev/null; }
      curl -sSfLo /tmp/ct.zip https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
      mkdir -p /sdk/cmdline-tools && unzip -q /tmp/ct.zip -d /sdk/cmdline-tools && mv /sdk/cmdline-tools/cmdline-tools /sdk/cmdline-tools/latest
    fi
    yes | /sdk/cmdline-tools/latest/bin/sdkmanager --licenses >/dev/null 2>&1 || true
    /sdk/cmdline-tools/latest/bin/sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools" >/dev/null
    cp /sec/naeyuk-release.jks app/naeyuk-release.jks
    trap "rm -f app/naeyuk-release.jks" EXIT
    chmod +x gradlew && ./gradlew assembleRelease --no-daemon -q
  ' && ok "APK 빌드 (1.0.$N)"

cp "$REPO/android/app/build/outputs/apk/release/app-release.apk" "$OUT/naeyuk.apk"
echo "$N" > "$OUT/version-code"
printf '{"version":"1.0.%s","size":%s,"built_at":"%s","commit":"%s"}\n' "$N" "$(stat -c %s "$OUT/naeyuk.apk")" "$(date -Iseconds)" "$(git -C "$REPO" log -1 --format=%h)" > "$OUT/latest.json"
ok "$OUT/naeyuk.apk → https://gw.worknium.co.kr/estimation/app.apk"
SITE="${SITE_APK_DIR:-$HOME/worknium-site-apk}/wnest"; mkdir -p "$SITE"
cp "$OUT/naeyuk.apk" "$SITE/app.apk"
printf '{"version":"1.0.%s","size":%s,"updated":"%s"}\n' "$N" "$(stat -c %s "$SITE/app.apk")" "$(date -u +%FT%TZ)" > "$SITE/app.json"
ok "홈페이지 www.worknium.co.kr/wnest 앱 받기에도 올림"
