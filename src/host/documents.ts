import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface DocumentInfo {
  /** Ruta relativa al proyecto, con `/`; si el archivo está en ~/.agent-hub, ruta absoluta. */
  path: string;
  name: string;
  size: number;
  mtime: number;
}

export interface DocumentContent {
  file: string;
  content: string;
  mtime: number;
}

export type SaveResult =
  | { ok: true; mtime: number }
  | { ok: false; error: string; conflict?: boolean };

/** Solo texto: el editor no debe abrir ni escribir binarios. */
const DOCUMENT_EXTENSIONS = ['.md', '.markdown', '.mdx', '.txt', '.rst', '.adoc', '.log', '.csv', '.json', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.xml', '.html', '.htm'];
/** Código y scripts: se listan solo si la persona lo pide, pero se pueden abrir y editar igual. */
const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.kt', '.go', '.rs', '.rb', '.php', '.cs', '.c', '.cpp', '.h', '.hpp',
  '.sql', '.sh', '.ps1', '.bat', '.css', '.scss', '.dart', '.swift', '.vue', '.svelte', '.gradle', '.properties'
];
const DOCUMENT_SET = new Set(DOCUMENT_EXTENSIONS);
const TEXT_EXTENSIONS = new Set([...DOCUMENT_EXTENSIONS, ...CODE_EXTENSIONS]);
const SKIPPED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', 'target', 'venv', '.venv', '__pycache__', 'coverage',
  '.agent-hub-worktrees', 'dist_package', 'graphify-out'
]);
const MAX_DEPTH = 12;
const MAX_VISITED = 40000;
const MAX_LISTED = 5000;
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** Carpeta de datos de la app: también se pueden abrir sus archivos de texto. */
export const dataDir = (): string => path.join(os.homedir(), '.agent-hub');

const isInside = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export const isTextDocument = (file: string): boolean => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());

/**
 * Convierte la ruta pedida por la interfaz en una ruta real, o undefined si cae fuera del proyecto
 * y de la carpeta de datos, o si no es un archivo de texto permitido.
 */
export function resolveDocument(root: string, file: string): string | undefined {
  if (!file || !root || file.includes('\0')) return undefined;
  const resolved = path.resolve(root, file);
  if (!isTextDocument(resolved)) return undefined;
  const allowedRoots = [root, dataDir()];
  if (!allowedRoots.some((allowed) => isInside(path.resolve(allowed), resolved))) return undefined;
  // Un enlace simbólico no debe sacar el archivo de la carpeta permitida.
  try {
    // Si el archivo (o su carpeta) aún no existe, se comprueba el ancestro existente más cercano.
    let probe = resolved;
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    const real = fs.realpathSync(probe);
    const realRoots = allowedRoots.map((allowed) => (fs.existsSync(allowed) ? fs.realpathSync(allowed) : path.resolve(allowed)));
    if (!realRoots.some((allowed) => real === allowed || isInside(allowed, real))) return undefined;
  } catch {
    return undefined;
  }
  return resolved;
}

export interface DocumentListing {
  files: DocumentInfo[];
  /** Hay más archivos de los que se devuelven (límite de recorrido o de resultados). */
  truncated: boolean;
  /** Carpetas que se omiten a propósito (dependencias, compilados) y existen en el proyecto. */
  skipped: string[];
}

/**
 * Documentos de texto del proyecto y de todas sus subcarpetas, en orden de modificación.
 * Incluye `.agent-hub`, que el árbol de archivos oculta. Con `all` también lista código y scripts.
 */
export function listDocuments(root: string, all = false): DocumentListing {
  const found: DocumentInfo[] = [];
  const skipped = new Set<string>();
  let visited = 0;
  let truncated = false;

  const wanted = (name: string): boolean => {
    const extension = path.extname(name).toLowerCase();
    if (!(all ? TEXT_EXTENSIONS.has(extension) : DOCUMENT_SET.has(extension))) return false;
    // Archivos generados que solo estorban en la lista.
    return !/^(package-lock|pnpm-lock)\.json$/.test(name) && !/\.min\.(js|css)$/i.test(name);
  };

  const scan = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH) {
      truncated = true;
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (++visited > MAX_VISITED) {
        truncated = true;
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const hidden = entry.name.startsWith('.') && entry.name !== '.agent-hub';
        if (SKIPPED_DIRS.has(entry.name) || hidden) {
          if (SKIPPED_DIRS.has(entry.name)) skipped.add(entry.name);
          continue;
        }
        scan(full, depth + 1);
      } else if (entry.isFile() && wanted(entry.name)) {
        try {
          const stat = fs.statSync(full);
          found.push({ path: path.relative(root, full).split(path.sep).join('/'), name: entry.name, size: stat.size, mtime: stat.mtimeMs });
        } catch {}
      }
      if (visited > MAX_VISITED) return;
    }
  };

  if (root && fs.existsSync(root)) scan(root, 0);
  if (found.length > MAX_LISTED) truncated = true;
  return { files: found.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_LISTED), truncated, skipped: [...skipped].sort() };
}

export function readDocument(root: string, file: string): DocumentContent | { error: string } {
  const resolved = resolveDocument(root, file);
  if (!resolved) return { error: 'Ese archivo no se puede abrir desde el editor.' };
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return { error: 'No es un archivo.' };
    if (stat.size > MAX_DOCUMENT_BYTES) return { error: `El archivo pesa ${(stat.size / 1024 / 1024).toFixed(1)} MB; el editor abre hasta 2 MB.` };
    return { file, content: fs.readFileSync(resolved, 'utf8'), mtime: stat.mtimeMs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Guarda con escritura atómica. Si el archivo cambió en disco desde que se abrió (`expectedMtime`),
 * no lo pisa salvo que `force` sea verdadero: un agente puede estar escribiéndolo a la vez.
 */
export function saveDocument(root: string, file: string, content: string, expectedMtime?: number, force = false): SaveResult {
  const resolved = resolveDocument(root, file);
  if (!resolved) return { ok: false, error: 'Ese archivo no se puede guardar desde el editor.' };
  if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) return { ok: false, error: 'El contenido supera los 2 MB.' };
  try {
    if (!force && expectedMtime !== undefined && fs.existsSync(resolved) && Math.abs(fs.statSync(resolved).mtimeMs - expectedMtime) > 1) {
      return { ok: false, conflict: true, error: 'El archivo cambió en disco desde que lo abriste.' };
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const temp = `${resolved}.${process.pid}.tmp`;
    fs.writeFileSync(temp, content, 'utf8');
    fs.renameSync(temp, resolved);
    return { ok: true, mtime: fs.statSync(resolved).mtimeMs };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
