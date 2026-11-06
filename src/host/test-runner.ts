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

export interface ProjectConfig {
  build?: string;
  lint?: string;
  test?: string;
  /** Comandos a correr, en orden; manda sobre build, lint y test. */
  verify?: string[];
}

/** `.agent-hub/config.json` del proyecto; ignora lo que no tenga la forma esperada. */
export function loadProjectConfig(cwd: string): ProjectConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.agent-hub', 'config.json'), 'utf8'));
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
    return {
      build: text(raw.build),
      lint: text(raw.lint),
      test: text(raw.test),
      verify: Array.isArray(raw.verify) ? raw.verify.filter((command: unknown): command is string => !!text(command)) : undefined
    };
  } catch {
    return {};
  }
}

/** Lo configurado por el proyecto o, si no hay nada, el comando de tests detectado. */
export function verificationCommands(cwd: string): string[] {
  const config = loadProjectConfig(cwd);
  if (config.verify?.length) return config.verify;
  const configured = [config.build, config.lint, config.test].filter((command): command is string => !!command);
  if (configured.length > 0) return configured;
  const detected = detectTestCommand(cwd);
  return detected ? [detected] : [];
}

function runCommand(command: string, cwd: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(command, { cwd, timeout: TEST_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout}\n${stderr}`.trim().slice(-MAX_OUTPUT_CHARS) });
    });
  });
}

/** Corre la verificación del proyecto en orden y se detiene en el primer fallo; undefined si no hay comandos. */
export async function runProjectTests(cwd: string): Promise<{ ok: boolean; output: string } | undefined> {
  const commands = verificationCommands(cwd);
  if (commands.length === 0) return undefined;
  for (const command of commands) {
    const result = await runCommand(command, cwd);
    if (!result.ok) return { ok: false, output: `$ ${command}\n${result.output}` };
  }
  return { ok: true, output: '' };
}
