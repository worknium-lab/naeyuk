// 리눅스에서 창을 띄워 화면을 찍고 끝내는 확인용 (배포에는 넣지 않음)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1400, height: 850, show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  const errs = [];
  w.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message); });
  await w.loadFile(path.join(__dirname, 'app', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));
  await w.webContents.executeJavaScript("location.hash='#/project'");
  await new Promise((r) => setTimeout(r, 800));
  fs.writeFileSync('/tmp/xt/electron.png', (await w.webContents.capturePage()).toPNG());
  const info = await w.webContents.executeJavaScript("({self: window.self===window.top, title: document.title, ls: Object.keys(localStorage)})");
  console.log(JSON.stringify(info), errs.slice(0, 3));
  app.quit();
});
