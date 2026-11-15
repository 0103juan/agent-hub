import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { revertCheckpointFile } from '../git-checkpoint';
import { createSquadWorktree, mainRepoOf, mergeSquadWorktree, removeSquadWorktree, restoreStage, squadDiffFiles } from '../git-worktree';
import { resolveRequirement } from '../issue-source';
import { buildTeamReport } from '../../shared/team-report';
import { recommendedFor, resolveSelection } from '../../shared/model-selection';
import { searchSessions } from '../../shared/session-search';
import { DEFAULT_LOOP_INSTRUCTION, LoopConfig, ProtocolRole } from '../../shared/types';
import { PROTOCOL_ROLES } from '../../shared/protocol-roles';
import { templateById } from '../../shared/team-templates';
import { HubContext } from '../hub-context';
import { isInsideWorkspace } from '../safe-path';
import { workspaceDir } from '../workspace';
import { HandlerMap } from './handler-types';

/** Carpeta de un equipo: una copia aparte (git worktree) si se pide y se puede, si no la del proyecto. */
function squadLocation(hub: HubContext, name: string | undefined, folder: string | undefined, squad: string, isolate: boolean | undefined) {
  const base = (name && hub.sessions.projectPath(name)) || folder;
  const worktree = isolate && base ? createSquadWorktree(base, squad) : undefined;
  if (isolate && !worktree) {
    hub.chat.addNote(
      hub.sessions.getActive().id,
      'No se pudo crear la copia aparte (se necesita un repositorio git con al menos un commit): el equipo trabaja en la carpeta del proyecto.',
      true
    );
  }
  return { projectPath: worktree?.path ?? base, isolatedBranch: worktree?.branch, isolatedBase: worktree?.base };
}

export function sessionHandlers(hub: HubContext): HandlerMap<
  | 'createSession' | 'switchSession' | 'deleteSession' | 'moveSession' | 'renameProject' | 'deleteProject' | 'spawnAgents'
  | 'updateSession' | 'sendPrompt' | 'stopTurn' | 'prewarmSession' | 'removeQueued' | 'resumeQueue' | 'startPipeline' | 'failoverSession' | 'exportSession'
  | 'compareModels' | 'revertFile' | 'searchSessions' | 'finishSquad' | 'teamReport' | 'squadDiff' | 'restoreStage' | 'queueAction' | 'crossReview' | 'forkSession' | 'generateCommit' | 'auditBranch' | 'setSessionDir' | 'chooseSessionDir' | 'setVisibleSessions'
  | 'startLoop' | 'stopLoop' | 'finishLoop'
> {
  const applySessionDir = (sessionId: string, dir: string) => {
    if (!hub.sessions.get(sessionId) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    hub.sessions.update(sessionId, { projectPath: dir, projectName: path.basename(dir) });
    hub.chat.publishSessions();
  };

  return {
    // Apunta una conversación a otra carpeta; los siguientes turnos del agente corren ahí.
    setSessionDir: ({ sessionId, dir }) => applySessionDir(sessionId, dir),

    setVisibleSessions: ({ clientId, sessionIds }) => hub.chat.setVisible(String(clientId), Array.isArray(sessionIds) ? sessionIds.map(String) : []),

    chooseSessionDir: async ({ sessionId }) => {
      let dir: string | undefined;
      try {
        if (process.versions?.electron) {
          const result = await require('electron').dialog.showOpenDialog({ title: 'Carpeta de esta conversación', properties: ['openDirectory', 'createDirectory'] });
          dir = result.canceled ? undefined : result.filePaths?.[0];
        } else {
          dir = (await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Usar carpeta' }))?.[0]?.fsPath;
        }
      } catch {}
      if (dir) applySessionDir(sessionId, dir);
    },

    createSession: ({ projectName, taskSlug, protocolRole }) => {
      const current = hub.sessions.getActive();
      const folder = workspaceDir();
      hub.sessions.create({
        profileId: current.profileId,
        modelId: current.modelId,
        effort: current.effort,
        projectName: projectName ?? (folder && path.basename(folder)),
        projectPath: (projectName && hub.sessions.projectPath(projectName)) || folder,
        taskSlug,
        protocolRole
      });
      hub.chat.publishSessions();
    },

    switchSession: ({ sessionId }) => {
      hub.sessions.setActive(sessionId);
      hub.chat.markSeen(sessionId);
      hub.chat.publishSessions();
    },

    deleteSession: ({ sessionId }) => {
      hub.chat.discard(sessionId);
      hub.sessions.delete(sessionId);
      hub.chat.publishSessions();
    },

    moveSession: ({ sessionId, projectName }) => {
      hub.sessions.moveToProject(sessionId, projectName);
      hub.chat.publishSessions();
    },

    renameProject: ({ from, to }) => {
      const name = to.trim();
      if (name && name !== from) hub.sessions.renameProject(from, name);
      hub.chat.publishSessions();
    },

    deleteProject: ({ projectName }) => {
      for (const session of hub.sessions.list().filter((candidate) => candidate.projectName === projectName)) {
        hub.chat.discard(session.id);
        hub.sessions.delete(session.id);
      }
      hub.chat.publishSessions();
    },

    spawnAgents: async ({ projectName, roles, prompt, isolate }) => {
      const current = hub.sessions.getActive();
      const account = (await hub.providers.listAccounts()).find((candidate) => candidate.id === current.profileId);
      const folder = workspaceDir();
      const name = projectName ?? (folder && path.basename(folder));
      const squad = `squad-${Date.now()}`;
      const seen: Record<string, number> = {};
      const location = squadLocation(hub, name, folder, squad, isolate);
      const created = roles.map((role) => {
        const base = role ?? 'agente';
        seen[base] = (seen[base] ?? 0) + 1;
        return hub.sessions.create({
          profileId: current.profileId,
          modelId: current.modelId,
          effort: current.effort,
          ...(role && recommendedFor(role, account)),
          projectName: name,
          ...location,
          taskSlug: `${base}-${seen[base]}`,
          protocolRole: role,
          squad
        });
      });
      hub.sessions.setActive(current.id);
      hub.chat.publishSessions();
      if (prompt.trim()) {
        for (const session of created) {
          void hub.chat.send({ sessionId: session.id, prompt: prompt.trim(), workspaceDir: workspaceDirForSession(hub, session.id) });
        }
      }
    },

    updateSession: async ({ sessionId, patch }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;

      if (patch.profileId && patch.profileId !== session.profileId) {
        hub.sessions.changeAccount(sessionId, patch.profileId);
      }
      const { profileId: _profileId, protocolRole, budgetUSD, loopConfig, title, ...settings } = patch; // `permission` viaja en settings
      const cleanTitle = title?.trim().slice(0, 80);
      hub.sessions.update(sessionId, {
        ...settings,
        ...(cleanTitle && { title: cleanTitle }),
        ...(protocolRole !== undefined && { protocolRole: protocolRole ?? undefined }),
        ...(budgetUSD !== undefined && { budgetUSD: budgetUSD ?? undefined }),
        ...(loopConfig !== undefined && { loopConfig: loopConfig ?? undefined })
      });

      // Al cambiar de cuenta, el modelo debe ser uno que esa cuenta ofrezca.
      const { model } = resolveSelection(session, await hub.providers.listAccounts());
      if (model && model.id !== session.modelId) hub.sessions.update(sessionId, { modelId: model.id });
      hub.chat.publishSessions();
    },

    sendPrompt: ({ sessionId, prompt, attachments, planFirst }) =>
      hub.chat.send({ sessionId, prompt, attachments, planFirst, workspaceDir: workspaceDirForSession(hub, sessionId) }),

    stopTurn: ({ sessionId }) => {
      const session = hub.sessions.get(sessionId);
      if (session?.loopConfig?.active) {
        hub.sessions.update(sessionId, { loopConfig: { ...session.loopConfig, active: false } });
        hub.chat.addNote(sessionId, '⏹️ [Modo Loop] Bucle detenido al cancelar el turno.');
      }
      hub.chat.cancel(sessionId);
    },

    startLoop: ({ sessionId, instruction, maxIterations }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;
      const cleanInstruction = instruction.trim() || DEFAULT_LOOP_INSTRUCTION;
      const loopConfig: LoopConfig = {
        active: true,
        instruction: cleanInstruction,
        iteration: 1,
        maxIterations,
        startedAt: Date.now()
      };
      hub.sessions.update(sessionId, { loopConfig });
      hub.chat.publishSessions();
      hub.chat.addNote(sessionId, `🔄 [Modo Loop] Bucle continuo activado (Iteración 1). Instrucción: "${cleanInstruction}"`);
      void hub.chat.send({
        sessionId,
        prompt: `[MODO LOOP ACTIVO - Iteración 1]\nInstrucción en bucle: "${cleanInstruction}"\nInicia la ejecución de la instrucción. Este modo iterará de forma autónoma turno tras turno hasta que el usuario lo detenga o la sesión termine. Realiza progresos concretos y verifica cada cambio.`,
        workspaceDir: workspaceDirForSession(hub, sessionId),
        role: session.protocolRole,
        from: 'AgentHub (Loop)'
      });
    },

    stopLoop: ({ sessionId }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;
      if (session.loopConfig) {
        hub.sessions.update(sessionId, { loopConfig: { ...session.loopConfig, active: false } });
      }
      hub.chat.addNote(sessionId, '⏹️ [Modo Loop] Bucle detenido por el usuario.');
      hub.chat.cancel(sessionId);
      hub.chat.publishSessions();
    },

    /** Parar al acabar la iteración en curso; un segundo clic lo deshace. */
    finishLoop: ({ sessionId }) => {
      const loop = hub.sessions.get(sessionId)?.loopConfig;
      if (!loop?.active) return;
      if (!hub.chat.isRunning(sessionId)) {
        hub.sessions.update(sessionId, { loopConfig: { ...loop, active: false, stopAfterCurrent: false } });
        hub.chat.addNote(sessionId, '🏁 [Modo Loop] Detenido.');
        return;
      }
      hub.sessions.update(sessionId, { loopConfig: { ...loop, stopAfterCurrent: !loop.stopAfterCurrent } });
      hub.chat.publishSessions();
    },

    removeQueued: ({ sessionId, queuedId }) => hub.chat.removeQueued(sessionId, queuedId),

    resumeQueue: ({ sessionId }) => hub.chat.resumeQueue(sessionId),

    failoverSession: async ({ sessionId, targetProvider }) => {
      await hub.chat.failover(sessionId, targetProvider);
    },

    startPipeline: async ({ projectName, prompt: rawPrompt, requireApproval, template, isolate }) => {
      const current = hub.sessions.getActive();
      const folder = workspaceDir();
      // `#123` trae la issue o el PR como requerimiento.
      const prompt = await resolveRequirement(rawPrompt, folder ?? process.cwd());
      const name = projectName ?? (folder && path.basename(folder));
      const squad = `pipeline-${Date.now()}`;
      const accounts = await hub.providers.listAccounts();
      const account = accounts.find((a) => a.id === current.profileId) ?? accounts.find((a) => a.status === 'connected');

      const chosenTemplate = templateById(template);
      const pipelineRoles = chosenTemplate.roles;
      const slug = prompt.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `pipeline-${Date.now()}`;
      const specPath = `docs/specs/${slug}.md`;
      const location = squadLocation(hub, name, folder, squad, isolate);
      const created = pipelineRoles.map((role) => {
        return hub.sessions.create({
          profileId: current.profileId,
          modelId: current.modelId,
          effort: current.effort,
          ...(account && recommendedFor(role, account)),
          projectName: name,
          ...location,
          taskSlug: `${role}-1`,
          protocolRole: role,
          approveStages: requireApproval || undefined,
          handoffTo: chosenTemplate.handoffs?.[role],
          squad
        });
      });

      const [first] = created;
      hub.sessions.setActive(first.id);
      hub.chat.publishSessions();

      const firstRole = pipelineRoles[0];
      const next = pipelineRoles[1];
      const leadInstruction =
        firstRole === 'arquitecto'
          ? [
              'Eres el Arquitecto liderando el Pipeline de Desarrollo Autónomo.',
              `Diseña la solución detallada en ${specPath} con criterios de aceptación.`,
              next
                ? [
                    'Este pipeline es autónomo: no esperes aprobación. Al terminar, pásale el trabajo a tu compañero con estas líneas (y una en blanco al final):',
                    `>> ${next}-1: Hecho: especificación lista`,
                    `Archivos: ${specPath}`,
                    `Pendiente: ${PROTOCOL_ROLES[next].description}`,
                    'Verificación: criterios de aceptación en la especificación'
                  ].join('\n')
                : ''
            ]
          : [`Eres el ${PROTOCOL_ROLES[firstRole].label} que inicia este equipo. ${PROTOCOL_ROLES[firstRole].description}.`];
      const pipelineInstruction = [...leadInstruction, '', `Requerimiento:\n${prompt.trim()}`].join('\n');

      void hub.chat.send({
        sessionId: first.id,
        prompt: pipelineInstruction,
        workspaceDir: workspaceDirForSession(hub, first.id)
      });
    },

    teamReport: ({ sessionId }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;
      const members = session.squad ? hub.sessions.list().filter((candidate) => candidate.squad === session.squad).reverse() : [session];
      hub.post({ type: 'teamReport', squad: session.squad ?? session.id, markdown: buildTeamReport(members) });
    },

    squadDiff: ({ sessionId }) => {
      const session = hub.sessions.get(sessionId);
      if (!session?.squad || !session.isolatedBranch || !session.isolatedBase || !session.projectPath) return;
      hub.post({ type: 'squadDiff', squad: session.squad, files: squadDiffFiles(session.projectPath, session.isolatedBase) });
    },

    restoreStage: ({ sessionId, messageId }) => {
      const session = hub.sessions.get(sessionId);
      const commit = session?.messages.find((message) => message.id === messageId)?.stageCommit;
      // Solo en una copia aparte: un reset --hard nunca debe tocar la carpeta del usuario.
      if (!session?.isolatedBranch || !session.projectPath || !commit) return;
      for (const member of hub.sessions.list().filter((candidate) => candidate.squad === session.squad)) hub.chat.discard(member.id);
      const ok = restoreStage(session.projectPath, commit);
      hub.chat.addNote(sessionId, ok ? 'La copia aparte volvió a este punto (vale para todo el equipo).' : 'No se pudo volver a ese punto.', !ok);
    },

    queueAction: ({ sessionId, action }) => {
      if (action === 'cancel') hub.chat.cancelWaiting(sessionId);
      else hub.chat.prioritizeWaiting(sessionId);
    },

    finishSquad: ({ sessionId, action }) => {
      const session = hub.sessions.get(sessionId);
      if (!session?.squad || !session.isolatedBranch || !session.projectPath) return;
      const worktree = session.projectPath;
      const branch = session.isolatedBranch;
      const repo = mainRepoOf(worktree);
      if (!repo) {
        hub.chat.addNote(sessionId, 'No se encontró el repositorio principal de esta copia.', true);
        return;
      }
      const members = hub.sessions.list().filter((candidate) => candidate.squad === session.squad);
      for (const member of members) hub.chat.discard(member.id);
      if (action === 'merge') {
        const result = mergeSquadWorktree(worktree, branch);
        if (!result.ok) {
          hub.chat.addNote(sessionId, `No se pudo fusionar ${branch}: ${result.message}`, true);
          return;
        }
      } else {
        removeSquadWorktree(worktree, branch);
      }
      for (const member of members) hub.sessions.update(member.id, { projectPath: repo, isolatedBranch: undefined });
      hub.chat.addNote(sessionId, action === 'merge' ? `Equipo fusionado en la rama actual (${branch}).` : 'Copia aparte descartada.');
    },

    exportSession: async ({ sessionId, format = 'markdown' }: { sessionId: string; format?: 'markdown' | 'html' | 'json' }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;
      const baseSlug = (session.title || 'conversacion')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-|-$/g, '') || 'conversacion';
      const root = workspaceDirForSession(hub, sessionId);

      let fileName = `${baseSlug}.md`;
      let content = '';
      let filters: Record<string, string[]> = { Markdown: ['md'] };

      if (format === 'json') {
        fileName = `${baseSlug}.json`;
        content = JSON.stringify(session, null, 2);
        filters = { JSON: ['json'] };
      } else if (format === 'html') {
        fileName = `${baseSlug}.html`;
        filters = { HTML: ['html', 'htm'] };
        const msgHtml = session.messages.map((m) => {
          const isUser = m.role === 'user';
          const avatar = isUser ? '👤' : '🤖';
          const name = isUser ? 'Usuario' : (m.modelName || 'AgentHub');
          const dateStr = new Date(m.timestamp).toLocaleTimeString();
          const thinkingHtml = m.thinking ? `<details style="margin: 8px 0; padding: 8px 12px; background: rgba(99,102,241,0.08); border-left: 3px solid #6366f1; border-radius: 4px;"><summary style="cursor: pointer; font-size: 11px; font-weight: 600; color: #a5b4fc;">Razonamiento del modelo</summary><div style="font-size: 12px; color: #cbd5e1; margin-top: 6px; white-space: pre-wrap;">${m.thinking.replace(/</g, '&lt;')}</div></details>` : '';
          const bodyHtml = m.content.replace(/</g, '&lt;').replace(/\n/g, '<br/>');
          return `
            <div style="margin-bottom: 20px; display: flex; flex-direction: column; gap: 4px; ${isUser ? 'align-items: flex-end;' : 'align-items: flex-start;'}">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #94a3b8; font-family: monospace;">
                <span>${avatar}</span><strong>${name}</strong><span>${dateStr}</span>
              </div>
              <div style="max-width: 85%; padding: 12px 16px; border-radius: 10px; font-size: 13px; line-height: 1.6; ${isUser ? 'background: #312e81; color: #f8fafc;' : 'background: #18181b; border: 1px solid #27272a; color: #f4f4f5;'}">
                ${thinkingHtml}
                <div>${bodyHtml}</div>
              </div>
            </div>
          `;
        }).join('');

        content = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${session.title || 'Conversación AgentHub'}</title>
  <style>
    body { margin: 0; padding: 24px 16px; background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; }
    .container { width: 100%; max-width: 860px; }
    .header { padding-bottom: 16px; margin-bottom: 24px; border-bottom: 1px solid #27272a; }
    .header h1 { font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: #fff; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: #a1a1aa; font-family: monospace; }
    .badge { padding: 2px 8px; border-radius: 6px; background: #27272a; border: 1px solid #3f3f46; }
    pre { background: #121215; padding: 12px; border-radius: 6px; overflow-x: auto; border: 1px solid #27272a; font-family: monospace; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${session.title || 'Conversación AgentHub'}</h1>
      <div class="meta">
        <span class="badge">📁 ${session.projectName || 'General'}</span>
        <span class="badge">🤖 ${session.modelId}</span>
        <span class="badge">🕒 ${new Date(session.createdAt).toLocaleString()}</span>
        <span class="badge">💬 ${session.messages.length} mensajes</span>
      </div>
    </div>
    <div class="chat">
      ${msgHtml}
    </div>
  </div>
</body>
</html>`;
      } else {
        const lines = [
          `# ${session.title || 'Conversación AgentHub'}`,
          `**Proyecto:** ${session.projectName || 'General'} | **Modelo:** ${session.modelId} | **Fecha:** ${new Date(session.createdAt).toLocaleString()}`,
          '',
          '---',
          ''
        ];
        for (const msg of session.messages) {
          const sender = msg.role === 'user' ? '👤 **Usuario**' : `🤖 **${msg.modelName}**`;
          lines.push(`### ${sender}`);
          if (msg.thinking) {
            lines.push(`> *Razonamiento:* ${msg.thinking.replace(/\n/g, '\n> ')}`);
            lines.push('');
          }
          lines.push(msg.content);
          lines.push('');
        }
        content = lines.join('\n');
      }

      let targetUri: any;
      try {
        targetUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path.join(root, fileName)),
          filters
        });
      } catch {}
      // Sin diálogo el shim ya devuelve la ruta por defecto: `undefined` es que la persona canceló.
      if (!targetUri) return;

      await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
      const savedName = path.basename(targetUri.fsPath);
      void vscode.window.showInformationMessage(`Conversación guardada en ${savedName}`);
      hub.post({
        type: 'notice',
        notice: {
          id: `export-${Date.now()}`,
          sessionId,
          text: `Conversación guardada en ${savedName}`,
          at: Date.now()
        }
      });
    },

    compareModels: async ({ prompt }) => {
      const text = prompt.trim();
      if (!text) return;
      const current = hub.sessions.getActive();
      const folder = workspaceDir();
      // Una cuenta conectada por proveedor: comparar dos cuentas del mismo modelo no aporta.
      const byProvider = new Map<string, Awaited<ReturnType<typeof hub.providers.listAccounts>>[number]>();
      for (const account of await hub.providers.listAccounts()) {
        if (account.status === 'connected' && account.models.length > 0 && !byProvider.has(account.provider)) byProvider.set(account.provider, account);
      }
      const accounts = [...byProvider.values()];
      if (accounts.length < 2) {
        hub.chat.addNote(current.id, 'Para comparar necesitas cuentas conectadas de al menos dos proveedores.', true);
        return;
      }
      const stamp = Date.now().toString(36);
      const created = accounts.map((account) =>
        hub.sessions.create({
          profileId: account.id,
          modelId: account.models[0].id,
          effort: current.effort,
          projectName: current.projectName,
          projectPath: current.projectPath || folder,
          taskSlug: `comparar-${account.provider}-${stamp}`
        })
      );
      hub.sessions.setActive(created[0].id);
      hub.chat.publishSessions();
      for (const session of created) void hub.chat.send({ sessionId: session.id, prompt: text, workspaceDir: workspaceDirForSession(hub, session.id) });
    },

    searchSessions: ({ query }) => {
      hub.post({ type: 'searchResults', query, hits: searchSessions(hub.sessions.list(), query) });
    },

    revertFile: ({ sessionId, checkpointHash, file }) => {
      const dir = workspaceDirForSession(hub, sessionId);
      // El nombre llega de la webview: solo se acepta una ruta dentro del workspace.
      if (!isInsideWorkspace(dir, file)) return;
      const ok = revertCheckpointFile(dir, checkpointHash, file);
      hub.chat.addNote(sessionId, ok ? `Archivo restaurado: ${file}` : `No se pudo restaurar ${file}.`, !ok);
    },

    crossReview: async ({ sessionId, messageId }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;
      const msg = session.messages.find((m) => m.id === messageId);
      if (!msg) return;

      const accounts = await hub.providers.listAccounts();
      const currentAccount = accounts.find((a) => a.id === session.profileId);
      const alternateAccount =
        accounts.find((a) => a.status === 'connected' && a.id !== session.profileId && a.provider !== currentAccount?.provider) ??
        accounts.find((a) => a.status === 'connected' && a.id !== session.profileId) ??
        currentAccount;

      const folder = workspaceDirForSession(hub, sessionId);
      const reviewSession = hub.sessions.create({
        profileId: alternateAccount?.id ?? session.profileId,
        modelId: alternateAccount?.models[0]?.id ?? session.modelId,
        effort: session.effort,
        projectName: session.projectName,
        projectPath: session.projectPath || folder,
        taskSlug: `auditoria-${Date.now().toString(36)}`,
        protocolRole: 'revisor'
      });
      hub.sessions.setActive(reviewSession.id);
      hub.chat.publishSessions();

      const auditPrompt =
        `[SEGUNDA OPINIÓN CRUZADA - AUDITORÍA IMPARCIAL]\n\n` +
        `Audita críticamente la siguiente solución técnica propuesta por ${msg.modelName}:\n\n` +
        `---\n${msg.content}\n---\n\n` +
        `Por favor realiza una revisión técnica exhaustiva:\n` +
        `1. Exactitud y corrección técnica (¿resuelve el problema sin efectos secundarios?).\n` +
        `2. Bugs potenciales, edge cases no contemplados o riesgos de seguridad.\n` +
        `3. Rendimiento, legibilidad y estándares de código limpio.\n` +
        `4. Sugerencias concretas o código alternativo mejorado.`;

      void hub.chat.send({
        sessionId: reviewSession.id,
        prompt: auditPrompt,
        role: 'revisor',
        workspaceDir: folder
      });
    },

    forkSession: ({ sessionId, messageId }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;
      const msgIdx = session.messages.findIndex((m) => m.id === messageId);
      if (msgIdx === -1) return;

      const folder = workspaceDirForSession(hub, sessionId);
      const forkedMessages = session.messages.slice(0, msgIdx + 1).map((m) => ({
        ...m,
        id: `msg-fork-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      }));

      const forked = hub.sessions.create({
        profileId: session.profileId,
        modelId: session.modelId,
        effort: session.effort,
        projectName: session.projectName,
        projectPath: session.projectPath || folder,
        taskSlug: `${session.taskSlug ?? 'fork'}-bifurcacion`,
        protocolRole: session.protocolRole,
        squad: session.squad
      });

      hub.sessions.update(forked.id, {
        title: `${session.title || 'Conversación'} (Bifurcación)`,
        messages: forkedMessages
      });
      hub.sessions.setActive(forked.id);
      hub.chat.publishSessions();
      hub.chat.addNote(forked.id, `🌿 Conversación bifurcada desde el mensaje #${msgIdx + 1}. Explora este camino libremente.`);
    },

    generateCommit: async ({ sessionId }) => {
      const folder = workspaceDirForSession(hub, sessionId);
      const commitPrompt =
        'Inspecciona los cambios actuales con `git diff --cached` (o `git diff` si no hay cambios en staging). ' +
        'Redacta un mensaje de commit siguiendo la convención Conventional Commits: ' +
        '`<tipo>(<ámbito opcional>): <descripción concisa en imperativo>`. ' +
        'Si los cambios son complejos, añade una línea en blanco y viñetas detallando qué y por qué cambió. ' +
        'Devuelve únicamente el bloque de mensaje de commit listo para usar.';

      await hub.chat.send({
        sessionId,
        prompt: commitPrompt,
        workspaceDir: folder
      });
    },

    auditBranch: async ({ sessionId }) => {
      const folder = workspaceDirForSession(hub, sessionId);
      const branchAuditPrompt =
        'Compara la rama actual contra la rama principal ejecutando `git diff main...HEAD` (o `git diff master...HEAD` si no existe main). ' +
        'Realiza una auditoría integral de la rama completa:\n' +
        '1. Resumen conciso de todas las modificaciones introducidas.\n' +
        '2. Verificación de seguridad y detección de posibles vulnerabilidades.\n' +
        '3. Riesgo de regresiones o breaking changes.\n' +
        '4. Estado de cobertura de pruebas unitarias/integración de los nuevos cambios.\n' +
        '5. Veredicto final: ¿Listo para mergear a producción?';

      await hub.chat.send({
        sessionId,
        prompt: branchAuditPrompt,
        role: 'revisor',
        workspaceDir: folder
      });
    },

    prewarmSession: ({ sessionId }) => hub.chat.prewarm(sessionId, workspaceDirForSession(hub, sessionId))
  };
}

export function workspaceDirForSession(hub: HubContext, sessionId: string): string {
  return hub.sessions.get(sessionId)?.projectPath ?? workspaceDir() ?? process.cwd();
}
