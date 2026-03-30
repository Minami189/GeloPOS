const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const url = require('url');
const express = require('express');

let server;

function startServer() {
  const exp = express();
  
  // Serve everything inside 'dist' folder
  exp.use(express.static(path.join(__dirname, 'dist')));
  
  // React Native Web Router fallback
  exp.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });

  return new Promise((resolve) => {
    server = exp.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

async function createWindow() {
  const port = await startServer();

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: false,
    autoHideMenuBar: true,
    show: false, // Wait until ready to show
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true // Safe to use standard remote web security configs now
    }
  });

  // Forcibly grab Windows OS keyboard foreground focus
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);
  });

  // Hide the default menu bar
  Menu.setApplicationMenu(null);

  // Load the web app over standard localhost to simulate the real Web PWA perfectly
  mainWindow.loadURL(`http://127.0.0.1:${port}`);

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

// Clean up server
app.on('before-quit', () => {
  if (server) {
    server.close();
  }
});
