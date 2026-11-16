import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/** Compilación de AgentHub guardada al arrancar, para volver a ella si la nueva no gusta o falla. */
export interface DistVersion {
  id: string;
  /** Fecha (ms) del archivo más nuevo de la compilación. */
  builtAt: number;
  /** Commit corto del repo cuando se guardó; vacío si no se supo. */
  commit: string;
  hash: string;
}

const KEEP = 10;

function filesOf(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((rel) => fs.statSync(path.join(dir, rel)).isFile())
    .sort();
}

function hashDir(dir: string): string {
  const hash = crypto.createHash('sha1');
  for (const rel of filesOf(dir)) hash.update(rel.replace(/\\/g, '/')).update(fs.readFileSync(path.join(dir, rel)));
  return hash.digest('hex');
}

function repoCommit(distDir: string): string {
  try {
    return execFileSync('git', ['-C', path.dirname(distDir), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', timeout: 3000, windowsHide: true }).trim();
  } catch {
    return '';
  }
}

export function listVersions(versionsDir: string): DistVersion[] {
  if (!fs.existsSync(versionsDir)) return [];
  return fs.readdirSync(versionsDir)
    .flatMap((id) => {
      try {
        // El id es el nombre de la carpeta: el que dice el JSON no manda sobre qué carpeta se restaura o se borra.
        return [{ ...JSON.parse(fs.readFileSync(path.join(versionsDir, id, 'version.json'), 'utf8')) as DistVersion, id }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.builtAt - a.builtAt);
}

/** Guarda la compilación en uso si aún no está guardada; devuelve su hash para marcarla como actual. */
export function snapshotDist(distDir: string, versionsDir: string): string {
  // dist puede ser un junction al repo: se copia lo que apunta, no el enlace.
  const real = fs.realpathSync(distDir);
  const hash = hashDir(real);
  const versions = listVersions(versionsDir);
  if (versions.some((v) => v.hash === hash)) return hash;
  const builtAt = Math.max(...filesOf(real).map((rel) => fs.statSync(path.join(real, rel)).mtimeMs));
  const id = `${new Date(builtAt).toISOString().replace(/[:.]/g, '-')}-${hash.slice(0, 7)}`;
  fs.cpSync(real, path.join(versionsDir, id, 'dist'), { recursive: true, preserveTimestamps: true });
  const version: DistVersion = { id, builtAt, commit: repoCommit(real), hash };
  fs.writeFileSync(path.join(versionsDir, id, 'version.json'), JSON.stringify(version, null, 2));
  for (const old of [version, ...versions].sort((a, b) => b.builtAt - a.builtAt).slice(KEEP)) {
    fs.rmSync(path.join(versionsDir, old.id), { recursive: true, force: true });
  }
  return hash;
}

/** Reemplaza el contenido de dist por la versión guardada. El código fuente del repo no se toca. */
export function restoreVersion(distDir: string, versionsDir: string, id: string): void {
  const version = listVersions(versionsDir).find((v) => v.id === id);
  if (!version) throw new Error(`La versión ${id} no existe.`);
  const real = fs.realpathSync(distDir);
  // Se copia a un temporal junto a dist y se valida antes de tocar dist: una copia a medias no deja la app sin compilación.
  const staging = fs.mkdtempSync(path.join(path.dirname(real), '.dist-restore-'));
  try {
    fs.cpSync(path.join(versionsDir, version.id, 'dist'), staging, { recursive: true, preserveTimestamps: true });
    if (!fs.existsSync(path.join(staging, 'electron', 'main.js')) || hashDir(staging) !== version.hash) {
      throw new Error(`La versión ${id} está incompleta o dañada.`);
    }
    // Se vacía por dentro: borrar dist en sí rompería el junction de la app instalada.
    for (const entry of fs.readdirSync(real)) fs.rmSync(path.join(real, entry), { recursive: true, force: true });
    fs.cpSync(staging, real, { recursive: true, preserveTimestamps: true });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
