import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Marca con la que empieza el informe de equipo; evita tomar un borrador cualquiera como cuerpo del PR. */
const TEAM_REPORT_HEADER = '# Informe del equipo';

/** `gh pr create --fill`; si llega el informe del equipo, este pasa a ser el cuerpo (tiene prioridad sobre --fill). */
export function pullRequestCommand(input: string): string {
  if (!input.startsWith(TEAM_REPORT_HEADER)) return 'gh pr create --fill';
  const bodyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hub-pr-')), 'body.md');
  fs.writeFileSync(bodyFile, input, 'utf8');
  return `gh pr create --fill --body-file "${bodyFile}"`;
}
