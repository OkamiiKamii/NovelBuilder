// The desktop app: a window onto the same web app, with its files inside the
// app itself, so it needs no server and no connection. The pages are served
// under app://novel-builder/, a fixed and secure address, which is what keeps
// the projects (stored by the browser engine per address) where they are
// from one launch to the next.
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'web');
const HOME = 'app://novel-builder/';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// One copy of the app at a time: two would be two writers to the same store.
if (!app.requestSingleInstanceLock()) app.quit();

function open() {
  const win = new BrowserWindow({ width: 1320, height: 880, minWidth: 360, minHeight: 480, title: 'Novel Builder', backgroundColor: '#f6f3ee', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true } });
  const outside = (url) => !url.startsWith(HOME);
  // Links that lead out of the app (a web page, an email) open in the system's own browser or mail program.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (outside(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!outside(url)) return;
    event.preventDefault();
    if (/^(https?|mailto):/.test(url)) void shell.openExternal(url);
  });
  void win.loadURL(HOME);
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const wanted = path.normalize(path.join(ROOT, decodeURIComponent(new URL(request.url).pathname)));
    // Every address that is not a file of the app is a page of it: the app works out which.
    const inside = wanted.startsWith(ROOT) && fs.existsSync(wanted) && fs.statSync(wanted).isFile();
    return net.fetch(pathToFileURL(inside ? wanted : path.join(ROOT, 'index.html')).toString());
  });
  open();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && open());
});
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
