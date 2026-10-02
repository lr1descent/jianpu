const { app, BrowserWindow, Menu, dialog, ipcMain, protocol } = require('electron');
const { access } = require('node:fs/promises');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { APP_URL, resourceResponse } = require('./protocol.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'jianpu', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
// Portable launchers extract into temporary folders; saved history must live elsewhere.
const userData = app.commandLine.getSwitchValue('user-data-dir') || path.join(app.getPath('appData'), 'JianpuSolfege');
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
app.setAppUserModelId('local.jianpu.solfege.windows');

let window;
let roundActive = false;
let confirmedExit = false;

function pauseRound() {
  if (!window || window.isDestroyed() || window.webContents.isLoadingMainFrame()) return;
  window.webContents.executeJavaScript("window.dispatchEvent(new Event('trainer:background'))")
    .catch(error => console.error('无法通知页面暂停：', error));
}
function zoom(delta) {
  if (window) window.webContents.setZoomFactor(delta === 0 ? 1 : Math.min(2, Math.max(.75, window.webContents.getZoomFactor() + delta)));
}
function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '应用', submenu: [
      { label: '关于简谱唱名', click: () => dialog.showMessageBox(window, { type: 'info', title: '简谱唱名', message: `简谱唱名 ${app.getVersion()}`, detail: '简谱识读 · 相对音程\n钢琴：Salamander Grand Piano\nAlexander Holm · CC BY 3.0\n音频、许可和 Chromium 均随应用提供。' }) },
      { type: 'separator' }, { label: '退出', accelerator: 'Alt+F4', click: () => window.close() },
    ] },
    { label: '编辑', submenu: [{ label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }] },
    { label: '显示', submenu: [
      { label: '放大', accelerator: 'CommandOrControl+=', click: () => zoom(.25) },
      { label: '缩小', accelerator: 'CommandOrControl+-', click: () => zoom(-.25) },
      { label: '实际大小', accelerator: 'CommandOrControl+0', click: () => zoom(0) },
    ] },
  ]));
}
async function openWindow() {
  const root = path.join(app.getAppPath(), 'web');
  await access(path.join(root, 'index.html'));
  protocol.handle('jianpu', request => resourceResponse(root, request));
  window = new BrowserWindow({
    title: '简谱唱名', width: 1080, height: 828, minWidth: 340, minHeight: 420,
    backgroundColor: '#f5f5f7', icon: path.join(app.getAppPath(), 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== APP_URL) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.on('will-download', event => event.preventDefault());
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith(APP_URL) && !details.url.startsWith(`blob:${APP_URL}`) });
  });
  ipcMain.on('round-state', (event, active) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== APP_URL || typeof active !== 'boolean') return;
    roundActive = active;
  });
  window.on('blur', pauseRound);
  window.on('minimize', pauseRound);
  window.on('hide', pauseRound);
  window.on('close', event => {
    if (confirmedExit || !roundActive) return;
    event.preventDefault();
    pauseRound();
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', title: '简谱唱名', message: '本轮还未结束',
      detail: '直接退出不会保存进行中的轮次。已完成的记录不受影响。也可以回到练习，先点击结束本轮。',
      buttons: ['继续练习', '退出应用'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice === 1) { confirmedExit = true; window.close(); }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    roundActive = false;
    dialog.showErrorBox('页面进程已停止', `进行中的轮次无法恢复，已结束的记录仍保留。请重新打开应用。\n${details.reason}`);
    app.quit();
  });
  createMenu();
  await window.loadURL(APP_URL);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(openWindow).catch(error => {
    dialog.showErrorBox('无法启动简谱唱名', error.message);
    confirmedExit = true;
    app.quit();
  });
}
