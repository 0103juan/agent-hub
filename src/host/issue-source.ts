import { execFile } from 'child_process';

const MAX_BODY_CHARS = 6000;

export type GhRunner = (args: string[], cwd: string) => Promise<string>;

const runGh: GhRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile('gh', args, { cwd, timeout: 15000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) =>
      error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout)
    );
  });

/** `#123 notas opcionales` al principio del requerimiento. */
export function parseIssueRef(prompt: string): { number: string; rest: string } | undefined {
  const match = /^\s*#(\d+)\b\s*([\s\S]*)$/.exec(prompt);
  return match ? { number: match[1], rest: match[2].trim() } : undefined;
}

/** Si el requerimiento es `#N`, lo reemplaza por el título y el cuerpo de esa issue o PR (vía `gh`). */
export async function resolveRequirement(prompt: string, cwd: string, run: GhRunner = runGh): Promise<string> {
  const ref = parseIssueRef(prompt);
  if (!ref) return prompt;
  let kind = 'Issue';
  let data: { title?: string; body?: string; url?: string };
  try {
    data = JSON.parse(await run(['issue', 'view', ref.number, '--json', 'title,body,url'], cwd));
  } catch {
    try {
      kind = 'PR';
      data = JSON.parse(await run(['pr', 'view', ref.number, '--json', 'title,body,url'], cwd));
    } catch (error) {
      throw new Error(`No se pudo leer #${ref.number} con gh: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return [
    `${kind} #${ref.number}: ${data.title ?? ''}`,
    data.url ?? '',
    '',
    (data.body ?? '').slice(0, MAX_BODY_CHARS),
    ref.rest ? `\nNotas adicionales:\n${ref.rest}` : ''
  ]
    .join('\n')
    .trim();
}
