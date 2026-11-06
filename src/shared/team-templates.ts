import { ProtocolRole } from './types';

export interface TeamTemplate {
  id: string;
  label: string;
  description: string;
  /** Orden de trabajo; el primero recibe el requerimiento. */
  roles: ProtocolRole[];
}

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'feature',
    label: 'Feature completa',
    description: 'Arquitecto → Tester → Desarrollador → Revisor → Documentador',
    roles: ['arquitecto', 'tester', 'desarrollador', 'revisor', 'documentador']
  },
  {
    id: 'bug',
    label: 'Bug',
    description: 'Depurador → Desarrollador → Revisor',
    roles: ['depurador', 'desarrollador', 'revisor']
  },
  {
    id: 'revision',
    label: 'Revisión',
    description: 'Explorador → Revisor',
    roles: ['explorador', 'revisor']
  }
];

export const DEFAULT_TEMPLATE = TEAM_TEMPLATES[0];

export function templateById(id: string | undefined): TeamTemplate {
  return TEAM_TEMPLATES.find((template) => template.id === id) ?? DEFAULT_TEMPLATE;
}
