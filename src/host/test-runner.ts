import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TEST_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_CHARS = 3000;

function exists(cwd: string, file: string): boolean {
  return fs.existsSync(path.join(cwd, file));
}

export function detectTestCommand(cwd: string): string | undefined {
  if (exists(cwd, 'verificar.sh')) return 'bash verificar.sh';
  if (exists(cwd, 'gradlew')) return process.platform === 'win32' ? '.\\gradlew test' : './gradlew test';
  if (exists(cwd, 'mvnw')) return process.platform === 'win32' ? '.\\mvnw test' : './mvnw test';
  if (exists(cwd, 'package.json')) return 'npm test';
  if (exists(cwd, 'pyproject.toml')) return 'uv run pytest';
  return undefined;
}

/** Corre los tests del proyecto y devuelve el final de la salida; undefined si no se detecta un comando. */
export function runProjectTests(cwd: string): Promise<{ ok: boolean; output: string } | undefined> {
  const command = detectTestCommand(cwd);
  if (!command) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    exec(command, { cwd, timeout: TEST_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout}\n${stderr}`.trim().slice(-MAX_OUTPUT_CHARS) });
    });
  });
}
