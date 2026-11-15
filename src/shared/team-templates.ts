import { ProtocolRole } from './types';

export interface TeamTemplate {
  id: string;
  label: string;
  description: string;
  /** Orden de trabajo; el primero recibe el requerimiento. */
  roles: ProtocolRole[];
  /** Traspasos que reemplazan el `handoffTo` del rol dentro de este equipo (p. ej. en paralelo). */
  handoffs?: Partial<Record<ProtocolRole, ProtocolRole[]>>;
}

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'odd',
    label: 'ODD (Organic Driven Development)',
    description: 'Explorador (investiga sin tokens) → Coordinador (clasifica/resuelve) → Desarrollador → Revisor (RDD)',
    roles: ['explorador', 'coordinador', 'desarrollador', 'revisor'],
    handoffs: {
      explorador: ['coordinador'],
      coordinador: ['desarrollador'],
      desarrollador: ['revisor'],
      revisor: []
    }
  },
  {
    id: 'feature',
    label: 'Feature completa (SDD / Cascada)',
    description: 'Arquitecto → Tester → Desarrollador → Revisor → Documentador',
    roles: ['arquitecto', 'tester', 'desarrollador', 'revisor', 'documentador']
  },
  {
    id: 'paralelo',
    label: 'Feature con revisión y docs en paralelo',
    description: 'Arquitecto → Tester → Desarrollador → (Revisor + Documentador a la vez)',
    roles: ['arquitecto', 'tester', 'desarrollador', 'revisor', 'documentador'],
    handoffs: { desarrollador: ['revisor', 'documentador'], revisor: [] }
  },
  {
    id: 'bug',
    label: 'Bug (Depurador)',
    description: 'Depurador → Desarrollador → Revisor',
    roles: ['depurador', 'desarrollador', 'revisor']
  },
  {
    id: 'edd',
    label: 'EDD (Evidence-Driven Development)',
    description: 'Depurador (reproduce con prueba) → Desarrollador (corrige) → Tester (valida evidencia)',
    roles: ['depurador', 'desarrollador', 'tester'],
    handoffs: { depurador: ['desarrollador'], desarrollador: ['tester'], tester: [] }
  },
  {
    id: 'revision',
    label: 'Revisión / Auditoría',
    description: 'Explorador → Revisor',
    roles: ['explorador', 'revisor']
  }
];

export const DEFAULT_TEMPLATE = TEAM_TEMPLATES.find((t) => t.id === 'feature') ?? TEAM_TEMPLATES[0];

export function templateById(id: string | undefined): TeamTemplate {
  return TEAM_TEMPLATES.find((template) => template.id === id) ?? DEFAULT_TEMPLATE;
}
