import { agentName } from './agent-name';
import { ConversationSession, CostSummary } from './types';

const DEFAULT_DAYS = 14;

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Gasto por día (últimos `maxDays` con gasto) y por agente, a partir del costo de cada mensaje. */
export function summarizeCosts(sessions: ConversationSession[], maxDays = DEFAULT_DAYS): CostSummary {
  const days = new Map<string, number>();
  const agents = new Map<string, { costUSD: number; durationMs: number }>();
  for (const session of sessions) {
    for (const message of session.messages) {
      if (!message.costUSD && !message.durationMs) continue;
      const name = agentName(session);
      const total = agents.get(name) ?? { costUSD: 0, durationMs: 0 };
      total.costUSD += message.costUSD ?? 0;
      total.durationMs += message.durationMs ?? 0;
      agents.set(name, total);
      if (!message.costUSD) continue;
      const day = dayKey(message.timestamp);
      days.set(day, (days.get(day) ?? 0) + message.costUSD);
    }
  }
  return {
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).slice(-maxDays).map(([day, costUSD]) => ({ day, costUSD })),
    agents: [...agents]
      .map(([name, total]) => ({ name, costUSD: total.costUSD, ...(total.durationMs > 0 && { durationMs: total.durationMs }) }))
      .sort((a, b) => b.costUSD - a.costUSD)
  };
}
