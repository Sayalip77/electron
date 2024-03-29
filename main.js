// Modules to control application life and create native browser window
const { app, BrowserWindow, session, Menu, Tray, dialog } = require("electron");
const path = require("path");
const Store = require("electron-store");
const store = new Store();
const log = require('electron-log');
const {autoUpdater} = require("electron-updater");

let mainWindow = null;
let force_quit = false;
let isMainWindowHidden = false;
let tray = null;

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

const menu = Menu.buildFromTemplate([
  {
    label: "File",
    submenu: [
      {
        label: "About App",
        click: openAboutWindow,
      },
      {
        label: "Quit",
        accelerator: "CmdOrCtrl+Q",
        click: function () {
          force_quit = true;
          app.quit();
        },
      },
    ],
  },
]);

function openAboutWindow() {
  dialog
    .showMessageBox(mainWindow, {
      message: `Version ${app.getVersion()} copyright by WeConnect.Chat`,
      buttons: ["ok"],
      defaultId: 0, // bound to buttons array
    })
    .then((result) => {
      console.log("result :::>", result);
    });
}

function createWindow(width, height) {
  try {
    Menu.setApplicationMenu(menu);
  } catch (error) {}
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false
    },
  });

  const loading = new BrowserWindow({
    parent: mainWindow,
    width: width,
    height: height,
    show: false,
    frame: true,
    alwaysOnTop: false,
  });

  loading.loadFile("index.html");
  loading.show();
  loading.maximize();

  loading.webContents.once("dom-ready", () => {
    const isFirstTime = store.get("hasOpen");
    const appVersion = store.get("app-version");
    store.set("needToClear", false);
    if (!isFirstTime || appVersion !== app.getVersion()) {
      store.set("hasOpen", true);
      store.set("app-version", app.getVersion());
      mainWindow.webContents.session.clearStorageData();
    }
    mainWindow.webContents.once("dom-ready", () => {
      console.log("main loaded");
      log.warn('App: Main loaded sucessfully..');
      mainWindow.show();
      mainWindow.maximize();
      isMainWindowHidden = false;
      loading.hide();
      loading.close();

      if (tray) {
        tray.destroy();
      }
      if (process.platform !== "darwin") {
        tray = new Tray(
          path.join(__dirname, "./assets/win/weconnect_icon.ico")
        );
        const contextMenu = Menu.buildFromTemplate([
          {
            label: "Quit",
            type: "normal",
            click: function () {
              force_quit = true;
              app.quit();
            },
          },
        ]);

        tray.setContextMenu(contextMenu);

        tray?.on("click", function (e) {
          if (isMainWindowHidden) {
            mainWindow.show();
            mainWindow.maximize();
          }
        });
      }
    });

    mainWindow.loadURL("https://app.weconnect.chat/agent/dashboard");
    mainWindow.webContents.on("new-window", (e, currentURL) => {
      if (!currentURL.includes("https://accounts.google")) {
        if (currentURL.includes("https://app.weconnect.chat/agent/dashboard")) {
          e.preventDefault();
          mainWindow.show();
          mainWindow.maximize();
        } else {
          e.preventDefault();
          require("electron").shell.openExternal(currentURL);
        }
      }
    });

    mainWindow.on("close", function (e) {
      if (!force_quit) {
        e.preventDefault();
        mainWindow.hide();
        isMainWindowHidden = true;
      }
    });
  });

  try {
    mainWindow.webContents.on('unresponsive', async () => {
      const { response } = await dialog.showMessageBox({
        message: 'WeConnect App has become unresponsive',
        title: 'Do you want to try forcefully reloading the app?',
        buttons: ['OK', 'Cancel'],
        cancelId: 1
      })
      if (response === 0) {
        mainWindow.webContents.forcefullyCrashRenderer();
        mainWindow.webContents.reload();
        log.warn('Warn: App Reloaded..');
      }
      log.warn('Warn: Unresponsive function successful..');
    });
  } catch (e) {
      log.error('Error: Unresponsive function failed..');
  }
  // Open the DevTools.
  //mainWindow.webContents.openDevTools();
  // loading.webContents.openDevTools();
}

function sendStatusToWindow(text) {
  log.info(text);
  mainWindow.webContents.send('message', text);
}

autoUpdater.on('checking-for-update', () => {
  sendStatusToWindow('Checking for update...');
  log.warn('Checking for update...');
})
autoUpdater.on('update-available', (info) => {
  sendStatusToWindow('Update available.');
  log.warn('Update available.');
})
autoUpdater.on('update-not-available', (info) => {
  sendStatusToWindow('Update not available.');
  log.warn('Update not available.');
})
autoUpdater.on('error', (err) => {
  sendStatusToWindow('Error in auto-updater. ' + err);
  log.error(`Error: ${err}`);
})
autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  sendStatusToWindow(log_message);
  log.warn(log_message);
})
autoUpdater.on('update-downloaded', (info) => {
  sendStatusToWindow('Update downloaded');
  log.warn('Update downloaded');
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (isMainWindowHidden) {
        mainWindow.show();
        mainWindow.maximize();
      }
      mainWindow.focus();
    }
  });

  // Create myWindow, load the rest of the app, etc...
  app.whenReady().then(() => {
    const { screen } = require("electron");
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    createWindow(width, height);

    app.on("activate", function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(width, height);
      } else if (isMainWindowHidden) {
        mainWindow.show();
        isMainWindowHidden = false;
      }
    });
    autoUpdater.checkForUpdatesAndNotify();
  });
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
app.on("before-quit", function (e) {
  // Handle menu-item or keyboard shortcut quit here
  if (!force_quit) {
    e.preventDefault();
    mainWindow.hide();
    isMainWindowHidden = true;
  }
});

// This is another place to handle events after all windows are closed
app.on("will-quit", function () {
  // This is a good place to add tests insuring the app is still
  // responsive and all windows are closed.
  console.log("will-quit");
  mainWindow = null;
});
