import { PROTOCOL_ROLES } from './protocol-roles';
import { TEAM_TEMPLATES } from './team-templates';
import { ConversationSession, ProtocolRole } from './types';

const MAX_FLOW_NAME = 40;
const COURTESY = /^(?:(?:quiero|necesito|quisiera|me gustaría|hay que|por favor|porfa)\s+)+/i;

/** Nombre corto del flujo a partir del requerimiento. */
export function flowNameFrom(prompt: string, fallback: string): string {
  let text = prompt.replace(/#\d+/g, ' ').replace(/\s+/g, ' ').trim().replace(COURTESY, '');
  text = text.split(/[.!?]+(?:\s|$)/)[0].trim();
  if (!text) return fallback;
  text = text[0].toUpperCase() + text.slice(1);
  if (text.length <= MAX_FLOW_NAME) return text;
  const head = text.slice(0, MAX_FLOW_NAME - 1);
  const cut = head.lastIndexOf(' ') > 0 ? head.slice(0, head.lastIndexOf(' ')) : head;
  return `${cut.replace(/[\s,;:]+$/, '')}…`;
}

const roleLabel = (role?: ProtocolRole): string => (role && PROTOCOL_ROLES[role]?.label) || 'Agente';

/** Etiqueta del rol; lleva número sólo si el mismo rol se repite en el equipo. */
export function agentLabel(session: ConversationSession, mates: ConversationSession[]): string {
  if (!session.squad) return session.title;
  const label = roleLabel(session.protocolRole);
  const same = mates.filter((mate) => mate.protocolRole === session.protocolRole).sort((a, b) => a.createdAt - b.createdAt);
  return same.length > 1 ? `${label} ${same.findIndex((mate) => mate.id === session.id) + 1}` : label;
}

/** Título con el que se crean las sesiones de un equipo. */
export function sessionTitle(role: ProtocolRole | undefined, flowName: string): string {
  return `${roleLabel(role)} · ${flowName}`;
}

export interface FlowGroup {
  squad: string;
  name: string;
  project?: string;
  /** Inicio del flujo: el primer agente creado. */
  createdAt: number;
  members: ConversationSession[];
}

const folderOf = (dir?: string) => dir?.split(/[\\/]/).filter(Boolean).pop();
/** `sessionTitle` deja el flujo tras « · »; sirve cuando el equipo es anterior a `squadName`. */
const flowFromTitle = (title: string) => (title.includes(' · ') ? title.slice(title.indexOf(' · ') + 3).trim() : undefined);

/** Orden de roles de la plantilla que mejor encaja con el equipo. */
function templateOrder(members: ConversationSession[]): ProtocolRole[] {
  const roles = new Set(members.map((member) => member.protocolRole));
  let best: ProtocolRole[] = [];
  let bestHits = 0;
  for (const { roles: order } of TEAM_TEMPLATES) {
    const hits = order.filter((role) => roles.has(role)).length;
    if (hits > bestHits) [best, bestHits] = [order, hits];
  }
  return best;
}

/** Agrupa las sesiones por flujo (`squad`); lo que no es un flujo de 2 o más agentes queda suelto. */
export function groupByFlow(sessions: ConversationSession[], runningIds: Iterable<string>): { flows: FlowGroup[]; loose: ConversationSession[] } {
  const running = new Set(runningIds);
  const bySquad = new Map<string, ConversationSession[]>();
  const loose: ConversationSession[] = [];
  for (const session of sessions) {
    if (!session.squad) loose.push(session);
    else bySquad.set(session.squad, [...(bySquad.get(session.squad) ?? []), session]);
  }
  const ranked: Array<FlowGroup & { active: boolean; updatedAt: number }> = [];
  for (const [squad, found] of bySquad) {
    if (found.length < 2) { loose.push(...found); continue; }
    const order = templateOrder(found);
    const rank = (s: ConversationSession) => { const i = s.protocolRole ? order.indexOf(s.protocolRole) : -1; return i < 0 ? order.length : i; };
    const members = [...found].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt);
    const project = members.find((s) => s.projectName)?.projectName ?? folderOf(members.find((s) => s.projectPath)?.projectPath);
    const createdAt = Math.min(...members.map((s) => s.createdAt));
    const name = members.find((s) => s.squadName)?.squadName
      ?? members.map((s) => flowFromTitle(s.title)).find(Boolean)
      ?? (project ? `Equipo de ${project}` : `Equipo ${new Date(createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`);
    ranked.push({ squad, name, project, createdAt, members, active: members.some((s) => running.has(s.id)), updatedAt: Math.max(...members.map((s) => s.updatedAt)) });
  }
  ranked.sort((a, b) => Number(b.active) - Number(a.active) || b.updatedAt - a.updatedAt);
  return { flows: ranked.map(({ squad, name, project, createdAt, members }) => ({ squad, name, project, createdAt, members })), loose };
}
