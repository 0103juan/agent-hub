#!/usr/bin/env node
// Tras compilar: la app de escritorio instalada debe leer el `dist` de este repo.
// El instalador (npm run package:win) deja una copia en resources/app/dist; aquí se cambia
// por un junction al repo para que cada build llegue a la app con solo recargar (Ctrl+R).
// Si Windows no deja mover la carpeta (app abierta), se copia el build encima. Nunca falla el build.
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) process.exit(0);

const repoDist = path.resolve(__dirname, '..', 'dist');
const installedDist = path.join(process.env.LOCALAPPDATA, 'Programs', 'AgentHub', 'resources', 'app', 'dist');

const same = (a, b) => {
  try {
    return fs.realpathSync(a).toLowerCase() === fs.realpathSync(b).toLowerCase();
  } catch {
    return false;
  }
};

try {
  if (!fs.existsSync(path.dirname(installedDist)) || !fs.existsSync(repoDist)) process.exit(0);
  if (same(installedDist, repoDist)) process.exit(0);

  try {
    if (fs.existsSync(installedDist)) {
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      fs.renameSync(installedDist, `${installedDist}.instalado-${stamp}`);
    }
    fs.symlinkSync(repoDist, installedDist, 'junction');
    console.log(`[agent-hub] App instalada enlazada a ${repoDist}`);
  } catch (error) {
    fs.cpSync(repoDist, installedDist, { recursive: true, force: true });
    console.log(`[agent-hub] No se pudo enlazar (${error.code ?? error.message}); build copiado a la app instalada`);
  }
} catch (error) {
  console.warn(`[agent-hub] No se pudo actualizar la app instalada: ${error.message}`);
}
