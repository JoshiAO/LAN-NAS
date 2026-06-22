const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const Bonjour = require('bonjour-service');
const WebSocket = require('ws');

const bonjour = new Bonjour.Bonjour();
let wsClient = null;
let serverHttpUrl = null;

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    icon: path.join(__dirname, 'lannas.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('close', function (event) {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function findServer() {
  console.log('Searching for LAN-NAS Server...');
  bonjour.find({ type: 'http' }, function (service) {
    if (service.name.includes('LAN-NAS')) {
      serverHttpUrl = `http://${service.addresses[0]}:${service.port}`;
      const wsUrl = `ws://${service.addresses[0]}:${service.port}/ws`;
      console.log('Found Server at:', serverHttpUrl);
      
      wsClient = new WebSocket(wsUrl);
      wsClient.on('open', () => console.log('Connected to Server WS'));
      wsClient.on('message', data => console.log('WS msg:', data.toString()));
      
      if (mainWindow) mainWindow.webContents.send('server-found', serverHttpUrl);
    }
  });
}

app.whenReady().then(() => {
  findServer();
  createWindow();

  const iconImage = nativeImage.createFromPath(path.join(__dirname, 'lannas.ico'));
  tray = new Tray(iconImage);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Dashboard', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit LAN-NAS Sync', click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('LAN-NAS Sync Client');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  // Do nothing. We want the app to stay alive in the tray.
});

// Chokidar file watcher setup
let watcher = null;

ipcMain.on('get-server-url', (event) => {
  if (serverHttpUrl) {
    event.reply('server-found', serverHttpUrl);
  }
});

const { SyncClient } = require('./sync_client.cjs');
let syncClientInstance = null;

const axios = require('axios');

ipcMain.on('start-watch', (event, data) => {
  const { folderPath, username, password } = data;

  if (watcher) {
    watcher.close();
  }
  
  if (!serverHttpUrl) {
    event.reply('watch-status', 'Server not found yet');
    return;
  }

  event.reply('watch-status', 'Authenticating...');

  const authBody = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  // Login to get token
  axios.post(`${serverHttpUrl}/auth/login`, `grant_type=password&${authBody}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  .then(response => {
        const token = response.data.access_token;
        syncClientInstance = new SyncClient(serverHttpUrl, folderPath, token);

        const indicatorPath = path.join(folderPath, 'LAN-NAS-SYNC.txt');
        try {
          if (!fs.existsSync(indicatorPath)) {
            fs.writeFileSync(indicatorPath, `DO NOT DELETE: This folder is actively synced with the LAN-NAS Server by user: ${username}.\n\nThis file serves as a physical indicator that this directory is currently managed by LAN-NAS Sync.`);
          }
          
          // Folder Tagging Logic
          const iconSource = path.join(__dirname, 'lannas.ico');
          const iconTarget = path.join(folderPath, '.lannas.ico');
          const iniTarget = path.join(folderPath, 'desktop.ini');
          
          if (fs.existsSync(iconSource)) {
            fs.copyFileSync(iconSource, iconTarget);
            fs.writeFileSync(iniTarget, '[.ShellClassInfo]\nIconResource=.lannas.ico,0\n');
            
            const { exec } = require('child_process');
            exec(`attrib +h "${iconTarget}" & attrib +s +h "${iniTarget}" & attrib +r "${folderPath}"`, (err) => {
              if (err) console.error("Failed to set folder attributes:", err);
            });
          }
        } catch (err) {
          console.error("Failed to write sync indicator or tag folder", err);
        }

        watcher = chokidar.watch(folderPath, {
          ignored: [/(^|[\/\\])\../, '**/LAN-NAS-SYNC.txt'], // ignore dotfiles and indicator
          persistent: true
        });

        watcher
          .on('add', filePath => {
            event.reply('file-event', { type: 'add', path: filePath });
            if (syncClientInstance) syncClientInstance.handleFileChange(filePath);
          })
          .on('change', filePath => {
            event.reply('file-event', { type: 'change', path: filePath });
            if (syncClientInstance) syncClientInstance.handleFileChange(filePath);
          })
          .on('unlink', filePath => {
            event.reply('file-event', { type: 'unlink', path: filePath });
            if (syncClientInstance) syncClientInstance.handleFileDelete(filePath);
          });
          
        event.reply('watch-status', `Watching: ${folderPath}`);
      })
      .catch(err => {
        console.error("Auth failed:", err.message);
        event.reply('watch-status', 'Auth Failed');
      });
});

ipcMain.on('stop-watch', (event) => {
  if (watcher) {
    watcher.close();
    watcher = null;
    event.reply('watch-status', 'Stopped watching.');
  }
});

ipcMain.handle('open-directory-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result;
});

const { clearAllState } = require('./db.cjs');
ipcMain.on('clear-local-db', () => {
  clearAllState();
});
