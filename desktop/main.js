// WORKNIUM 적산 — 데스크톱 앱 (Electron)
// 웹 앱(app/index.html, 한 파일로 묶은 빌드)을 창 하나에 띄운다.
// 입력 내용은 이 PC의 앱 데이터 폴더(localStorage)에 저장되고, 엑셀·공사 파일은 저장 위치를 물어본다.
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');

app.setName('WORKNIUM 적산');
if (!app.requestSingleInstanceLock()) app.quit();

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: 'WORKNIUM 적산',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  Menu.setApplicationMenu(null); // 앱 안에 엑셀식 메뉴가 있으므로 창 메뉴는 숨김
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.maximize();

  // 바깥 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 내려받기(엑셀 · 공사 파일)는 저장 위치를 묻는다
  win.webContents.session.on('will-download', (_e, item) => {
    const p = dialog.showSaveDialogSync(win, { defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
    if (p) item.setSavePath(p); else item.cancel();
  });
  // F5 다시 그리기 · F12 개발자 도구 · Ctrl+휠 확대
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5') { win.webContents.reload(); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (input.control && (input.key === '=' || input.key === '+')) { win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5); e.preventDefault(); }
    if (input.control && input.key === '-') { win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5); e.preventDefault(); }
    if (input.control && input.key === '0') { win.webContents.setZoomLevel(0); e.preventDefault(); }
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
