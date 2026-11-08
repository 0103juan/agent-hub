import * as fs from 'fs';
import * as path from 'path';

const WRITE_DELAY_MS = 400;

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`AgentHub: no se pudo leer ${filePath}`, error);
      // Se aparta en vez de dejar que la próxima escritura lo pise con el valor vacío.
      if (error instanceof SyntaxError) {
        try {
          fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
        } catch {}
      }
    }
    return fallback;
  }
}

/** Escribe y renombra para que un cierre a medias no corrompa el archivo. */
export function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  // Sin fsync, un apagado brusco puede dejar el archivo renombrado pero lleno de ceros.
  const fd = fs.openSync(tempPath, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
}

/** Agrupa escrituras seguidas en una sola para no bloquear el host de extensiones. */
export class DebouncedJsonFile {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly filePath: string,
    private readonly readValue: () => unknown
  ) {}

  public schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), WRITE_DELAY_MS);
    this.timer.unref?.();
  }

  public flush(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    writeJsonFile(this.filePath, this.readValue());
  }
}
