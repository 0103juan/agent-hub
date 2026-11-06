import { execFileSync } from 'child_process';
import { detectTestCommand } from '../test-runner';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { auditAccessibilityWCAG, auditEnvSync, detectNPlusOneQueries } from '../../analysis/code-audits';
import { sanitizePii } from '../../analysis/pii-sanitizer';
import { findSecrets } from '../../analysis/secret-scanner';
import { findDestructiveStatements, findQueryIssues } from '../../analysis/sql-review';
import { WORKSPACE_ACTIONS } from '../../shared/workspace-actions';
import { HubContext } from '../hub-context';
import { currentEditor, openTerminal } from '../workspace';
import { HandlerMap } from './handler-types';
import { workspaceDirForSession } from './session-handlers';

interface ActionRun {
  hub: HubContext;
  sessionId: string;
  input: string;
  cwd: string;
}

const PRE_PUSH_HOOK = `#!/usr/bin/env bash
# AgentHub: bloquea pushes con tokens expuestos.
SECRETS_FOUND=$(git diff @{upstream}..HEAD 2>/dev/null | grep -iE "(sk-ant-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|BEGIN (RSA )?PRIVATE KEY)" || true)
if [ -n "$SECRETS_FOUND" ]; then
  echo "[AgentHub] Push abortado, posibles secretos:"
  echo "$SECRETS_FOUND"
  exit 1
fi
`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}

function exists(cwd: string, file: string): boolean {
  return fs.existsSync(path.join(cwd, file));
}

function detectImpactedTestCommand(cwd: string): string | undefined {
  const changedFiles = git(cwd, 'diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
  if (exists(cwd, 'pyproject.toml')) {
    const targets = changedFiles
      .filter((file) => file.endsWith('.py'))
      .map((file) => `tests/test_${path.basename(file, '.py')}.py`)
      .filter((file) => exists(cwd, file));
    return targets.length > 0 ? `uv run pytest ${targets.join(' ')}` : 'uv run pytest';
  }
  if (exists(cwd, 'package.json')) {
    return changedFiles.length > 0
      ? `npm test -- --findRelatedTests ${changedFiles.slice(0, 5).join(' ')}`
      : 'npm test';
  }
  return undefined;
}

function detectDependencyAudit(cwd: string): string {
  if (exists(cwd, 'pom.xml')) return 'mvn dependency-check:check';
  if (exists(cwd, 'pyproject.toml')) return 'uv pip audit';
  return 'npm audit';
}

function activeDocumentText(): string | undefined {
  const editor = currentEditor();
  if (!editor) return undefined;
  return editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
}

function terminalAction(label: string, resolveCommand: (run: ActionRun) => string | undefined) {
  return (run: ActionRun) => {
    const command = resolveCommand(run);
    if (command) {
      openTerminal({ name: `AgentHub: ${label}`, cwd: run.cwd, command });
    } else {
      run.hub.chat.addNote(run.sessionId, `No encontré cómo ejecutar "${label}" en este proyecto.`, true);
    }
  };
}

/** Audita el archivo activo y deja el resultado como nota en el chat. */
function documentAudit(title: string, audit: (text: string, run: ActionRun) => string[], emptyMessage: string) {
  return (run: ActionRun) => {
    const text = activeDocumentText();
    if (!text) {
      run.hub.chat.addNote(run.sessionId, `${title}: no hay un archivo abierto.`, true);
      return;
    }
    const findings = audit(text, run);
    run.hub.chat.addNote(
      run.sessionId,
      findings.length > 0
        ? `**${title}**\n\n${findings.map((finding) => `- ${finding}`).join('\n')}`
        : `**${title}:** ${emptyMessage}`
    );
  };
}

async function createWorktree({ cwd }: ActionRun): Promise<void> {
  const name = await vscode.window.showInputBox({ title: 'Crear worktree', prompt: 'Nombre de la tarea' });
  const slug = name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return;
  const target = path.join(path.dirname(cwd), `${path.basename(cwd)}-${slug}`);
  openTerminal({ name: `AgentHub: worktree ${slug}`, cwd, command: `git worktree add "${target}" -b worktree/${slug}` });
}

async function openTunnel({ cwd }: ActionRun): Promise<void> {
  const port = await vscode.window.showInputBox({ title: 'Túnel localhost', prompt: 'Puerto a publicar', value: '8000' });
  if (port && /^\d+$/.test(port)) {
    openTerminal({ name: `AgentHub: túnel ${port}`, cwd, command: `npx localtunnel --port ${port}` });
  }
}

async function discardChanges({ hub, sessionId, cwd }: ActionRun): Promise<void> {
  const changed = git(cwd, 'diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
  if (changed.length === 0) {
    hub.chat.addNote(sessionId, 'No hay cambios sin commit que descartar.');
    return;
  }
  const confirmation = 'Descartar cambios';
  const choice = await vscode.window.showWarningMessage(
    `Se perderán los cambios sin commit de ${changed.length} archivo(s). No se puede deshacer.`,
    { modal: true },
    confirmation
  );
  if (choice !== confirmation) return;
  git(cwd, 'restore', '--staged', '--worktree', '.');
  hub.chat.addNote(sessionId, `Cambios descartados en ${changed.length} archivo(s).`);
}

function installPrePushHook({ hub, sessionId, cwd }: ActionRun): void {
  const hookFile = path.join(cwd, '.git', 'hooks', 'pre-push');
  if (fs.existsSync(hookFile)) {
    hub.chat.addNote(sessionId, 'Ya existe un hook pre-push; no lo reemplacé.', true);
    return;
  }
  fs.mkdirSync(path.dirname(hookFile), { recursive: true });
  fs.writeFileSync(hookFile, PRE_PUSH_HOOK, { mode: 0o755 });
  hub.chat.addNote(sessionId, 'Hook pre-push instalado.');
}

function scanSecrets({ hub, sessionId, cwd }: ActionRun): void {
  const secrets = findSecrets(git(cwd, 'diff', 'HEAD'));
  hub.chat.addNote(
    sessionId,
    secrets.length > 0 ? `**Posibles secretos en el diff:** ${secrets.join(', ')}` : 'No se detectaron secretos en el diff.',
    secrets.length > 0
  );
}

function sendWorkspaceErrors({ hub, sessionId, cwd }: ActionRun): void {
  const errors = vscode.languages
    .getDiagnostics()
    .flatMap(([uri, diagnostics]) =>
      diagnostics
        .filter((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error)
        .map((diagnostic) => `${vscode.workspace.asRelativePath(uri)}:${diagnostic.range.start.line + 1} ${diagnostic.message}`)
    )
    .slice(0, 10);
  if (errors.length === 0) {
    hub.chat.addNote(sessionId, 'El workspace no reporta errores.');
    return;
  }
  void hub.chat.send({
    sessionId,
    workspaceDir: cwd,
    prompt: `Corrige la causa raíz de estos errores:\n${errors.map((error) => `- ${error}`).join('\n')}`
  });
}

const ACTION_RUNNERS: Record<string, (run: ActionRun) => void | Promise<void>> = {
  'tests': terminalAction('tests', ({ cwd }) => detectTestCommand(cwd)),
  'impacted-tests': terminalAction('tests afectados', ({ cwd }) => detectImpactedTestCommand(cwd)),
  'dependency-audit': terminalAction('dependencias', ({ cwd }) => detectDependencyAudit(cwd)),
  'docker-up': terminalAction('Docker', () => 'docker compose up -d'),
  'flutter-test': terminalAction('Flutter', () => 'flutter test'),
  'dev-sandbox': terminalAction('sandbox', ({ cwd }) => `docker run --rm -it -v "${cwd}:/workspace" -w /workspace alpine:latest sh`),
  'local-tunnel': openTunnel,
  'worktree': createWorktree,
  'pull-request': terminalAction('pull request', () => 'gh pr create --fill'),
  'pre-push-hook': installPrePushHook,
  'rollback': discardChanges,
  'scan-secrets': scanSecrets,
  'review-sql': documentAudit(
    'Revisión de SQL',
    (text) => [
      ...findDestructiveStatements(text).map((statement) => `Sentencia destructiva: \`${statement}\``),
      ...findQueryIssues(text)
    ],
    'sin hallazgos. Confirma el plan con `EXPLAIN ANALYZE`.'
  ),
  'detect-n-plus-one': documentAudit(
    'Consultas N+1',
    (text) => detectNPlusOneQueries(text).warnings.map((warning) => `Línea ${warning.line}: ${warning.recommendation}`),
    'sin accesos a relaciones dentro de bucles.'
  ),
  'audit-accessibility': documentAudit(
    'Accesibilidad',
    (text) => auditAccessibilityWCAG(text).issues.map((issue) => `${issue.rule}. ${issue.message}`),
    'sin hallazgos en las reglas revisadas.'
  ),
  'audit-env': documentAudit(
    'Variables de entorno',
    (text, { cwd }) => {
      const envExample = exists(cwd, '.env.example') ? fs.readFileSync(path.join(cwd, '.env.example'), 'utf8') : '';
      return auditEnvSync(text, envExample).undocumentedVars.map((name) => `\`${name}\` no está en .env.example`);
    },
    'todas las variables están documentadas.'
  ),
  'sanitize-pii': ({ hub, input }) => hub.post({ type: 'composerText', text: sanitizePii(input) }),
  'auto-heal': sendWorkspaceErrors
};

export function actionHandlers(hub: HubContext): HandlerMap<'runAction'> {
  return {
    runAction: async ({ actionId, sessionId, input }) => {
      const cwd = workspaceDirForSession(hub, sessionId);
      const action = WORKSPACE_ACTIONS.find((candidate) => candidate.id === actionId);
      if (!action) return;

      if (action.agentPrompt) {
        const prompt = input.trim() ? `${action.agentPrompt}\n\nContexto adicional:\n${input}` : action.agentPrompt;
        await hub.chat.send({ sessionId, prompt, workspaceDir: cwd });
        return;
      }

      try {
        await ACTION_RUNNERS[actionId]({ hub, sessionId, input, cwd });
      } catch (error) {
        hub.chat.addNote(sessionId, `${action.label}: ${error instanceof Error ? error.message : String(error)}`, true);
      }
    }
  };
}
