export interface TerminalRequest {
  name: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  /** Texto a ejecutar en el shell del terminal. */
  command?: string;
  /** Programa que reemplaza al shell, útil para rutas con espacios. */
  shellPath?: string;
}

export type TerminalOpener = (request: TerminalRequest) => void;
