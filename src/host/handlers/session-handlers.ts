import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { revertCheckpointFile } from '../git-checkpoint';
import { createSquadWorktree, mainRepoOf, mergeSquadWorktree, removeSquadWorktree } from '../git-worktree';
import { recommendedFor, resolveSelection } from '../../shared/model-selection';
import { searchSessions } from '../../shared/session-search';
import { ProtocolRole } from '../../shared/types';
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
  return { projectPath: worktree?.path ?? base, isolatedBranch: worktree?.branch };
}

export function sessionHandlers(hub: HubContext): HandlerMap<
  | 'createSession' | 'switchSession' | 'deleteSession' | 'moveSession' | 'renameProject' | 'deleteProject' | 'spawnAgents'
  | 'updateSession' | 'sendPrompt' | 'stopTurn' | 'prewarmSession' | 'removeQueued' | 'resumeQueue' | 'startPipeline' | 'failoverSession' | 'exportSession'
  | 'compareModels' | 'revertFile' | 'searchSessions' | 'finishSquad' | 'crossReview' | 'forkSession' | 'generateCommit' | 'auditBranch'
> {
  return {
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
      const { profileId: _profileId, protocolRole, budgetUSD, ...settings } = patch; // `permission` viaja en settings
      hub.sessions.update(sessionId, {
        ...settings,
        ...(protocolRole !== undefined && { protocolRole: protocolRole ?? undefined }),
        ...(budgetUSD !== undefined && { budgetUSD: budgetUSD ?? undefined })
      });

      // Al cambiar de cuenta, el modelo debe ser uno que esa cuenta ofrezca.
      const { model } = resolveSelection(session, await hub.providers.listAccounts());
      if (model && model.id !== session.modelId) hub.sessions.update(sessionId, { modelId: model.id });
      hub.chat.publishSessions();
    },

    sendPrompt: ({ sessionId, prompt, attachments, planFirst }) =>
      hub.chat.send({ sessionId, prompt, attachments, planFirst, workspaceDir: workspaceDirForSession(hub, sessionId) }),

    stopTurn: ({ sessionId }) => hub.chat.cancel(sessionId),

    removeQueued: ({ sessionId, queuedId }) => hub.chat.removeQueued(sessionId, queuedId),

    resumeQueue: ({ sessionId }) => hub.chat.resumeQueue(sessionId),

    failoverSession: async ({ sessionId, targetProvider }) => {
      await hub.chat.failover(sessionId, targetProvider);
    },

    startPipeline: async ({ projectName, prompt, requireApproval, template, isolate }) => {
      const current = hub.sessions.getActive();
      const folder = workspaceDir();
      const name = projectName ?? (folder && path.basename(folder));
      const squad = `pipeline-${Date.now()}`;
      const accounts = await hub.providers.listAccounts();
      const account = accounts.find((a) => a.id === current.profileId) ?? accounts.find((a) => a.status === 'connected');

      const pipelineRoles = templateById(template).roles;
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

    exportSession: async ({ sessionId }) => {
      const session = hub.sessions.get(sessionId);
      if (!session) return;
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
      const defaultName = (session.title || 'conversacion').toLowerCase().replace(/[^a-z0-9_-]+/g, '-') + '.md';
      const targetUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(workspaceDir() || os.homedir(), defaultName)),
        filters: { Markdown: ['md'] }
      });
      if (targetUri) {
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(lines.join('\n'), 'utf8'));
        void vscode.window.showInformationMessage(`Conversación guardada en ${path.basename(targetUri.fsPath)}`);
      }
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
