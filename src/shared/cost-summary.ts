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
  const agents = new Map<string, number>();
  for (const session of sessions) {
    for (const message of session.messages) {
      if (!message.costUSD) continue;
      const day = dayKey(message.timestamp);
      days.set(day, (days.get(day) ?? 0) + message.costUSD);
      const name = agentName(session);
      agents.set(name, (agents.get(name) ?? 0) + message.costUSD);
    }
  }
  return {
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).slice(-maxDays).map(([day, costUSD]) => ({ day, costUSD })),
    agents: [...agents].map(([name, costUSD]) => ({ name, costUSD })).sort((a, b) => b.costUSD - a.costUSD)
  };
}
