import { app, BrowserWindow, Menu, Tray, clipboard, nativeImage, shell, dialog, ipcMain, globalShortcut, Notification } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { startStandalone, StandaloneInstance } from '../server/standalone';

// Registro del proceso principal en ~/.agent-hub/logs/main.log (rota a main.log.1 al pasar de 1 MB).
const LOG_FILE = path.join(os.homedir(), '.agent-hub', 'logs', 'main.log');
const LOG_MAX_BYTES = 1_000_000;

function logToFile(level: string, args: unknown[]): void {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    const text = args.map((arg) => (arg instanceof Error ? arg.stack ?? arg.message : typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${level}] ${text}\n`);
  } catch {}
}
for (const level of ['warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    logToFile(level, args);
  };
}
process.on('uncaughtException', (error) => {
  logToFile('fatal', [error]);
  dialog.showErrorBox('AgentHub', `Error inesperado: ${error.message}\nQuedó registrado en ${LOG_FILE}`);
});
process.on('unhandledRejection', (reason) => logToFile('unhandledRejection', [reason]));

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

const WINDOW_STATE_FILE = path.join(os.homedir(), '.agent-hub', 'window-state.json');
const ZOOM_STEP = 0.1;

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
  zoom?: number;
}

function loadWindowState(): WindowState {
  const fallback: WindowState = { width: 1360, height: 890 };
  try {
    const saved = JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf8')) as WindowState;
    if (!(saved.width >= 960 && saved.height >= 640)) return fallback;
    // Un monitor que ya no está conectado dejaría la ventana fuera de pantalla.
    const { screen } = require('electron') as typeof import('electron');
    const visible = typeof saved.x === 'number' && typeof saved.y === 'number'
      ? screen.getAllDisplays().some((d) => saved.x! >= d.bounds.x - 50 && saved.x! < d.bounds.x + d.bounds.width - 50 && saved.y! >= d.bounds.y - 50 && saved.y! < d.bounds.y + d.bounds.height - 50)
      : false;
    return visible ? saved : { ...fallback, zoom: saved.zoom };
  } catch {
    return fallback;
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    fs.mkdirSync(path.dirname(WINDOW_STATE_FILE), { recursive: true });
    const state: WindowState = { ...win.getNormalBounds(), maximized: win.isMaximized(), zoom: win.webContents.getZoomFactor() };
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state), 'utf8');
  } catch {}
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let standalone: StandaloneInstance | null = null;
let isQuitting = false;

function createDetachedWindow(targetUrl?: string): BrowserWindow {
  const iconPath = getAppIconPath();
  const isSolo = Boolean(targetUrl && targetUrl.includes('solo='));
  const detachedWin = new BrowserWindow({
    width: isSolo ? 480 : 980,
    height: isSolo ? 740 : 680,
    minWidth: isSolo ? 360 : 600,
    minHeight: 450,
    title: isSolo ? 'AgentHub (Chat Flotante · Fijado)' : 'AgentHub (Ventana Secundaria)',
    icon: iconPath || undefined,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    alwaysOnTop: isSolo,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    }
  });

  detachedWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      createDetachedWindow(url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  detachedWin.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    if (input.key === 'F12' || (mod && input.shift && input.key.toLowerCase() === 'i')) {
      detachedWin.webContents.toggleDevTools();
      event.preventDefault();
    } else if (mod && input.shift && input.key.toLowerCase() === 't') {
      const next = !detachedWin.isAlwaysOnTop();
      detachedWin.setAlwaysOnTop(next);
      detachedWin.setTitle(isSolo ? `AgentHub (Chat Flotante${next ? ' · Fijado' : ''})` : `AgentHub (Ventana Secundaria${next ? ' · Fijada' : ''})`);
      event.preventDefault();
    }
  });

  const urlToLoad = targetUrl || standalone?.url || 'http://127.0.0.1:3710';
  detachedWin.loadURL(urlToLoad).catch((err) => console.error('[AgentHub Electron] Error al cargar ventana flotante:', err));
  detachedWin.show();
  detachedWin.focus();
  return detachedWin;
}

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
        label: 'Copiar la dirección del servidor local',
        click: () => {
          if (standalone) clipboard.writeText(standalone.url);
        }
      },
      {
        label: 'Recargar la ventana',
        click: () => mainWindow?.webContents.reload()
      },
      {
        label: 'Herramientas de desarrollo',
        click: () => mainWindow?.webContents.toggleDevTools()
      },
      {
        label: 'Restablecer tamaño y posición de la ventana',
        click: () => {
          if (!mainWindow) return;
          mainWindow.unmaximize();
          mainWindow.setSize(1360, 890);
          mainWindow.center();
          mainWindow.show();
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
      staticDir,
      onPopOutWindow: (url?: string) => {
        createDetachedWindow(url);
      },
      onToggleAlwaysOnTop: () => {
        const focused = BrowserWindow.getFocusedWindow();
        if (focused) {
          const next = !focused.isAlwaysOnTop();
          focused.setAlwaysOnTop(next);
          const raw = focused.getTitle().replace(/ · Fijad[oa]/g, '');
          focused.setTitle(`${raw}${next ? ' · Fijado' : ''}`);
        }
      }
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

  const windowState = loadWindowState();
  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
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

  if (windowState.maximized) mainWindow.maximize();

  // El título de la página lleva los agentes en curso, p. ej. "(2) AgentHub" o "● 1 AgentHub":
  // se muestra en la bandeja y, si algo espera y la ventana no está al frente, parpadea en la barra de tareas.
  mainWindow.on('page-title-updated', (_event, title) => {
    tray?.setToolTip(title);
    if (title.startsWith('●') && mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true);
  });
  mainWindow.on('focus', () => mainWindow?.flashFrame(false));

  // Si la página se cae o no carga, se recupera sola en vez de dejar la ventana en blanco.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logToFile('render-process-gone', [details]);
    if (details.reason !== 'clean-exit') setTimeout(() => mainWindow?.webContents.reload(), 1000);
  });
  let loadRetries = 0;
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: carga cancelada a propósito
    logToFile('did-fail-load', [code, description, url]);
    if (loadRetries++ < 5) setTimeout(() => mainWindow?.loadURL(url), 2000);
  });
  mainWindow.on('unresponsive', () => logToFile('unresponsive', ['La ventana dejó de responder']));

  // El tamaño y la posición se guardan al moverse, no solo al cerrar: un cierre brusco no los pierde.
  let saveTimer: NodeJS.Timeout | undefined;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => mainWindow && saveWindowState(mainWindow), 1000);
  };
  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);
  if (windowState.zoom) mainWindow.webContents.setZoomFactor(windowState.zoom);

  // Atajos de ventana (el menú está oculto, así que no existen por sí solos).
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !mainWindow) return;
    const wc = mainWindow.webContents;
    const mod = input.control || input.meta;
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === 'F12' || (mod && input.shift && input.key.toLowerCase() === 'i')) {
      wc.toggleDevTools();
    } else if (mod && input.alt && input.key.toLowerCase() === 'w') {
      createDetachedWindow();
    } else if (mod && !input.shift && !input.alt && input.key.toLowerCase() === 'w') {
      mainWindow.hide(); // la app vive en la bandeja; cerrar la ventana no cierra los agentes
    } else if (mod && !input.shift && input.key.toLowerCase() === 'r') {
      wc.reload();
    } else if (mod && (input.key === '+' || input.key === '=')) {
      wc.setZoomFactor(Math.min(2, wc.getZoomFactor() + ZOOM_STEP));
    } else if (mod && (input.key === '-' || input.key === '_')) {
      wc.setZoomFactor(Math.max(0.6, wc.getZoomFactor() - ZOOM_STEP));
    } else if (mod && input.key === '0') {
      wc.setZoomFactor(1);
    } else {
      return;
    }
    event.preventDefault();
  });

  // Corrector ortográfico en español e inglés y menú contextual (Electron no trae ninguno).
  try {
    mainWindow.webContents.session.setSpellCheckerLanguages(['es', 'en-US']);
  } catch {}
  // Solo los permisos que la interfaz usa: micrófono, avisos, portapapeles y pantalla completa.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'].includes(permission))
  );
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => mainWindow?.webContents.replaceMisspelling(suggestion) });
    }
    if (params.misspelledWord) items.push({ type: 'separator' });
    if (params.linkURL) items.push({ label: 'Copiar dirección del enlace', click: () => clipboard.writeText(params.linkURL) });
    if (params.isEditable) items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' });
    else if (params.selectionText) items.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' });
    else items.push({ role: 'selectAll' });
    Menu.buildFromTemplate(items).popup();
  });

  // Interceptar navegación externa o ventanas flotantes locales
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      createDetachedWindow(url);
      return { action: 'deny' };
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
    if (mainWindow) saveWindowState(mainWindow);
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

  // Una versión anterior pudo dejar archivos de la interfaz en caché: se parte limpio para ver siempre la compilación actual.
  await mainWindow.webContents.session.clearCache().catch(() => {});
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
