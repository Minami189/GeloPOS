const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const url = require('url');

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Necessary for local file access if assets use cross-origin
    }
  });

  // Hide the default menu bar
  Menu.setApplicationMenu(null);

  // Load the web app
  // We use protocol 'file:' with the absolute path to dist/index.html
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'dist', 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open the DevTools to debug why it's secretly blank/hanging
  mainWindow.webContents.openDevTools();

  // Handle errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
}

// Ensure the App starts
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
