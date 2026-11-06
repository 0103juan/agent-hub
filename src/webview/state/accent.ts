export const ACCENTS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];
export const ACCENT_EVENT = 'agent-hub-accent';

const keyOf = (projectName?: string) => `agent-hub.accent.${projectName || 'General'}`;

export const getAccent = (projectName?: string): string | undefined => localStorage.getItem(keyOf(projectName)) ?? undefined;

export function setAccent(projectName: string | undefined, color: string): void {
  localStorage.setItem(keyOf(projectName), color);
  window.dispatchEvent(new Event(ACCENT_EVENT));
}
