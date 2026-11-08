import { createCheckpoint, rollbackCheckpoint, getCheckpointDiff, getCheckpointFiles, revertCheckpointFile } from '../src/host/git-checkpoint';
import { OllamaProvider } from '../src/agents/ollama/ollama-provider';
import { after, describe, it } from 'node:test';
import * as assert from 'node:assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

import { AgentEvent, AgentProvider, AgentRun, AgentTurnRequest, TurnOutcome } from '../src/agents/agent-provider';
import { AntigravityProvider, parseModelListing, toVariantId } from '../src/agents/antigravity/antigravity-provider';
import { AntigravityStreamParser } from '../src/agents/antigravity/antigravity-stream-parser';
import { ClaudeStreamParser } from '../src/agents/claude/claude-stream-parser';
import { assertSafeCliValue, CliProcess, StreamParser } from '../src/agents/cli-process';
import { CliProcessPool, PooledCliSpec } from '../src/agents/cli-process-pool';
import { composePrompt, loadExperience, loadProjectRules, missingHandoffFields } from '../src/agents/prompt-composer';
import { ProviderRegistry } from '../src/agents/provider-registry';
import { describeToolCall } from '../src/agents/tool-activity';
import { auditAccessibilityWCAG, auditEnvSync, detectNPlusOneQueries } from '../src/analysis/code-audits';
import { sanitizePii } from '../src/analysis/pii-sanitizer';
import { findSecrets } from '../src/analysis/secret-scanner';
import { findDestructiveStatements, findQueryIssues } from '../src/analysis/sql-review';
import { ChatService } from '../src/chat/chat-service';
import { readAttachment } from '../src/host/attachments';
import { buildFiles, formatBuildStamp, newestBuildMs } from '../src/host/build-info';
import { pullRequestCommand } from '../src/host/pull-request';
import { ClaudeProvider } from '../src/agents/claude/claude-provider';
import { commitStage, restoreStage, squadDiffFiles } from '../src/host/git-worktree';
import { parseIssueRef, resolveRequirement } from '../src/host/issue-source';
import { runProjectTests, verificationCommands } from '../src/host/test-runner';
import { pruneExperience, selectExperience } from '../src/shared/experience';
import { buildTeamReport } from '../src/shared/team-report';
import { nextRoles } from '../src/shared/protocol-roles';
import { createSquadWorktree, mainRepoOf, mergeSquadWorktree, removeSquadWorktree } from '../src/host/git-worktree';
import { isInsideWorkspace } from '../src/host/safe-path';
import { templateById } from '../src/shared/team-templates';
import { summarizeCosts } from '../src/shared/cost-summary';
import { searchSessions } from '../src/shared/session-search';
import { HostMessage } from '../src/shared/ipc';
import { closestEffort, recommendedFor, resolveSelection } from '../src/shared/model-selection';
import { PROTOCOL_ROLES } from '../src/shared/protocol-roles';
import { AccountProfile, ConversationSession } from '../src/shared/types';
import { extractQuestionOptions } from '../src/shared/question-options';
import { filterActions, WORKSPACE_ACTIONS } from '../src/shared/workspace-actions';
import { migrateSession, SessionStore } from '../src/storage/session-store';
import { TelemetryStore } from '../src/storage/telemetry-store';
import { parseMarkdownBlocks, resolveImageSrc } from '../src/webview/components/chat/Markdown';
import { splitTurn } from '../src/webview/components/chat/MessageList';
import { hubReducer, INITIAL_HUB_STATE } from '../src/webview/state/hub-state';

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hub-test-'));
  tempDirs.push(dir);
  return dir;
}
after(() => tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function parseAll(parser: StreamParser, lines: unknown[]): AgentEvent[] {
  return lines.flatMap((line) => parser.parseLine(typeof line === 'string' ? line : JSON.stringify(line)));
}
const textOf = (events: AgentEvent[]) =>
  events.flatMap((event) => (event.kind === 'text' ? [event.text] : [])).join('');

const CLAUDE_ACCOUNT: AccountProfile = {
  id: 'claude-main',
  name: 'Claude',
  provider: 'claude',
  status: 'connected',
  models: [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', efforts: ['low', 'medium', 'high', 'max'] }]
};
const GOOGLE_ACCOUNT: AccountProfile = {
  id: 'google-main',
  name: 'Antigravity',
  provider: 'google',
  status: 'connected',
  models: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', efforts: ['low', 'medium', 'high'] }]
};

describe('Parser de Claude (eventos reales de stream-json)', () => {
  it('emite los deltas una sola vez aunque llegue el mensaje completo', () => {
    const events = parseAll(new ClaudeStreamParser(), [
      { type: 'system', subtype: 'init', session_id: 'abc' },
      { type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Ho' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'la' } } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Hola' }] } },
      { type: 'result', result: 'Hola', is_error: false, usage: { input_tokens: 5, output_tokens: 2 }, total_cost_usd: 0.01 }
    ]);
    assert.strictEqual(textOf(events), 'Hola');
    assert.deepStrictEqual(events.find((e) => e.kind === 'resumeId'), { kind: 'resumeId', id: 'abc' });
    const usage = events.find((e) => e.kind === 'usage');
    assert.ok(usage?.kind === 'usage' && usage.usage.costUSD === 0.01);
  });

  it('convierte is_error en error, como el modelo no reconocido', () => {
    const events = parseAll(new ClaudeStreamParser(), [
      { type: 'result', is_error: true, result: 'Fable 5.1 requires usage credits.' }
    ]);
    assert.deepStrictEqual(events.find((e) => e.kind === 'error'), { kind: 'error', message: 'Fable 5.1 requires usage credits.' });
  });

  it('muestra los mensajes sintéticos que no pasan por stream_event', () => {
    const events = parseAll(new ClaudeStreamParser(), [{ type: 'assistant', message: { content: [{ type: 'text', text: 'Aviso' }] } }]);
    assert.strictEqual(textOf(events), 'Aviso');
  });

  it('reporta herramientas como actividad y lee la cuota', () => {
    const events = parseAll(new ClaudeStreamParser(), [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }] } },
      { type: 'rate_limit_event', rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.03, resetsAt: 9 } } } }
    ]);
    assert.deepStrictEqual(events[0], { kind: 'activity', label: 'Read: a.ts' });
    assert.ok(events[1].kind === 'quota' && events[1].quota.fiveHourUtilization === 0.03);
  });

  it('ignora líneas que no son JSON', () => {
    assert.deepStrictEqual(new ClaudeStreamParser().parseLine('[claude-code:unrecognized_model] {}'), []);
  });
});

describe('Parser de Antigravity (eventos reales de agy)', () => {
  const step = (update: object) => ({ event: 'step_update', step_update: update });

  it('toma el texto del delta y no lo duplica con result.response', () => {
    const events = parseAll(new AntigravityStreamParser(), [
      { event: 'init', conversation_id: 'c1' },
      step({ step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'OK' }),
      { event: 'result', result: { conversation_id: 'c1', status: 'SUCCESS', response: 'OK\n' } }
    ]);
    assert.strictEqual(textOf(events), 'OK');
    assert.strictEqual(events.filter((e) => e.kind === 'resumeId').length, 1);
  });

  it('suma el uso por pasos e ignora el acumulado de la conversación', () => {
    const events = parseAll(new AntigravityStreamParser(), [
      step({ step_index: 1, state: 'DONE', step_type: 'agent_response', usage: { input_tokens: 10, output_tokens: 1 } }),
      step({ step_index: 3, state: 'DONE', step_type: 'agent_response', usage: { input_tokens: 20, output_tokens: 2 } }),
      { event: 'result', result: { status: 'SUCCESS', response: 'x', usage: { input_tokens: 338528, output_tokens: 18959 } } }
    ]);
    assert.ok(events.some((e) => e.kind === 'turnEnd'));
    const usage = events.find((e) => e.kind === 'usage');
    assert.ok(usage?.kind === 'usage');
    assert.strictEqual(usage.usage.inputTokens, 30);
    assert.strictEqual(usage.usage.outputTokens, 3);
  });

  it('un permiso denegado con status SUCCESS y respuesta vacía es un error visible', () => {
    const events = parseAll(new AntigravityStreamParser(), [
      'jetski: no output produced',
      { event: 'result', result: { status: 'SUCCESS', response: '', denied_actions: [{ action: 'command', display_name: 'RunCommand' }] } }
    ]);
    const error = events.find((e) => e.kind === 'error');
    assert.ok(error?.kind === 'error' && error.message.includes('RunCommand'));
  });

  it('separa los textos de pasos distintos y expone las herramientas', () => {
    const events = parseAll(new AntigravityStreamParser(), [
      step({ step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Primero' }),
      step({ step_index: 2, state: 'ACTIVE', step_type: 'tool', tool_name: 'run_command', tool_info: { parameters: { CommandLine: 'ls' } } }),
      step({ step_index: 3, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Luego' })
    ]);
    assert.strictEqual(textOf(events), 'Primero\n\nLuego');
    assert.ok(events.some((e) => e.kind === 'activity' && e.label === 'run_command: ls'));
  });

  it('agrupa las variantes de `agy models` en un modelo con esfuerzos', () => {
    const models = parseModelListing(
      'Fetching available models...\n' +
      'gemini-3.8-flash-high\tGemini 3.8 Flash (High)\n' +
      'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)\n' +
      'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n'
    );
    assert.deepStrictEqual(models, [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', efforts: ['high', 'low'] },
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', efforts: ['medium'] }
    ]);
    assert.strictEqual(toVariantId('gemini-3.8-flash', 'high'), 'gemini-3.8-flash-high');
  });
});

describe('Proceso vivo de la CLI', () => {
  // CLI de prueba: responde cada línea con su PID y una marca de fin de turno.
  const ECHO_CLI = `require('readline').createInterface({ input: process.stdin }).on('line', (line) => {
    if (line === 'silencio') return console.log('END');
    if (line === 'muere') process.exit(0);
    console.log('pid-' + process.pid);
    console.log('END');
  });`;
  const echoParser = (): StreamParser => ({
    parseLine: (line) => {
      if (line.trim() === 'END') return [{ kind: 'turnEnd' }];
      return line.trim() ? [{ kind: 'text', text: line.trim() }] : [];
    }
  });
  const options = (script = ECHO_CLI) => ({
    command: process.execPath,
    args: ['-e', script],
    cwd: os.tmpdir(),
    env: process.env,
    shell: false
  });
  const spec = (key: string): PooledCliSpec => ({ ...options(), key, resumeArgs: (id) => ['--', id] });

  const turnText = (pool: CliProcessPool, key: string, input = 'hola', resumeId?: string) => {
    let text = '';
    const run = pool.runTurn(spec(key), resumeId, input, echoParser(), (event) => {
      if (event.kind === 'text') text += event.text;
    });
    return run.outcome.then((outcome) => ({ outcome, text }));
  };

  it('el proceso sobrevive entre turnos', async () => {
    const pool = new CliProcessPool();
    const first = await turnText(pool, 'a');
    const second = await turnText(pool, 'a');
    pool.dispose();
    assert.deepStrictEqual(first.outcome, { status: 'completed' });
    assert.strictEqual(second.text, first.text);
  });

  it('otra configuración arranca otro proceso', async () => {
    const pool = new CliProcessPool();
    const first = await turnText(pool, 'modelo-a');
    const second = await turnText(pool, 'modelo-b');
    pool.dispose();
    assert.notStrictEqual(second.text, first.text);
  });

  it('otra conversación no reutiliza el proceso', async () => {
    const pool = new CliProcessPool();
    const first = await turnText(pool, 'a');
    const second = await turnText(pool, 'a', 'hola', 'conversacion-distinta');
    pool.dispose();
    assert.notStrictEqual(second.text, first.text);
  });

  it('tras un fallo el proceso no se reutiliza', async () => {
    const pool = new CliProcessPool();
    const failed = await turnText(pool, 'a', 'silencio');
    assert.ok(failed.outcome.status === 'failed' && failed.outcome.error.includes('sin respuesta'));
    const next = await turnText(pool, 'a');
    const again = await turnText(pool, 'a');
    pool.dispose();
    assert.deepStrictEqual(next.outcome, { status: 'completed' });
    assert.strictEqual(again.text, next.text);
  });

  it('el precalentado se usa en el primer turno y no se duplica', async () => {
    const pool = new CliProcessPool();
    pool.prewarm(spec('a'));
    pool.prewarm(spec('a'));
    assert.strictEqual((pool as any).idle.length, 1);
    const process = (pool as any).idle[0].process;
    await turnText(pool, 'a');
    assert.strictEqual((pool as any).idle.length, 1);
    assert.strictEqual((pool as any).idle[0].process, process);
    pool.dispose();
  });

  it('conserva como máximo un proceso inactivo', () => {
    const pool = new CliProcessPool();
    ['a', 'b', 'c', 'd'].forEach((key) => pool.prewarm(spec(key)));
    assert.deepStrictEqual((pool as any).idle.map((entry: any) => entry.key), ['d']);
    pool.dispose();
    assert.strictEqual((pool as any).idle.length, 0);
  });

  it('devuelve stderr si el proceso muere sin responder', async () => {
    const child = new CliProcess(options('console.error("autenticación fallida"); process.exit(1)'));
    const outcome = await child.startTurn('hola', echoParser(), () => undefined).outcome;
    assert.deepStrictEqual(outcome, { status: 'failed', error: 'autenticación fallida' });
  });

  it('cancelar mata el proceso y lo reporta como cancelado', async () => {
    const child = new CliProcess(options('setInterval(() => {}, 1000)'));
    const turn = child.startTurn('hola', echoParser(), () => undefined);
    setTimeout(() => turn.cancel(), 100);
    assert.deepStrictEqual(await turn.outcome, { status: 'cancelled' });
    assert.strictEqual(child.isIdle, false);
  });

  it('un binario inexistente es un fallo y no un cuelgue', async () => {
    const child = new CliProcess({ ...options(), command: path.join(os.tmpdir(), 'no-existe-agy.exe') });
    const outcome = await child.startTurn('hola', echoParser(), () => undefined).outcome;
    assert.strictEqual(outcome.status, 'failed');
  });

  it('rechaza valores que el shell podría interpretar', () => {
    assert.strictEqual(assertSafeCliValue('claude-sonnet-5-5'), 'claude-sonnet-5-5');
    assert.throws(() => assertSafeCliValue('Claude 3.7 Sonnet'));
    assert.throws(() => assertSafeCliValue('x&calc'));
  });
});

describe('Caché de cuentas', () => {
  const provider = (accounts: AccountProfile[]) => {
    const calls = { count: 0 };
    const fake = {
      type: 'claude',
      discoverAccounts: async () => {
        calls.count += 1;
        return accounts;
      }
    } as unknown as AgentProvider;
    return { fake, calls };
  };

  it('responde desde disco sin lanzar las CLIs', async () => {
    const cacheFile = path.join(tempDir(), 'accounts-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify({ savedAt: Date.now(), accounts: [CLAUDE_ACCOUNT] }));
    const { fake, calls } = provider([]);
    const accounts = await new ProviderRegistry([fake], cacheFile).listAccounts();
    assert.deepStrictEqual(accounts.map((a) => a.id), ['claude-main']);
    assert.strictEqual(calls.count, 0);
  });

  it('un dato viejo se entrega y se refresca en segundo plano', async () => {
    const cacheFile = path.join(tempDir(), 'accounts-cache.json');
    fs.writeFileSync(cacheFile, JSON.stringify({ savedAt: 0, accounts: [CLAUDE_ACCOUNT] }));
    const { fake } = provider([GOOGLE_ACCOUNT]);
    const changed = new Promise<AccountProfile[]>((resolve) => {
      void new ProviderRegistry([fake], cacheFile, resolve).listAccounts().then((accounts) => {
        assert.strictEqual(accounts[0].id, 'claude-main');
      });
    });
    assert.strictEqual((await changed)[0].id, 'google-main');
  });

  it('forzar el refresco consulta de nuevo y guarda el resultado', async () => {
    const cacheFile = path.join(tempDir(), 'accounts-cache.json');
    const { fake, calls } = provider([CLAUDE_ACCOUNT]);
    const registry = new ProviderRegistry([fake], cacheFile);
    await registry.listAccounts();
    await registry.listAccounts();
    assert.strictEqual(calls.count, 1);
    await registry.listAccounts(true);
    assert.strictEqual(calls.count, 2);
    assert.ok(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).accounts.length === 1);
  });
});

describe('Selección de cuenta y modelo', () => {
  const accounts = [CLAUDE_ACCOUNT, GOOGLE_ACCOUNT];

  it('nunca combina una cuenta con un modelo de otro proveedor', () => {
    const selection = resolveSelection({ profileId: 'claude-main', modelId: 'gemini-3.8-flash', effort: 'high' }, accounts);
    assert.strictEqual(selection.account?.id, 'claude-main');
    assert.strictEqual(selection.model?.id, 'claude-sonnet-5-5');
  });

  it('una cuenta inexistente cae en la primera conectada', () => {
    const offline = { ...CLAUDE_ACCOUNT, status: 'disconnected' as const };
    const selection = resolveSelection({ profileId: 'fantasma', modelId: 'x', effort: 'low' }, [offline, GOOGLE_ACCOUNT]);
    assert.strictEqual(selection.account?.id, 'google-main');
  });

  it('ajusta el esfuerzo al nivel soportado más cercano', () => {
    assert.strictEqual(closestEffort('max', ['low', 'medium', 'high']), 'high');
    assert.strictEqual(closestEffort('medium', ['medium']), 'medium');
    assert.strictEqual(closestEffort('high', []), undefined);
  });
});

describe('Composición del prompt', () => {
  it('el rol se conserva aunque haya adjuntos', () => {
    const prompt = composePrompt({ prompt: 'Hola', role: 'revisor', attachments: [{ file: 'a.ts', content: 'x' }] });
    assert.ok(prompt.includes(PROTOCOL_ROLES.revisor.systemPrompt));
    assert.ok(prompt.includes('a.ts'));
    assert.ok(prompt.endsWith('Instrucción:\nHola'));
  });

  it('sin contexto envía el texto tal cual', () => {
    assert.strictEqual(composePrompt({ prompt: 'Hola' }), 'Hola');
  });

  it('incluye la ruta de los archivos multimedia', () => {
    const prompt = composePrompt({ prompt: 'Mira', attachments: [{ file: 'a.png', fsPath: 'C:/a.png', mediaType: 'image', content: '' }] });
    assert.ok(prompt.includes('C:/a.png'));
  });
});

describe('Persistencia', () => {
  it('escribe solo en el directorio recibido', () => {
    const dir = tempDir();
    const store = new SessionStore(dir);
    const session = store.create({ taskSlug: 'tarea' });
    store.flush();
    assert.ok(fs.existsSync(path.join(dir, 'sessions.json')));
    assert.ok(new SessionStore(dir).get(session.id));
  });

  it('migra sesiones antiguas al esquema nuevo', () => {
    const base = { id: 's', title: 't', effort: 'high', messages: [], createdAt: 1, updatedAt: 1 } as const;
    const ghost = migrateSession({ ...base, messages: [], profileId: 'google-workspace', modelName: 'gemini-3.8-flash-high' });
    assert.strictEqual(ghost.profileId, 'google-main');
    assert.strictEqual(ghost.modelId, 'gemini-3.8-flash');
    const displayName = migrateSession({ ...base, messages: [], profileId: 'claude-main', modelName: 'Claude 3.7 Sonnet' });
    assert.strictEqual(displayName.modelId, 'claude-sonnet-5-5');
  });

  it('limpia turnos que quedaron a medias al cerrar VS Code', () => {
    const message = { id: 'm', role: 'assistant' as const, content: '', profileId: 'p', modelName: 'm', timestamp: 1, isStreaming: true };
    const session = migrateSession({
      id: 's', title: 't', effort: 'low', profileId: 'p', modelId: 'm', createdAt: 1, updatedAt: 1,
      messages: [message, { ...message, id: 'n', content: 'parcial' }]
    });
    assert.deepStrictEqual(session.messages.map((m) => [m.id, m.isStreaming]), [['n', false]]);
  });

  it('agrupa las escrituras seguidas en una sola', () => {
    const dir = tempDir();
    const store = new SessionStore(dir);
    const file = path.join(dir, 'sessions.json');
    const session = store.create({});
    for (let i = 0; i < 50; i++) store.update(session.id, { cliSessionId: String(i) });
    assert.strictEqual(fs.existsSync(file), false);
    store.flush();
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).find((candidate: ConversationSession) => candidate.id === session.id);
    assert.strictEqual(saved.cliSessionId, '49');
  });

  it('cambiar de cuenta invalida la conversación de la CLI', () => {
    const store = new SessionStore(tempDir());
    const session = store.create({ profileId: 'claude-main' });
    store.update(session.id, { cliSessionId: 'abc' });
    store.changeAccount(session.id, 'google-main');
    assert.strictEqual(store.get(session.id)?.cliSessionId, undefined);
  });

  it('la cuota no cuenta turnos', () => {
    const telemetry = new TelemetryStore(tempDir());
    const target = { profileId: 'p', accountName: 'a', modelName: 'm', provider: 'claude' as const };
    telemetry.recordQuota(target, { fiveHourUtilization: 0.5 });
    telemetry.recordQuota(target, { fiveHourUtilization: 0.6 });
    const entry = telemetry.recordTurn(target, { inputTokens: 10, costUSD: 0.5 });
    assert.strictEqual(entry.turnsCount, 1);
    assert.strictEqual(entry.fiveHourUtilization, 0.6);
    assert.strictEqual(entry.totalInputTokens, 10);
  });
});

describe('ChatService', () => {
  class FakeProvider implements AgentProvider {
    public readonly type = 'claude' as const;
    public requests: AgentTurnRequest[] = [];
    constructor(private readonly script: (emit: (event: AgentEvent) => void) => TurnOutcome) {}
    public async discoverAccounts() { return [CLAUDE_ACCOUNT]; }
    public startTurn(request: AgentTurnRequest, onEvent: (event: AgentEvent) => void): AgentRun {
      this.requests.push(request);
      return { outcome: Promise.resolve(this.script(onEvent)), cancel: () => undefined };
    }
    public openLogin() {}
    public describeLogout() { return undefined; }
    public async logout() {}
    public addAccount() {}
    public prewarmed = 0;
    public prewarm() { this.prewarmed += 1; }
  }

  function setup(script: (emit: (event: AgentEvent) => void) => TurnOutcome) {
    const dir = tempDir();
    const sessions = new SessionStore(dir);
    const telemetry = new TelemetryStore(dir);
    const provider = new FakeProvider(script);
    const posted: HostMessage[] = [];
    const chat = new ChatService(sessions, telemetry, new ProviderRegistry([provider]), (m) => posted.push(m));
    const session = sessions.getActive();
    const send = (prompt: string) => chat.send({ sessionId: session.id, prompt, workspaceDir: dir });
    return { sessions, telemetry, provider, posted, chat, session, send };
  }

  it('una sesión de solo lectura pide al proveedor quitar las herramientas de escritura', async () => {
    const { send, provider, sessions, session } = setup(() => ({ status: 'completed' }));
    sessions.update(session.id, { permission: 'readonly' });
    await send('lee');
    assert.strictEqual(provider.requests[0].readOnly, true);
  });

  it('precalienta con la misma restricción de solo lectura que usará el turno', async () => {
    const dir = tempDir();
    const targets: Array<boolean | undefined> = [];
    const { chat, sessions, session, provider } = setup(() => ({ status: 'completed' }));
    provider.prewarm = ((target: { readOnly?: boolean }) => targets.push(target.readOnly)) as typeof provider.prewarm;
    sessions.update(session.id, { protocolRole: 'revisor' });
    await chat.prewarm(session.id, dir);
    sessions.update(session.id, { protocolRole: 'desarrollador', permission: 'readonly' });
    await chat.prewarm(session.id, dir);
    sessions.update(session.id, { permission: 'full' });
    await chat.prewarm(session.id, dir);
    assert.deepStrictEqual(targets, [true, true, false]);
  });

  it('cancela el turno tras el tiempo sin actividad y lo avisa', async () => {
    const dir = tempDir();
    const sessions = new SessionStore(dir);
    const hanging: AgentProvider = {
      ...new FakeProvider(() => ({ status: 'completed' })),
      type: 'claude',
      discoverAccounts: async () => [CLAUDE_ACCOUNT],
      startTurn: () => {
        let cancel!: () => void;
        const outcome = new Promise<TurnOutcome>((resolve) => { cancel = () => resolve({ status: 'cancelled' }); });
        return { outcome, cancel };
      }
    };
    const chat = new ChatService(sessions, new TelemetryStore(dir), new ProviderRegistry([hanging]), () => undefined);
    chat.idleTimeoutMs = 30;
    const session = sessions.getActive();
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: dir });
    assert.ok(session.messages.some((m) => m.role === 'system' && m.isError && m.content.includes('Sin actividad')));
  });

  it('con la cuota agotada reintenta una vez con otra cuenta del mismo proveedor', async () => {
    const dir = tempDir();
    const sessions = new SessionStore(dir);
    const second: AccountProfile = { ...CLAUDE_ACCOUNT, id: 'claude-2', name: 'Claude 2' };
    let calls = 0;
    const provider = new FakeProvider(() => (++calls === 1 ? { status: 'failed', error: 'Claude usage limit reached' } : { status: 'completed' }));
    provider.discoverAccounts = async () => [CLAUDE_ACCOUNT, second];
    const chat = new ChatService(sessions, new TelemetryStore(dir), new ProviderRegistry([provider]), () => undefined);
    const session = sessions.getActive();
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: dir });
    assert.strictEqual(calls, 2);
    assert.strictEqual(provider.requests[1].account.id, 'claude-2');
    assert.strictEqual(sessions.get(session.id)!.profileId, 'claude-2');
  });

  it('no reintenta si no hay otra cuenta del proveedor', async () => {
    const { send, provider } = setup(() => ({ status: 'failed', error: 'rate limit' }));
    await send('x');
    assert.strictEqual(provider.requests.length, 1);
  });

  it('plan primero: el turno es de solo lectura, marca la respuesta y no guarda el prefijo en tu mensaje', async () => {
    const { chat, provider, sessions, session } = setup((emit) => { emit({ kind: 'text', text: '1. Paso uno' }); return { status: 'completed' }; });
    await chat.send({ sessionId: session.id, prompt: 'hazlo', planFirst: true, workspaceDir: tempDir() });
    assert.strictEqual(provider.requests[0].readOnly, true);
    assert.ok(provider.requests[0].prompt.includes('MODO PLAN'));
    const messages = sessions.get(session.id)!.messages;
    assert.strictEqual(messages[0].content, 'hazlo');
    assert.strictEqual(messages[1].isPlan, true);
  });

  it('con aprobación por etapa el traspaso espera y se entrega al aprobarlo', async () => {
    const { chat, provider, sessions, session, posted } = setup((emit) => {
      emit({ kind: 'text', text: '>> tester-1: Hecho: spec\nArchivos: a.md\nPendiente: tests\nVerificación: criterios\n\n' });
      return { status: 'completed' };
    });
    sessions.update(session.id, { protocolRole: 'arquitecto', taskSlug: 'arquitecto-1', squad: 'S', approveStages: true });
    sessions.create({ protocolRole: 'tester', taskSlug: 'tester-1', squad: 'S' });
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: tempDir() });
    assert.strictEqual(provider.requests.length, 1);
    const pending = [...posted].reverse().find((m) => m.type === 'state' && m.patch.pendingHandoffs?.length)!;
    assert.ok(pending.type === 'state');
    const id = pending.patch.pendingHandoffs![0].id;
    chat.approveHandoff(id, true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.strictEqual(provider.requests.length, 2);
    assert.ok(provider.requests[1].prompt.includes('Hecho: spec'));
  });

  it('rechazar un traspaso pendiente no entrega nada', async () => {
    const { chat, provider, sessions, session, posted } = setup((emit) => {
      emit({ kind: 'text', text: '>> tester-1: Hecho: spec\nArchivos: a.md\nPendiente: tests\nVerificación: criterios\n\n' });
      return { status: 'completed' };
    });
    sessions.update(session.id, { protocolRole: 'arquitecto', taskSlug: 'arquitecto-1', squad: 'S', approveStages: true });
    sessions.create({ protocolRole: 'tester', taskSlug: 'tester-1', squad: 'S' });
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: tempDir() });
    const pending = [...posted].reverse().find((m) => m.type === 'state' && m.patch.pendingHandoffs?.length)!;
    assert.ok(pending.type === 'state');
    chat.approveHandoff(pending.patch.pendingHandoffs![0].id, false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.strictEqual(provider.requests.length, 1);
  });

  it('el Desarrollador de equipo recibe los tests fallidos hasta 2 veces y luego se traspasa', async () => {
    const { chat, provider, sessions, session } = setup(() => ({ status: 'completed' }));
    sessions.update(session.id, { protocolRole: 'desarrollador', squad: 'S' });
    let runs = 0;
    chat.verify = async () => { runs += 1; return { ok: false, output: 'boom' }; };
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: tempDir() });
    assert.strictEqual(provider.requests.length, 3);
    assert.strictEqual(runs, 3);
    assert.ok(provider.requests[1].prompt.includes('boom'));
  });

  it('si los tests pasan tras el primer arreglo no vuelve a insistir', async () => {
    const { chat, provider, sessions, session } = setup(() => ({ status: 'completed' }));
    sessions.update(session.id, { protocolRole: 'desarrollador', squad: 'S' });
    let runs = 0;
    chat.verify = async () => ({ ok: ++runs > 1, output: 'fallo' });
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: tempDir() });
    assert.strictEqual(provider.requests.length, 2);
  });

  it('sin equipo o sin ser Desarrollador no corre los tests', async () => {
    const { chat, provider, session, sessions } = setup(() => ({ status: 'completed' }));
    let runs = 0;
    chat.verify = async () => { runs += 1; return { ok: false, output: 'x' }; };
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: tempDir() });
    sessions.update(session.id, { protocolRole: 'desarrollador' });
    await chat.send({ sessionId: session.id, prompt: 'y', workspaceDir: tempDir() });
    assert.strictEqual(runs, 0);
    assert.strictEqual(provider.requests.length, 2);
  });

  it('maxConcurrent limita los turnos simultáneos', async () => {
    const run = async (limit: number) => {
      const { chat, provider, sessions, session } = setup(() => ({ status: 'completed' }));
      let current = 0;
      let peak = 0;
      provider.startTurn = (request: AgentTurnRequest) => {
        provider.requests.push(request);
        current += 1;
        peak = Math.max(peak, current);
        const outcome = new Promise<TurnOutcome>((resolve) => setTimeout(() => { current -= 1; resolve({ status: 'completed' }); }, 30));
        return { outcome, cancel: () => undefined };
      };
      const other = sessions.create({});
      chat.maxConcurrent = limit;
      await Promise.all([
        chat.send({ sessionId: session.id, prompt: 'a', workspaceDir: tempDir() }),
        chat.send({ sessionId: other.id, prompt: 'b', workspaceDir: tempDir() })
      ]);
      assert.strictEqual(provider.requests.length, 2);
      return peak;
    };
    assert.strictEqual(await run(1), 1);
    assert.strictEqual(await run(0), 2);
  });

  it('la cola global muestra quién espera y permite subir o quitar un turno', async () => {
    const { chat, provider, sessions, session, posted } = setup(() => ({ status: 'completed' }));
    provider.startTurn = (request: AgentTurnRequest) => {
      provider.requests.push(request);
      return { outcome: new Promise<TurnOutcome>((resolve) => setTimeout(() => resolve({ status: 'completed' }), 60)), cancel: () => undefined };
    };
    const second = sessions.create({});
    const third = sessions.create({});
    chat.maxConcurrent = 1;
    const sends = [session.id, second.id, third.id].map((id) => chat.send({ sessionId: id, prompt: 'x', workspaceDir: tempDir() }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const waiting = () => [...posted].reverse().map((m) => (m.type === 'state' ? m.patch.waitingSessionIds : undefined)).find(Boolean);
    assert.deepStrictEqual(waiting(), [second.id, third.id]);
    chat.prioritizeWaiting(third.id);
    assert.deepStrictEqual(waiting(), [third.id, second.id]);
    chat.cancelWaiting(second.id);
    await Promise.all(sends);
    assert.strictEqual(provider.requests.length, 2);
    assert.ok(sessions.get(second.id)!.messages.some((m) => m.content.includes('quitado de la cola')));
  });

  it('un turno de solo lectura que modifica archivos lo avisa; uno con escritura no', async () => {
    const dir = path.join(tempDir(), 'repo');
    fs.mkdirSync(dir);
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: 'ignore' });
    git('init');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'uno');
    git('add', '.');
    git('commit', '-m', 'init');
    const writes = (emit: (event: AgentEvent) => void) => { fs.writeFileSync(path.join(dir, 'a.txt'), 'dos'); fs.writeFileSync(path.join(dir, 'nuevo.txt'), 'x'); emit({ kind: 'text', text: 'listo' }); };

    const readOnly = setup((emit) => { writes(emit); return { status: 'completed' }; });
    readOnly.sessions.update(readOnly.session.id, { protocolRole: 'revisor' });
    await readOnly.chat.send({ sessionId: readOnly.session.id, prompt: 'lee', workspaceDir: dir });
    const warning = readOnly.sessions.get(readOnly.session.id)!.messages.find((m) => m.content.includes('solo lectura'));
    assert.ok(warning && warning.content.includes('a.txt') && warning.content.includes('nuevo.txt'));
    // Con el árbol limpio igual hay punto de partida (HEAD) y se listan los archivos cambiados.
    assert.deepStrictEqual(readOnly.sessions.get(readOnly.session.id)!.messages[1].checkpointFiles, ['a.txt']);

    git('checkout', '--', 'a.txt');
    fs.rmSync(path.join(dir, 'nuevo.txt'));
    const writable = setup((emit) => { writes(emit); return { status: 'completed' }; });
    writable.sessions.update(writable.session.id, { protocolRole: 'desarrollador' });
    await writable.chat.send({ sessionId: writable.session.id, prompt: 'edita', workspaceDir: dir });
    assert.ok(!writable.sessions.get(writable.session.id)!.messages.some((m) => m.content.includes('solo lectura')));
  });

  it('el turno guarda su duración', async () => {
    const { send, session } = setup((emit) => { emit({ kind: 'text', text: 'ok' }); return { status: 'completed' }; });
    await send('x');
    assert.ok(typeof session.messages[1].durationMs === 'number');
  });

  it('en una copia aparte cada turno deja un commit de etapa al que se puede volver', async () => {
    const base = path.join(tempDir(), 'repo');
    fs.mkdirSync(base);
    const run = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
    run(base, 'init');
    fs.writeFileSync(path.join(base, 'a.txt'), 'uno');
    run(base, 'add', '.');
    run(base, 'commit', '-m', 'init');
    const worktree = createSquadWorktree(base, 'etapas')!;
    const { chat, sessions, session } = setup((emit) => { fs.writeFileSync(path.join(worktree.path, 'etapa1.txt'), '1'); emit({ kind: 'text', text: 'hecho' }); return { status: 'completed' }; });
    sessions.update(session.id, { isolatedBranch: worktree.branch, projectPath: worktree.path });
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: worktree.path });
    const commit = sessions.get(session.id)!.messages[1].stageCommit!;
    assert.match(commit, /^[0-9a-f]{40}$/);
    assert.ok(run(worktree.path, 'log', '--format=%s', '-1').includes('agent-hub:'));
    fs.writeFileSync(path.join(worktree.path, 'despues.txt'), '2');
    assert.ok(restoreStage(worktree.path, commit));
    assert.ok(fs.existsSync(path.join(worktree.path, 'etapa1.txt')));
    assert.ok(!fs.existsSync(path.join(worktree.path, 'despues.txt')));
  });

  it('traspaso en paralelo: el Desarrollador avisa a dos compañeros y ambos reciben el trabajo', async () => {
    const message = (name: string) => `>> ${name}: Hecho: a\nArchivos: b\nPendiente: c\nVerificación: d\n\n`;
    let turns = 0;
    const { chat, provider, sessions, session } = setup((emit) => {
      // Solo el primer turno (el del Desarrollador) traspasa; los compañeros responden sin escribir a nadie.
      emit({ kind: 'text', text: ++turns === 1 ? message('revisor-1') + message('documentador-1') : 'recibido' });
      return { status: 'completed' };
    });
    sessions.update(session.id, { protocolRole: 'desarrollador', taskSlug: 'desarrollador-1', squad: 'P', handoffTo: ['revisor', 'documentador'] });
    sessions.create({ protocolRole: 'revisor', taskSlug: 'revisor-1', squad: 'P' });
    sessions.create({ protocolRole: 'documentador', taskSlug: 'documentador-1', squad: 'P' });
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: tempDir() });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(provider.requests[0].prompt.includes('"revisor-1" y a "documentador-1"'));
    assert.strictEqual(provider.requests.length, 3);
  });

  it('markInterrupted avisa de un turno que quedó a medias y no repite el aviso', () => {
    const { chat, sessions, session } = setup(() => ({ status: 'completed' }));
    sessions.appendMessage(session.id, { id: 'u1', role: 'user', content: 'hazlo', profileId: 'p', modelName: 'Usuario', timestamp: Date.now() });
    chat.markInterrupted();
    chat.markInterrupted();
    assert.strictEqual(sessions.get(session.id)!.messages.filter((m) => m.content.includes('se interrumpió')).length, 1);
  });

  it('los traspasos pendientes sobreviven a un reinicio', async () => {
    const dir = tempDir();
    const sessions = new SessionStore(dir);
    let stored: any[] = [];
    const store = { load: () => stored, save: (items: any[]) => { stored = items; } };
    const script = (emit: (event: AgentEvent) => void) => { emit({ kind: 'text', text: '>> tester-1: Hecho: s\nArchivos: a\nPendiente: t\nVerificación: v\n\n' }); return { status: 'completed' as const }; };
    const chat = new ChatService(sessions, new TelemetryStore(dir), new ProviderRegistry([new FakeProvider(script)]), () => undefined, undefined, store);
    const sender = sessions.getActive();
    sessions.update(sender.id, { protocolRole: 'arquitecto', taskSlug: 'arquitecto-1', squad: 'S', approveStages: true });
    sessions.create({ protocolRole: 'tester', taskSlug: 'tester-1', squad: 'S' });
    await chat.send({ sessionId: sender.id, prompt: 'x', workspaceDir: dir });
    assert.strictEqual(stored.length, 1);
    const posted: HostMessage[] = [];
    const reopened = new ChatService(sessions, new TelemetryStore(dir), new ProviderRegistry([new FakeProvider(script)]), (m) => posted.push(m), undefined, store);
    reopened.publishSessions();
    const patch = posted.find((m) => m.type === 'state')!;
    assert.ok(patch.type === 'state' && patch.patch.pendingHandoffs?.length === 1);
  });

  it('avisa por el centro de notificaciones cuando termina un agente que no estás viendo', async () => {
    const { chat, sessions, session, posted } = setup((emit) => { emit({ kind: 'text', text: 'listo' }); return { status: 'completed' }; });
    sessions.create({});
    await chat.send({ sessionId: session.id, prompt: 'x', workspaceDir: tempDir() });
    const notice = posted.find((m) => m.type === 'notice');
    assert.ok(notice && notice.type === 'notice' && notice.notice.text.includes('terminó') && notice.notice.sessionId === session.id);
  });

  it('guarda la respuesta y la conversación de la CLI en el host', async () => {
    const { session, send, posted, chat } = setup((emit) => {
      emit({ kind: 'resumeId', id: 'cli-1' });
      emit({ kind: 'text', text: 'Hola' });
      return { status: 'completed' };
    });
    await send('Hola');
    assert.deepStrictEqual(session.messages.map((m) => [m.role, m.content]), [['user', 'Hola'], ['assistant', 'Hola']]);
    assert.strictEqual(session.messages[1].isStreaming, false);
    assert.strictEqual(session.cliSessionId, 'cli-1');
    assert.ok(posted.some((m) => m.type === 'turnText'));
    assert.deepStrictEqual(chat.runningSessionIds(), []);
  });

  it('agrupa el texto del stream sin perder nada', async () => {
    const { send, posted, session } = setup((emit) => {
      ['a', 'b', 'c'].forEach((text) => emit({ kind: 'text', text }));
      return { status: 'completed' };
    });
    await send('Hola');
    const chunks = posted.filter((m) => m.type === 'turnText');
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].type === 'turnText' && chunks[0].text, 'abc');
    assert.strictEqual(session.messages[1].content, 'abc');
  });

  it('publica mensajes solo de la sesión activa', async () => {
    const { send, sessions, chat, posted, session } = setup((emit) => { emit({ kind: 'text', text: 'x' }); return { status: 'completed' }; });
    await send('Hola');
    sessions.create({});
    chat.publishSessions();
    const last = [...posted].reverse().find((m) => m.type === 'state' && m.patch.sessions);
    const published = last?.type === 'state' ? last.patch.sessions?.find((candidate) => candidate.id === session.id) : undefined;
    assert.deepStrictEqual(published?.messages, []);
    assert.strictEqual(published?.messageCount, 2);
    assert.strictEqual(session.messages.length, 2);
  });

  it('el título sale del primer mensaje', async () => {
    const { session, send } = setup((emit) => { emit({ kind: 'text', text: 'x' }); return { status: 'completed' }; });
    await send('Revisa el login');
    assert.strictEqual(session.title, 'Revisa el login');
  });

  it('un fallo se ve en el chat y olvida la conversación de la CLI', async () => {
    const { session, send } = setup((emit) => {
      emit({ kind: 'resumeId', id: 'dañada' });
      return { status: 'failed', error: 'Sin autenticación' };
    });
    await send('Hola');
    assert.deepStrictEqual(session.messages.map((m) => [m.role, m.content, m.isError]), [
      ['user', 'Hola', undefined],
      ['system', 'Sin autenticación', true]
    ]);
    assert.strictEqual(session.cliSessionId, undefined);
  });

  it('un turno cancelado conserva el texto parcial', async () => {
    const { session, send } = setup((emit) => { emit({ kind: 'text', text: 'parcial' }); return { status: 'cancelled' }; });
    await send('Hola');
    assert.deepStrictEqual(session.messages.map((m) => m.content), ['Hola', 'parcial', 'Turno detenido.']);
  });

  it('sin reanudación manda el historial; con reanudación, no', async () => {
    const { send, provider, sessions, session } = setup((emit) => { emit({ kind: 'text', text: 'respuesta' }); return { status: 'completed' }; });
    await send('primero');
    sessions.changeAccount(session.id, 'claude-main');
    await send('segundo');
    assert.ok(provider.requests[1].prompt.includes('primero'));

    sessions.update(session.id, { cliSessionId: 'c' });
    await send('tercero');
    assert.strictEqual(provider.requests[2].prompt, 'tercero');
    assert.strictEqual(provider.requests[2].resumeId, 'c');
  });

  it('guarda la miniatura y descarta la imagen completa', async () => {
    const { session, chat, sessions } = setup((emit) => { emit({ kind: 'text', text: 'ok' }); return { status: 'completed' }; });
    await chat.send({
      sessionId: session.id,
      prompt: 'Mira',
      workspaceDir: tempDir(),
      attachments: [{ file: 'a.png', mediaType: 'image', mediaUri: 'data:completa', thumbnailUri: 'data:mini', content: '' }]
    });
    const [attachment] = sessions.get(session.id)!.messages[0].attachments!;
    assert.strictEqual(attachment.mediaUri, undefined);
    assert.strictEqual(attachment.thumbnailUri, 'data:mini');
  });

  it('precalienta la CLI y no lo hace durante un turno', async () => {
    const { chat, session, provider } = setup((emit) => { emit({ kind: 'text', text: 'x' }); return { status: 'completed' }; });
    await chat.prewarm(session.id, tempDir());
    assert.strictEqual(provider.prewarmed, 1);
  });

  it('solo registra telemetría de turnos completados', async () => {
    const { send, telemetry } = setup(() => ({ status: 'failed', error: 'x' }));
    await send('Hola');
    assert.deepStrictEqual(Object.keys(telemetry.getRegistry()), []);
  });

  it('un mensaje enviado durante un turno queda en cola y se envía al terminar', async () => {
    const { send, session, provider, posted } = setup((emit) => { emit({ kind: 'text', text: 'ok' }); return { status: 'completed' }; });
    const first = send('uno');
    await send('dos');
    const queued = posted.flatMap((m) => (m.type === 'state' && m.patch.queues?.[session.id]?.length ? [m.patch.queues[session.id]] : []));
    assert.deepStrictEqual(queued[0].map((q) => q.prompt), ['dos']);
    await first;
    assert.deepStrictEqual(provider.requests.map((r) => r.prompt.includes('dos')), [false, true]);
    assert.deepStrictEqual(session.messages.filter((m) => m.role === 'user').map((m) => m.content), ['uno', 'dos']);
  });

  it('un turno detenido deja la cola en espera hasta reanudarla', async () => {
    let cancelNext = true;
    const { send, session, chat } = setup(() => {
      const outcome = cancelNext ? { status: 'cancelled' as const } : { status: 'completed' as const };
      cancelNext = false;
      return outcome;
    });
    const first = send('uno');
    await send('dos');
    await first;
    assert.deepStrictEqual(session.messages.filter((m) => m.role === 'user').map((m) => m.content), ['uno']);
    await chat.resumeQueue(session.id);
    assert.deepStrictEqual(session.messages.filter((m) => m.role === 'user').map((m) => m.content), ['uno', 'dos']);
  });

  it('publica el razonamiento y los comandos en vivo y los limpia al terminar', async () => {
    const { send, posted, session } = setup((emit) => {
      emit({ kind: 'thinking', text: 'pienso' });
      emit({ kind: 'activity', label: 'Bash: npm test' });
      return { status: 'completed' };
    });
    await send('Hola');
    const lives = posted.flatMap((m) => (m.type === 'live' ? [m.live] : []));
    assert.deepStrictEqual(lives.find((l) => l?.commands.length)?.commands, ['Bash: npm test']);
    assert.strictEqual(lives.find((l) => l?.thinking)?.thinking, 'pienso');
    assert.strictEqual(lives[lives.length - 1], undefined);
    assert.strictEqual(session.messages[1].thinking, 'pienso');
  });

  it('entrega a un compañero el mensaje `>> nombre: texto` y frena las cadenas', async () => {
    const dir = tempDir();
    const sessions = new SessionStore(dir);
    const first = sessions.create({ taskSlug: 'arquitecto-1', squad: 's' });
    const second = sessions.create({ taskSlug: 'tester-1', squad: 's' });
    // Cada turno le escribe al otro agente: sin tope, la conversación no terminaría.
    const provider = new FakeProvider((emit) => {
      emit({ kind: 'text', text: `>> ${provider.requests.length % 2 ? 'tester-1' : 'arquitecto-1'}: ping` });
      return { status: 'completed' };
    });
    const chat = new ChatService(sessions, new TelemetryStore(dir), new ProviderRegistry([provider]), () => undefined);
    await chat.send({ sessionId: first.id, prompt: 'inicia', workspaceDir: dir });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const received = second.messages.find((m) => m.role === 'user');
    assert.deepStrictEqual([received?.content, received?.modelName], ['ping', 'arquitecto-1']);
    assert.ok(provider.requests[0].prompt.includes('tester-1'));
    assert.strictEqual(provider.requests.length, 7);
  });

  it('una excepción del proveedor no deja la sesión ocupada', async () => {
    const { send, chat, session } = setup(() => { throw new Error('valor inválido'); });
    await send('Hola');
    assert.strictEqual(chat.isRunning(session.id), false);
    assert.strictEqual(session.messages[session.messages.length - 1].content, 'valor inválido');
  });
});

describe('Estado de la webview', () => {
  const session = {
    id: 's', title: 't', profileId: 'p', modelId: 'm', effort: 'low', createdAt: 1, updatedAt: 1,
    messages: [{ id: 'm1', role: 'assistant', content: 'Ho', profileId: 'p', modelName: 'm', timestamp: 1 }]
  } as ConversationSession;

  it('concatena el stream solo en el mensaje indicado', () => {
    const loaded = hubReducer(INITIAL_HUB_STATE, { type: 'state', patch: { sessions: [session], activeSessionId: 's' } });
    const next = hubReducer(loaded, { type: 'turnText', sessionId: 's', messageId: 'm1', text: 'la' });
    assert.strictEqual(next.sessions[0].messages[0].content, 'Hola');
    assert.strictEqual(session.messages[0].content, 'Ho');
  });

  it('anota en qué punto del texto empezó cada paso', () => {
    const loaded = hubReducer(INITIAL_HUB_STATE, { type: 'state', patch: { sessions: [session] } });
    const next = hubReducer(loaded, { type: 'turnActivity', sessionId: 's', messageId: 'm1', label: 'Bash: ls' });
    assert.deepStrictEqual(next.sessions[0].messages[0].activityOffsets, [2]);
  });

  it('separa la narración entre pasos de la respuesta final', () => {
    const content = 'Reviso.\n\nAhora porto.\n\nListo: todo pasa.';
    const turn = splitTurn({ content, activity: ['Bash: a', 'Edit: b'], activityOffsets: [7, 21] });
    assert.deepStrictEqual(turn.process, [
      { kind: 'note', text: 'Reviso.' }, { kind: 'step', label: 'Bash: a' },
      { kind: 'note', text: 'Ahora porto.' }, { kind: 'step', label: 'Edit: b' }
    ]);
    assert.strictEqual(turn.answer, 'Listo: todo pasa.');
    assert.strictEqual(splitTurn({ content, activity: ['Bash: a'] }).answer, content);
  });

  it('un parche parcial no borra el resto del estado', () => {
    const loaded = hubReducer(INITIAL_HUB_STATE, { type: 'state', patch: { sessions: [session] } });
    const next = hubReducer(loaded, { type: 'state', patch: { accounts: [CLAUDE_ACCOUNT] } });
    assert.strictEqual(next.sessions.length, 1);
    assert.strictEqual(next.accountsLoaded, true);
  });
});

describe('Modelo recomendado por rol', () => {
  const account: AccountProfile = {
    ...CLAUDE_ACCOUNT,
    models: [
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', efforts: ['low', 'medium'] },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', efforts: ['low', 'medium', 'high'] }
    ]
  };
  it('usa el modelo y esfuerzo del rol cuando la cuenta lo ofrece', () => {
    assert.deepStrictEqual(recommendedFor('explorador', account), { modelId: 'claude-haiku-5-5', effort: 'low' });
  });
  it('no cambia nada si la cuenta no ofrece el modelo', () => {
    assert.strictEqual(recommendedFor('disenador', account), undefined);
    assert.strictEqual(recommendedFor('explorador', GOOGLE_ACCOUNT), undefined);
  });
});

describe('Proyectos', () => {
  it('renombra el proyecto en todas sus conversaciones', () => {
    const store = new SessionStore(tempDir());
    const a = store.create({ projectName: 'viejo' });
    const b = store.create({ projectName: 'viejo' });
    const c = store.create({ projectName: 'otro' });
    store.renameProject('viejo', 'nuevo');
    assert.deepStrictEqual([a, b, c].map((s) => s.projectName), ['nuevo', 'nuevo', 'otro']);
  });

  it('mover una conversación toma la ruta del proyecto de destino', () => {
    const store = new SessionStore(tempDir());
    store.create({ projectName: 'destino', projectPath: '/repo/destino' });
    const moved = store.create({ projectName: 'origen', projectPath: '/repo/origen' });
    store.moveToProject(moved.id, 'destino');
    assert.deepStrictEqual([moved.projectName, moved.projectPath], ['destino', '/repo/destino']);
    store.moveToProject(moved.id, undefined);
    assert.strictEqual(moved.projectName, undefined);
  });
});

describe('Parser de Claude: razonamiento', () => {
  it('emite el razonamiento una sola vez aunque llegue el mensaje completo', () => {
    const parser = new ClaudeStreamParser();
    const events = parseAll(parser, [
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'a' } } },
      { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'a' }] } }
    ]);
    assert.deepStrictEqual(events.filter((e) => e.kind === 'thinking'), [{ kind: 'thinking', text: 'a' }]);
  });
});

describe('Markdown', () => {
  it('separa código, títulos, listas y párrafos', () => {
    const blocks = parseMarkdownBlocks('# Título\n\nTexto\nseguido\n\n- uno\n- dos\n\n```ts\nconst a = 1;\n```');
    assert.deepStrictEqual(blocks.map((b) => b.kind), ['heading', 'paragraph', 'list', 'code']);
    assert.deepStrictEqual(blocks[3], { kind: 'code', language: 'ts', code: 'const a = 1;' });
  });

  it('un bloque de código sin cerrar durante el stream no se pierde', () => {
    assert.deepStrictEqual(parseMarkdownBlocks('```py\nprint(1)'), [{ kind: 'code', language: 'py', code: 'print(1)' }]);
  });

  it('preserva viñetas anidadas dentro de listas ordenadas sin convertirlas en números', () => {
    const md = '1. Primero:\n   * Detalle A\n   * Detalle B\n2. Segundo:\n   * Detalle C';
    const blocks = parseMarkdownBlocks(md);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].kind, 'list');
    const list = blocks[0];
    assert.strictEqual(list.itemDetails.length, 5);
    assert.strictEqual(list.itemDetails[0].ordered, true);
    assert.strictEqual(list.itemDetails[0].level, 0);
    assert.strictEqual(list.itemDetails[1].ordered, false);
    assert.strictEqual(list.itemDetails[1].level, 1);
    assert.strictEqual(list.itemDetails[2].ordered, false);
    assert.strictEqual(list.itemDetails[2].level, 1);
    assert.strictEqual(list.itemDetails[3].ordered, true);
    assert.strictEqual(list.itemDetails[3].level, 0);
    assert.strictEqual(list.itemDetails[4].ordered, false);
    assert.strictEqual(list.itemDetails[4].level, 1);
  });
});

describe('Acciones del espacio de trabajo', () => {
  it('tienen IDs únicos', () => {
    const ids = WORKSPACE_ACTIONS.map((action) => action.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('resume las llamadas a herramientas en una línea', () => {
    assert.strictEqual(describeToolCall('run_command', { CommandLine: 'git\n  status' }), 'run_command: git status');
    assert.strictEqual(describeToolCall('todo', {}), 'todo');
  });
});

describe('Roles del protocolo', () => {
  it('los 10 roles tienen prompt y esfuerzo válido', () => {
    assert.strictEqual(Object.keys(PROTOCOL_ROLES).length, 10);
    for (const role of Object.values(PROTOCOL_ROLES)) {
      assert.ok(role.systemPrompt.length > 100, role.id);
      assert.ok(['low', 'medium', 'high', 'max'].includes(role.recommendedEffort), role.id);
    }
  });
});

describe('Pipeline y permisos por rol', () => {
  it('el pipeline encadena arquitecto → tester → desarrollador → revisor → documentador', () => {
    const chain: string[] = [];
    for (let role: string | undefined = 'arquitecto'; role; role = (PROTOCOL_ROLES as any)[role].handoffTo) chain.push(role);
    assert.deepStrictEqual(chain, ['arquitecto', 'tester', 'desarrollador', 'revisor', 'documentador']);
  });

  it('explorador, revisor y coordinador son de solo lectura; el desarrollador no', () => {
    for (const id of ['explorador', 'revisor', 'coordinador'] as const) assert.strictEqual(PROTOCOL_ROLES[id].readOnly, true, id);
    assert.ok(!PROTOCOL_ROLES.desarrollador.readOnly);
  });

  it('el prompt indica a quién pasar el trabajo solo si hay siguiente', () => {
    const team = { self: 'tester-1', mates: ['desarrollador-1'], next: ['desarrollador-1'] };
    assert.ok(composePrompt({ prompt: 'x', team }).includes('>> desarrollador-1:'));
    assert.ok(!composePrompt({ prompt: 'x', team: { ...team, next: [] } }).includes('pásale el trabajo'));
  });

  it('missingHandoffFields lista los campos que faltan en el traspaso', () => {
    assert.deepStrictEqual(missingHandoffFields('Hecho: x\nArchivos: a\nPendiente: y\nVerificación: z'), []);
    assert.deepStrictEqual(missingHandoffFields('Hecho: x'), ['Archivos:', 'Pendiente:', 'Verificación:']);
  });

  it('la experiencia del proyecto se carga con tope y solo pide lecciones a quien puede escribir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-exp-'));
    assert.strictEqual(loadExperience(dir), undefined);
    fs.mkdirSync(path.join(dir, '.agent-hub'));
    fs.writeFileSync(path.join(dir, '.agent-hub', 'experience.md'), 'viejo'.repeat(1000) + 'RECIENTE');
    const loaded = loadExperience(dir)!;
    assert.ok(loaded.length <= 2000 && loaded.endsWith('RECIENTE'));
    assert.ok(composePrompt({ prompt: 'x', experience: loaded }).includes('[EXPERIENCIA DEL PROYECTO]'));
    assert.ok(composePrompt({ prompt: 'x', canWrite: true }).includes('[LECCIONES]'));
    assert.ok(!composePrompt({ prompt: 'x', canWrite: false }).includes('[LECCIONES]'));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('revertCheckpointFile restaura un solo archivo y getCheckpointFiles lo lista', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-ckpt-'));
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: 'ignore' });
    git('init');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'uno');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'uno');
    git('add', '.');
    git('commit', '-m', 'init');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'dos');
    const hash = createCheckpoint(dir)!;
    fs.writeFileSync(path.join(dir, 'a.txt'), 'tres');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'tres');
    assert.deepStrictEqual(getCheckpointFiles(dir, hash).sort(), ['a.txt', 'b.txt']);
    assert.ok(revertCheckpointFile(dir, hash, 'a.txt'));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'dos');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'tres');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Rol de diseñador', () => {
  it('pide cargar la skill compartida y la skill existe', () => {
    assert.ok(PROTOCOL_ROLES.disenador.systemPrompt.includes('disenador-grafico'));
    const skill = fs.readFileSync(path.join(process.cwd(), 'resources', 'skills', 'disenador-grafico', 'SKILL.md'), 'utf8');
    assert.ok(/^---\r?\nname: disenador-grafico\r?\n/.test(skill));
  });
});

describe('Adjuntos', () => {
  const write = (name: string, content: string | Buffer) => {
    const file = path.join(tempDir(), name);
    fs.writeFileSync(file, content);
    return file;
  };

  it('el texto va dentro del prompt', async () => {
    const attachment = await readAttachment(write('notas.csv', 'a,b'));
    assert.strictEqual(attachment.content, 'a,b');
    assert.strictEqual(attachment.mediaType, undefined);
  });

  it('un binario viaja por ruta y sin contenido', async () => {
    const file = write('informe.pdf', Buffer.from([0x25, 0x50, 0x00, 0x46]));
    const attachment = await readAttachment(file);
    assert.strictEqual(attachment.mediaType, 'file');
    assert.strictEqual(attachment.content, '');
    assert.strictEqual(attachment.fsPath, file);
  });

  it('una imagen trae vista previa', async () => {
    const attachment = await readAttachment(write('logo.png', Buffer.from([1, 2, 3])));
    assert.strictEqual(attachment.mediaType, 'image');
    assert.ok(attachment.mediaUri?.startsWith('data:image/png;base64,'));
  });

  it('el prompt indica la ruta de cualquier archivo', () => {
    const prompt = composePrompt({ prompt: 'Lee', attachments: [{ file: 'a.pdf', fsPath: 'C:/a.pdf', mediaType: 'file', content: '' }] });
    assert.ok(prompt.includes('Archivo "a.pdf" en la ruta local: C:/a.pdf'));
  });
});

describe('Filtro de acciones', () => {
  it('ignora mayúsculas y tildes', () => {
    assert.ok(filterActions('SECRETOS', 'all').some((action) => action.id === 'scan-secrets'));
    assert.ok(filterActions('tunel', 'all').some((action) => action.id === 'local-tunnel'));
  });

  it('exige todas las palabras y respeta el grupo', () => {
    assert.deepStrictEqual(filterActions('diagrama secuencia', 'all').map((action) => action.id), ['sequence-diagram']);
    assert.ok(filterActions('', 'Git').every((action) => action.group === 'Git'));
    assert.strictEqual(filterActions('', 'all').length, WORKSPACE_ACTIONS.length);
    assert.deepStrictEqual(filterActions('zzz', 'all'), []);
  });
});

describe('Cierre de sesión en Antigravity', () => {
  const account = (id: string, configDir: string): AccountProfile => ({ id, name: id, provider: 'google', status: 'connected', configDir, models: [] });

  it('la cuenta principal abre agy con /logout y no borra nada', async () => {
    const dir = tempDir();
    const requests: Array<{ command?: string }> = [];
    await new AntigravityProvider((request) => requests.push(request), new CliProcessPool()).logout(account('google-main', dir));
    assert.strictEqual(requests[0].command, '/logout');
    assert.ok(fs.existsSync(dir));
  });

  it('una etiqueta borra solo su carpeta .gemini-*', async () => {
    const dir = path.join(tempDir(), '.gemini-prueba');
    fs.mkdirSync(dir);
    await new AntigravityProvider(() => undefined, new CliProcessPool()).logout(account('google-prueba', dir));
    assert.strictEqual(fs.existsSync(dir), false);
  });

  it('se niega a borrar una carpeta que no es una etiqueta', async () => {
    const dir = tempDir();
    await assert.rejects(new AntigravityProvider(() => undefined, new CliProcessPool()).logout(account('google-x', dir)));
    assert.ok(fs.existsSync(dir));
  });
});

describe('Análisis locales', () => {
  it('detecta secretos reales y no marca código normal', () => {
    const dirty = ['sk-ant-' + 'a'.repeat(24), 'ghp_' + 'b'.repeat(24), 'AKIA' + 'C'.repeat(16), 'BEGIN ' + 'PRIVATE KEY'].join('\n');
    assert.strictEqual(findSecrets(dirty).length, 4);
    assert.deepStrictEqual(findSecrets('const apiKey = process.env.API_KEY;'), []);
  });

  it('marca DDL destructivo y aprueba DDL seguro', () => {
    assert.ok(findDestructiveStatements('ALTER TABLE u DROP COLUMN e CASCADE; TRUNCATE TABLE c;').length >= 3);
    assert.deepStrictEqual(findDestructiveStatements('CREATE TABLE c (id uuid); ALTER TABLE c ADD COLUMN d text;'), []);
  });

  it('marca consultas problemáticas y aprueba las sanas', () => {
    assert.strictEqual(findQueryIssues("SELECT * FROM a JOIN b WHERE n LIKE '%x%'").length, 3);
    assert.deepStrictEqual(findQueryIssues('SELECT id FROM a JOIN b ON a.id = b.id WHERE a.x = 1'), []);
  });

  it('anonimiza emails, tarjetas, teléfonos y JWT', () => {
    const result = sanitizePii('a@b.com 4532-1234-5678-9010 +57 300 123 4567 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozS6x8C');
    assert.strictEqual(result, '[EMAIL_ANONIMIZADO] [TARJETA_CREDITO_PROTEGIDA] [TELEFONO_REDACTADO] [JWT_TOKEN_MASCARADO]');
  });

  it('detecta relaciones en bucles sin falsos positivos', () => {
    const analysis = detectNPlusOneQueries('for c in contratos:\n    print(c.empresa.nombre)\n');
    assert.strictEqual(analysis.warnings[0].relation, 'empresa');
    assert.strictEqual(detectNPlusOneQueries('for n in range(10):\n    total += n\n').hasNPlusOne, false);
  });

  it('audita accesibilidad', () => {
    const issues = auditAccessibilityWCAG('<img src="a.png" />\n<button onClick={f}></button>\n<div onClick={g}>x</div>').issues;
    assert.ok(['1.1.1', '4.1.2', '2.1.1'].every((rule) => issues.some((issue) => issue.rule.includes(rule))));
    assert.strictEqual(auditAccessibilityWCAG('<img src="a.png" alt="Avatar" />').issuesCount, 0);
  });

  it('compara variables de entorno con .env.example', () => {
    const result = auditEnvSync('process.env.DATABASE_URL; process.env.STRIPE_KEY; os.environ.get("REDIS_HOST")', 'DATABASE_URL=x\nREDIS_HOST=y');
    assert.deepStrictEqual(result.undocumentedVars, ['STRIPE_KEY']);
  });
});

describe('Nuevas características de AgentHub', () => {
  it('createCheckpoint devuelve undefined de forma segura cuando no hay git', () => {
    const dir = tempDir();
    assert.strictEqual(createCheckpoint(dir), undefined);
    assert.strictEqual(rollbackCheckpoint(dir, 'fake'), false);
    assert.strictEqual(getCheckpointDiff(dir, 'fake'), '');
  });

  it('OllamaProvider maneja entornos sin servidor local sin lanzar excepciones', async () => {
    const provider = new OllamaProvider();
    const accounts = await provider.discoverAccounts();
    assert.ok(Array.isArray(accounts));
  });

  it('antepone las reglas del proyecto al componer el prompt', () => {
    const prompt = composePrompt({
      prompt: 'Construir endpoint',
      projectRules: 'Usa TypeScript estricto y sin any.'
    });
    assert.ok(prompt.includes('[REGLAS DEL PROYECTO]'));
    assert.ok(prompt.includes('Usa TypeScript estricto y sin any.'));
    assert.ok(prompt.includes('Construir endpoint'));
  });

  it('loadProjectRules detecta reglas persistentes desde AGENTS.md o .agent-hub/rules.md', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Normas del equipo\n- Clean architecture', 'utf8');
    const rules = loadProjectRules(dir);
    assert.ok(rules?.includes('# Normas del equipo'));
  });

  it('WORKSPACE_ACTIONS incluye commit semántico y auditoría de rama', () => {
    const commitActions = filterActions('commit', 'all');
    assert.ok(commitActions.some((a) => a.id === 'semantic-commit'));

    const branchActions = filterActions('auditoria', 'all');
    assert.ok(branchActions.some((a) => a.id === 'audit-branch'));
  });

  it('extractQuestionOptions detecta listas numeradas de 2 a 5 opciones con pregunta', () => {
    const text = '¿Qué arquitectura prefieres?\n1. Clean Architecture\n2. Hexagonal\n3. MVC\n4. Microservicios\n5. Monolito modular';
    const result = extractQuestionOptions(text);
    assert.ok(result);
    assert.strictEqual(result.question, '¿Qué arquitectura prefieres?');
    assert.strictEqual(result.options.length, 5);
    assert.strictEqual(result.options[0], 'Clean Architecture');
  });

  it('ClaudeStreamParser emite evento de pregunta cuando la herramienta es ask_question', () => {
    const parser = new ClaudeStreamParser();
    const events = parseAll(parser, [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'ask_question',
              input: {
                questions: [
                  {
                    question: '¿Qué base de datos usamos?',
                    options: ['PostgreSQL (Recommended)', 'SQLite', 'MongoDB']
                  }
                ]
              }
            }
          ]
        }
      }
    ]);
    const questionEvent = events.find((e) => e.kind === 'question');
    assert.ok(questionEvent);
    if (questionEvent && questionEvent.kind === 'question') {
      assert.strictEqual(questionEvent.question, '¿Qué base de datos usamos?');
      assert.strictEqual(questionEvent.options.length, 3);
    }
  });

  it('AntigravityStreamParser emite evento de pregunta cuando tool_name es ask_question', () => {
    const parser = new AntigravityStreamParser();
    const events = parser.parseLine(
      JSON.stringify({
        event: 'step_update',
        step_update: {
          step_type: 'tool',
          state: 'ACTIVE',
          tool_name: 'ask_question',
          tool_info: {
            parameters: {
              questions: [
                {
                  question: '¿Qué entorno desplegar?',
                  options: ['Staging', 'Producción']
                }
              ]
            }
          }
        }
      })
    );
    const questionEvent = events.find((e) => e.kind === 'question');
    assert.ok(questionEvent);
    if (questionEvent && questionEvent.kind === 'question') {
      assert.strictEqual(questionEvent.question, '¿Qué entorno desplegar?');
      assert.strictEqual(questionEvent.options.length, 2);
    }
  });

  it('parseMarkdownBlocks preserva URLs multilínea en ítems de lista sin insertar espacios extra', () => {
    const md = '- En [ `claude-stream-parser.ts` ](file:///c:/Users/juan0/Documents/GitHub/portafolio/agent-\n  hub/src/agents/claude/claude-stream-parser.ts)';
    const blocks = parseMarkdownBlocks(md);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].kind, 'list');
    if (blocks[0].kind === 'list') {
      assert.ok(blocks[0].items[0].includes('file:///c:/Users/juan0/Documents/GitHub/portafolio/agent-hub'));
    }
  });
});

describe('Búsqueda, costos y archivo de sesiones', () => {
  const message = (content: string, extra: Partial<ConversationSession['messages'][number]> = {}) =>
    ({ id: content, role: 'user' as const, content, profileId: 'p', modelName: 'm', timestamp: Date.UTC(2026, 10, 5, 12), ...extra });
  const session = (id: string, title: string, messages: ConversationSession['messages']): ConversationSession =>
    ({ id, title, taskSlug: title, profileId: 'p', modelId: 'm', effort: 'low', messages, createdAt: 0, updatedAt: 0 });

  it('searchSessions ignora tildes y mayúsculas, devuelve un resultado por sesión y exige 2 letras', () => {
    const sessions = [session('a', 'A', [message('Revisión de la CONEXIÓN a la base'), message('otra conexión')]), session('b', 'B', [message('nada')])];
    const hits = searchSessions(sessions, 'conexion');
    assert.deepStrictEqual(hits.map((h) => h.sessionId), ['a']);
    assert.ok(hits[0].snippet.includes('CONEXIÓN'));
    assert.deepStrictEqual(searchSessions(sessions, 'c'), []);
  });

  it('summarizeCosts agrega por día y por agente, de mayor a menor gasto', () => {
    const summary = summarizeCosts([
      session('a', 'uno', [message('x', { costUSD: 0.5 }), message('y', { costUSD: 0.25, timestamp: Date.UTC(2026, 10, 6, 12) })]),
      session('b', 'dos', [message('z', { costUSD: 1 })])
    ]);
    assert.deepStrictEqual(summary.agents, [{ name: 'dos', costUSD: 1 }, { name: 'uno', costUSD: 0.75 }]);
    assert.strictEqual(summary.days.length, 2);
    assert.ok(Math.abs(summary.days[0].costUSD - 1.5) < 1e-9);
  });

  it('las sesiones sin actividad en 30 días pasan a archive.json y siempre queda una', () => {
    const dir = tempDir();
    const first = new SessionStore(dir);
    const old = first.create({});
    first.get(old.id)!.updatedAt = Date.now() - 40 * 24 * 60 * 60 * 1000;
    first.flush();
    const reopened = new SessionStore(dir);
    assert.ok(!reopened.get(old.id));
    assert.ok(reopened.list().length >= 1);
    const archived = JSON.parse(fs.readFileSync(path.join(dir, 'archive.json'), 'utf8')) as ConversationSession[];
    assert.deepStrictEqual(archived.map((a) => a.id), [old.id]);
  });
});

describe('Copias aparte, plantillas y archivo restaurable', () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'ignore' });
  function repo(): string {
    const dir = path.join(tempDir(), 'proyecto');
    fs.mkdirSync(dir);
    git(dir, 'init');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'uno');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'init');
    return dir;
  }

  it('createSquadWorktree crea una rama y carpeta aparte; sin repo no hace nada', () => {
    const dir = repo();
    const worktree = createSquadWorktree(dir, 'squad-1')!;
    assert.ok(fs.existsSync(path.join(worktree.path, 'a.txt')));
    assert.strictEqual(worktree.branch, 'agent-hub/squad-1');
    assert.strictEqual(fs.realpathSync(mainRepoOf(worktree.path)!), fs.realpathSync(dir));
    assert.strictEqual(createSquadWorktree(tempDir(), 'x'), undefined);
  });

  it('mergeSquadWorktree lleva el trabajo al repo principal y limpia la copia', () => {
    const dir = repo();
    const worktree = createSquadWorktree(dir, 'squad-2')!;
    fs.writeFileSync(path.join(worktree.path, 'nuevo.txt'), 'hecho por el equipo');
    const result = mergeSquadWorktree(worktree.path, worktree.branch);
    assert.ok(result.ok, result.message);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'nuevo.txt'), 'utf8'), 'hecho por el equipo');
    assert.ok(!fs.existsSync(worktree.path));
  });

  it('mergeSquadWorktree con conflicto no cambia el repo principal y conserva la copia', () => {
    const dir = repo();
    const worktree = createSquadWorktree(dir, 'squad-3')!;
    fs.writeFileSync(path.join(worktree.path, 'a.txt'), 'del equipo');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'del usuario');
    git(dir, 'commit', '-am', 'cambio del usuario');
    const result = mergeSquadWorktree(worktree.path, worktree.branch);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'del usuario');
    assert.ok(fs.existsSync(worktree.path));
  });

  it('removeSquadWorktree descarta la copia y su rama', () => {
    const dir = repo();
    const worktree = createSquadWorktree(dir, 'squad-4')!;
    removeSquadWorktree(worktree.path, worktree.branch);
    assert.ok(!fs.existsSync(worktree.path));
    assert.strictEqual(execFileSync('git', ['branch', '--list', worktree.branch], { cwd: dir, encoding: 'utf8' }).trim(), '');
  });

  it('templateById cae en la feature completa si el id no existe', () => {
    assert.deepStrictEqual(templateById('bug').roles, ['depurador', 'desarrollador', 'revisor']);
    assert.strictEqual(templateById('nada').id, 'feature');
    for (const template of ['feature', 'bug', 'revision']) {
      const roles = templateById(template).roles;
      roles.slice(0, -1).forEach((role, index) => assert.strictEqual(PROTOCOL_ROLES[role].handoffTo, roles[index + 1], `${template}:${role}`));
    }
  });

  it('isInsideWorkspace rechaza rutas absolutas y salidas de la carpeta', () => {
    const dir = tempDir();
    assert.ok(isInsideWorkspace(dir, 'src/a.ts'));
    assert.ok(!isInsideWorkspace(dir, '../fuera.txt'));
    assert.ok(!isInsideWorkspace(dir, path.resolve(dir, 'a.ts')));
    assert.ok(!isInsideWorkspace(dir, ''));
  });

  it('projectPath ignora la copia aislada de un equipo', () => {
    const sessions = new SessionStore(tempDir());
    sessions.create({ projectName: 'p', projectPath: '/repo' });
    sessions.create({ projectName: 'p', projectPath: '/repo-wt', isolatedBranch: 'agent-hub/s' });
    assert.strictEqual(sessions.projectPath('p'), '/repo');
  });

  it('una sesión archivada se puede listar y restaurar, y no vuelve a archivarse al reabrir', () => {
    const dir = tempDir();
    const first = new SessionStore(dir);
    const old = first.create({ taskSlug: 'vieja' });
    first.get(old.id)!.updatedAt = Date.now() - 40 * 24 * 60 * 60 * 1000;
    first.flush();
    const reopened = new SessionStore(dir);
    assert.deepStrictEqual(reopened.listArchive().map((item) => item.id), [old.id]);
    assert.ok(reopened.restore(old.id));
    assert.ok(reopened.get(old.id));
    assert.deepStrictEqual(reopened.listArchive(), []);
    assert.ok(!reopened.restore('no-existe'));
    reopened.flush();
    assert.ok(new SessionStore(dir).get(old.id));
  });

  it('el historial reenviado conserva completos los mensajes recientes y recorta los antiguos', () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      id: String(index), role: 'user' as const, content: `m${index}-` + 'x'.repeat(3990), profileId: 'p', modelName: 'm', timestamp: index
    }));
    const prompt = composePrompt({ prompt: 'hola', history });
    assert.ok(prompt.includes('m19-' + 'x'.repeat(3990)));
    assert.ok(prompt.includes('[…]'));
    assert.ok(prompt.length < 24 * 4000 / 2);
  });
});

describe('Memoria, informe, issues, verificación por proyecto y copia aparte', () => {
  const entry = (signal: string, lesson: string, extra = '') => `Señal: ${signal}\nLección: ${lesson}\nEvidencia: x${extra}`;

  it('selectExperience descarta obsoletas y repetidas y no corta una entrada a la mitad', () => {
    const content = ['Notas del proyecto', entry('a', 'Usa X'), entry('b', 'usa  x'), entry('c', 'Evita Y', '\nObsoleta: sí'), entry('d', 'Prefiere Z')].join('\n');
    const picked = selectExperience(content, 2000);
    assert.ok(picked.includes('Prefiere Z'));
    assert.ok(!picked.includes('Evita Y'));
    assert.strictEqual(picked.split('Señal:').length - 1, 2);
    const tight = selectExperience(content, entry('d', 'Prefiere Z').length + 2);
    assert.strictEqual(tight.split('Señal:').length - 1, 1);
    assert.strictEqual(selectExperience('sin entradas '.repeat(300), 100).length, 100);
  });

  it('pruneExperience conserva el encabezado, quita obsoletas y repetidas y deja las más nuevas', () => {
    const content = ['# Memoria', entry('a', 'Usa X'), entry('b', 'Usa X'), entry('c', 'Otra', '\nObsoleta: sí')].join('\n');
    const pruned = pruneExperience(content);
    assert.ok(pruned.startsWith('# Memoria'));
    assert.strictEqual(pruned.split('Señal:').length - 1, 1);
    assert.ok(pruned.includes('Señal: b'));
  });

  it('buildTeamReport resume roles, archivos, costo y duración', () => {
    const member = (id: string, role: any, text: string): ConversationSession => ({
      id, title: id, taskSlug: id, protocolRole: role, profileId: 'p', modelId: 'm', effort: 'low', createdAt: 0, updatedAt: 0, isolatedBranch: 'agent-hub/s',
      messages: [{ id: id + 'a', role: 'assistant', content: text, profileId: 'p', modelName: 'm', timestamp: 0, costUSD: 0.5, durationMs: 65000, checkpointFiles: ['src/a.ts'] }]
    });
    const report = buildTeamReport([member('arquitecto-1', 'arquitecto', 'Diseñé la spec'), member('tester-1', 'tester', 'Escribí pruebas')]);
    assert.ok(report.includes('| arquitecto | arquitecto-1 | 1 | $0.5000 | 1m 5s | 1 |'));
    assert.ok(report.includes('**Total:** $1.0000 · 2m 10s'));
    assert.ok(report.includes('`src/a.ts`') && report.includes('agent-hub/s'));
  });

  it('parseIssueRef y resolveRequirement convierten #N en el texto de la issue o del PR', async () => {
    assert.deepStrictEqual(parseIssueRef('#12 con nota'), { number: '12', rest: 'con nota' });
    assert.strictEqual(parseIssueRef('arregla #12'), undefined);
    const issue = JSON.stringify({ title: 'Falla login', body: 'No entra', url: 'http://x/12' });
    const text = await resolveRequirement('#12 urgente', '.', async () => issue);
    assert.ok(text.startsWith('Issue #12: Falla login') && text.includes('No entra') && text.includes('urgente'));
    const viaPr = await resolveRequirement('#7', '.', async (args) => { if (args[0] === 'issue') throw new Error('no es issue'); return issue; });
    assert.ok(viaPr.startsWith('PR #7'));
    await assert.rejects(resolveRequirement('#9', '.', async () => { throw new Error('sin gh'); }), /No se pudo leer #9/);
    assert.strictEqual(await resolveRequirement('texto normal', '.', async () => { throw new Error('no debe llamarse'); }), 'texto normal');
  });

  it('la verificación usa la configuración del proyecto y se detiene en el primer fallo', async () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, '.agent-hub'));
    const config = (verify: string[]) => fs.writeFileSync(path.join(dir, '.agent-hub', 'config.json'), JSON.stringify({ verify }));
    config(['node -e "process.exit(0)"', 'node -e "console.log(\'roto\');process.exit(1)"', 'node -e "console.log(\'no llega\')"']);
    const failed = (await runProjectTests(dir))!;
    assert.strictEqual(failed.ok, false);
    assert.ok(failed.output.includes('roto') && !failed.output.includes('no llega'));
    config(['node -e "process.exit(0)"']);
    assert.strictEqual((await runProjectTests(dir))!.ok, true);
    assert.deepStrictEqual(verificationCommands(tempDir()), []);
  });

  it('newestBuildMs toma la compilación más nueva y formatBuildStamp la muestra en hora local', () => {
    const dist = tempDir();
    assert.strictEqual(newestBuildMs(dist), 0);
    const [extension, webview] = buildFiles(dist);
    fs.mkdirSync(path.dirname(webview), { recursive: true });
    fs.writeFileSync(extension, '');
    fs.writeFileSync(webview, '');
    fs.utimesSync(extension, new Date(2026, 10, 3, 11, 55), new Date(2026, 10, 3, 11, 55));
    fs.utimesSync(webview, new Date(2026, 10, 6, 2, 53), new Date(2026, 10, 6, 2, 53));
    assert.strictEqual(formatBuildStamp(newestBuildMs(dist)), '2026-11-06 02:53');
    assert.strictEqual(formatBuildStamp(0), '');
  });

  it('pullRequestCommand usa el informe del equipo como cuerpo y no un borrador cualquiera', () => {
    assert.strictEqual(pullRequestCommand('texto del borrador'), 'gh pr create --fill');
    const command = pullRequestCommand('# Informe del equipo\n\ncontenido');
    const file = /--body-file "(.+)"$/.exec(command)![1];
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '# Informe del equipo\n\ncontenido');
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('nextRoles prefiere lo fijado en el equipo y cae al rol; [] corta la cadena', () => {
    assert.deepStrictEqual(nextRoles({ protocolRole: 'tester' }), ['desarrollador']);
    assert.deepStrictEqual(nextRoles({ protocolRole: 'desarrollador', handoffTo: ['revisor', 'documentador'] }), ['revisor', 'documentador']);
    assert.deepStrictEqual(nextRoles({ protocolRole: 'revisor', handoffTo: [] }), []);
    assert.deepStrictEqual(nextRoles({}), []);
    assert.deepStrictEqual(templateById('paralelo').handoffs?.desarrollador, ['revisor', 'documentador']);
  });

  it('squadDiffFiles lista lo acumulado desde la base, incluidos archivos nuevos y borrados', () => {
    const base = path.join(tempDir(), 'repo');
    fs.mkdirSync(base);
    const run = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
    run(base, 'init');
    fs.writeFileSync(path.join(base, 'a.txt'), 'uno');
    fs.writeFileSync(path.join(base, 'b.txt'), 'dos');
    run(base, 'add', '.');
    run(base, 'commit', '-m', 'init');
    const worktree = createSquadWorktree(base, 'diff')!;
    fs.writeFileSync(path.join(worktree.path, 'a.txt'), 'cambiado');
    fs.rmSync(path.join(worktree.path, 'b.txt'));
    fs.writeFileSync(path.join(worktree.path, 'c.txt'), 'nuevo');
    assert.ok(commitStage(worktree.path, 'etapa'));
    fs.writeFileSync(path.join(worktree.path, 'd.txt'), 'sin commit');
    const files = squadDiffFiles(worktree.path, worktree.base);
    assert.deepStrictEqual(files.map((f) => `${f.status}:${f.file}`).sort(), ['A:c.txt', 'A:d.txt', 'D:b.txt', 'M:a.txt']);
    assert.ok(files.find((f) => f.file === 'a.txt')!.diff.includes('+cambiado'));
  });

  it('summarizeCosts suma la duración por agente solo cuando existe', () => {
    const message = (extra: object) => ({ id: 'm', role: 'assistant' as const, content: 'x', profileId: 'p', modelName: 'm', timestamp: Date.UTC(2026, 10, 5, 12), ...extra });
    const sessions: ConversationSession[] = [
      { id: 'a', title: 'uno', taskSlug: 'uno', profileId: 'p', modelId: 'm', effort: 'low', createdAt: 0, updatedAt: 0, messages: [message({ costUSD: 1, durationMs: 1000 }), message({ costUSD: 1, durationMs: 2000 })] }
    ];
    assert.deepStrictEqual(summarizeCosts(sessions).agents, [{ name: 'uno', costUSD: 2, durationMs: 3000 }]);
  });
});

describe('Punta a punta con una CLI simulada', () => {
  const FAKE = path.join(process.cwd(), 'tests', 'fake-claude.js');

  class E2EClaude extends ClaudeProvider {
    public async discoverAccounts() { return [CLAUDE_ACCOUNT]; }
  }

  function setupE2E() {
    const dir = tempDir();
    const log = path.join(dir, 'argv.log');
    process.env.FAKE_CLAUDE_LOG = log;
    const pool = new CliProcessPool();
    const provider = new E2EClaude(() => undefined, pool, { command: process.execPath, shell: false, prefixArgs: [FAKE] });
    const sessions = new SessionStore(dir);
    const chat = new ChatService(sessions, new TelemetryStore(dir), new ProviderRegistry([provider]), () => undefined);
    const argvs = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]) : []);
    return { dir, pool, sessions, chat, session: sessions.getActive(), argvs };
  }

  it('un turno real por el pool: texto, costo y conversación reanudable', async () => {
    const { pool, sessions, chat, session, dir } = setupE2E();
    try {
      await chat.send({ sessionId: session.id, prompt: 'hola', workspaceDir: dir });
      const messages = sessions.get(session.id)!.messages;
      assert.ok(messages[1].content.includes('Hola desde la CLI simulada'));
      assert.strictEqual(messages[1].costUSD, 0.01);
      assert.strictEqual(sessions.get(session.id)!.cliSessionId, 'fake-session');
      await chat.send({ sessionId: session.id, prompt: 'otra vez', workspaceDir: dir });
      assert.strictEqual(sessions.get(session.id)!.messages.filter((m) => m.role === 'assistant').length, 2);
    } finally {
      pool.dispose();
    }
  });

  it('un rol de solo lectura lanza la CLI sin herramientas de escritura y uno de escritura no', async () => {
    const { pool, sessions, chat, session, dir, argvs } = setupE2E();
    try {
      sessions.update(session.id, { protocolRole: 'revisor' });
      await chat.send({ sessionId: session.id, prompt: 'lee', workspaceDir: dir });
      sessions.update(session.id, { protocolRole: 'desarrollador', cliSessionId: undefined });
      await chat.send({ sessionId: session.id, prompt: 'edita', workspaceDir: dir });
      const [readOnly, writable] = argvs();
      assert.ok(readOnly.includes('--disallowedTools'));
      assert.ok(!writable.includes('--disallowedTools'));
    } finally {
      pool.dispose();
    }
  });

  it('si la CLI escribe en un turno de solo lectura, el hub lo detecta', async () => {
    const { pool, sessions, chat, session } = setupE2E();
    const repo = path.join(tempDir(), 'repo');
    fs.mkdirSync(repo);
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, stdio: 'ignore' });
    git('init');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'uno');
    git('add', '.');
    git('commit', '-m', 'init');
    try {
      sessions.update(session.id, { protocolRole: 'revisor' });
      await chat.send({ sessionId: session.id, prompt: 'ESCRIBIR nuevo.txt', workspaceDir: repo });
      const warning = sessions.get(session.id)!.messages.find((m) => m.content.includes('solo lectura'));
      assert.ok(warning && warning.content.includes('nuevo.txt'));
    } finally {
      pool.dispose();
    }
  });

  it('un error de cuota de la CLI llega al chat como error visible', async () => {
    const { pool, sessions, chat, session, dir } = setupE2E();
    try {
      await chat.send({ sessionId: session.id, prompt: 'CUOTA', workspaceDir: dir });
      const note = sessions.get(session.id)!.messages.find((m) => m.role === 'system');
      assert.ok(note && note.isError && /usage limit/i.test(note.content));
    } finally {
      pool.dispose();
    }
  });

  it('una CLI que se cuelga se cancela por inactividad', async () => {
    const { pool, sessions, chat, session, dir } = setupE2E();
    try {
      chat.idleTimeoutMs = 500;
      await chat.send({ sessionId: session.id, prompt: 'COLGAR', workspaceDir: dir });
      assert.ok(sessions.get(session.id)!.messages.some((m) => m.content.includes('Sin actividad')));
    } finally {
      pool.dispose();
    }
  });
});

describe('contextHandlers.attachGit', () => {
  it('adjunta el diff aunque supere 1 MB', async () => {
    const { contextHandlers } = await import('../src/host/handlers/context-handlers');
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'attach-git-'));
    const folders = (vscode.workspace as any).workspaceFolders;
    try {
      const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
      git('init', '-q');
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n');
      git('add', 'a.txt');
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'a');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'y'.repeat(2 * 1024 * 1024) + '\n');
      (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: repo } }];
      const posted: any[] = [];
      contextHandlers({ post: (m: any) => posted.push(m) } as any).attachGit({} as any);
      assert.strictEqual(posted.length, 1);
      assert.match(posted[0].attachment.content, /a\.txt/);
    } finally {
      (vscode.workspace as any).workspaceFolders = folders;
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
