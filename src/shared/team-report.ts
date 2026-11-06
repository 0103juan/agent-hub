import { agentName } from './agent-name';
import { ConversationSession } from './types';

const SUMMARY_CHARS = 400;

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

/** Resumen en Markdown de lo que hizo cada agente del equipo, listo para pegar en un PR. */
export function buildTeamReport(members: ConversationSession[]): string {
  const rows: string[] = [];
  const sections: string[] = [];
  let totalCost = 0;
  let totalMs = 0;
  for (const session of members) {
    const replies = session.messages.filter((message) => message.role === 'assistant');
    const cost = replies.reduce((sum, message) => sum + (message.costUSD ?? 0), 0);
    const ms = replies.reduce((sum, message) => sum + (message.durationMs ?? 0), 0);
    const files = [...new Set(replies.flatMap((message) => message.checkpointFiles ?? []))];
    const last = [...replies].reverse().find((message) => message.content)?.content.replace(/\s+/g, ' ').trim();
    const testNote = [...session.messages].reverse().find((message) => message.role === 'system' && message.content.startsWith('Los tests'));
    totalCost += cost;
    totalMs += ms;
    rows.push(`| ${session.protocolRole ?? '-'} | ${agentName(session)} | ${replies.length} | $${cost.toFixed(4)} | ${ms ? formatDuration(ms) : '-'} | ${files.length} |`);
    sections.push(
      [
        `### ${agentName(session)}`,
        last ? `${last.slice(0, SUMMARY_CHARS)}${last.length > SUMMARY_CHARS ? '…' : ''}` : '_Sin respuesta._',
        files.length ? `Archivos: ${files.map((file) => `\`${file}\``).join(', ')}` : '',
        testNote ? `Tests: ${testNote.content}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')
    );
  }
  const branch = members.find((member) => member.isolatedBranch)?.isolatedBranch;
  return [
    '# Informe del equipo',
    branch ? `Rama: \`${branch}\`` : '',
    '| Rol | Agente | Turnos | Costo | Duración | Archivos |\n|---|---|---|---|---|---|\n' + rows.join('\n'),
    `**Total:** $${totalCost.toFixed(4)}${totalMs ? ` · ${formatDuration(totalMs)}` : ''}`,
    ...sections
  ]
    .filter(Boolean)
    .join('\n\n');
}
