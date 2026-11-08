import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain, globalShortcut, Notification } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { startStandalone, StandaloneInstance } from '../server/standalone';

// Configuración oficial de la aplicación en Windows
app.setName('AgentHub');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.agenthub.desktop');
}

// Garantizar instancia única
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let standalone: StandaloneInstance | null = null;
let isQuitting = false;

const isHiddenLaunch = process.argv.includes('--hidden') || process.argv.includes('--background');

// Configuración de autoinicio en Windows
function configureAutoLaunch(enable: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: process.execPath,
      args: ['--hidden'],
      name: 'AgentHub'
    });
  } catch (err) {
    console.warn('[AgentHub Electron] Error al configurar inicio con Windows:', err);
  }
}

function getAppIconPath(): string {
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'icon.ico'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(__dirname, '..', '..', 'resources', 'icon.ico'),
    path.join(__dirname, '..', '..', 'resources', 'icon.png'),
    path.join(__dirname, 'resources', 'icon.png')
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? '';
}

function resolveStaticWebviewDir(): string {
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'webview'),
    path.join(app.getAppPath(), 'webview'),
    path.join(__dirname, '..', 'webview'),
    path.join(__dirname, '..', '..', 'dist', 'webview'),
    path.join(process.cwd(), 'dist', 'webview')
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

function createTray(iconPath: string) {
  if (tray) return;

  const trayIcon = iconPath && fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip('AgentHub - Multi-Agent AI Orchestrator');

  const updateContextMenu = () => {
    let autoLaunchEnabled = false;
    try {
      autoLaunchEnabled = app.getLoginItemSettings().openAtLogin;
    } catch {
      autoLaunchEnabled = true;
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir AgentHub',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Nuevo Chat',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.executeJavaScript(`
              if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('agenthub:new-chat'));
              }
            `).catch(() => {});
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Iniciar automáticamente con Windows',
        type: 'checkbox',
        checked: autoLaunchEnabled,
        click: (menuItem) => {
          configureAutoLaunch(menuItem.checked);
          updateContextMenu();
        }
      },
      { type: 'separator' },
      {
        label: 'Abrir en Navegador Externo',
        click: () => {
          if (standalone) {
            shell.openExternal(standalone.url);
          }
        }
      },
      {
        label: 'Abrir Carpeta de Datos (~/.agent-hub)',
        click: () => {
          shell.openPath(path.join(os.homedir(), '.agent-hub'));
        }
      },
      { type: 'separator' },
      {
        label: 'Salir de AgentHub',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray?.setContextMenu(contextMenu);
  };

  updateContextMenu();

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.focus();
      }
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  const iconPath = getAppIconPath();
  const staticDir = resolveStaticWebviewDir();

  console.log(`[AgentHub Electron] Usando webview estático desde: ${staticDir}`);
  console.log(`[AgentHub Electron] Ícono: ${iconPath}`);

  // Iniciar el servidor local Daemon
  try {
    standalone = await startStandalone({
      port: 3710,
      openBrowser: false,
      asApp: false,
      staticDir
    });
  } catch (err) {
    console.error('[AgentHub Electron] Error al iniciar backend daemon:', err);
    dialog.showErrorBox('AgentHub Error', 'No se pudo iniciar el servidor daemon de AgentHub.\n' + String(err));
    app.quit();
    return;
  }

  // Activar inicio automático con Windows de forma predeterminada
  try {
    const loginSettings = app.getLoginItemSettings();
    if (!loginSettings.openAtLogin) {
      configureAutoLaunch(true);
    }
  } catch {
    // ignorar error en modo desarrollo
  }

  createTray(iconPath);

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 890,
    minWidth: 960,
    minHeight: 640,
    title: 'AgentHub',
    icon: iconPath || undefined,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    }
  });

  // Interceptar navegación externa
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Minimizar a la bandeja del sistema en vez de cerrar
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!isHiddenLaunch) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // Atajos globales del sistema (Raycast/Spotlight style)
  try {
    const toggleApp = () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.executeJavaScript(`
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('agenthub:open-spotlight'));
            window.dispatchEvent(new CustomEvent('agenthub:focus-composer'));
          }
        `).catch(() => {});
      }
    };

    globalShortcut.register('CommandOrControl+Shift+Space', toggleApp);
    globalShortcut.register('Alt+Space', toggleApp);
  } catch (err) {
    console.warn('[AgentHub Electron] Error al registrar atajos globales:', err);
  }

  await mainWindow.loadURL(standalone.url);
}

// Reactivar si el usuario abre una segunda instancia
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (mainWindow === null) {
    void createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  try {
    globalShortcut.unregisterAll();
  } catch {}
  if (standalone) {
    try {
      await standalone.cleanup();
    } catch (err) {
      console.warn('[AgentHub Electron] Error durante cleanup:', err);
    }
  }
});
