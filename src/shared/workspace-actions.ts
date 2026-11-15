export const ACTION_GROUPS = ['Ejecutar', 'Git', 'Revisar', 'Pedir al agente'] as const;
export type ActionGroup = (typeof ACTION_GROUPS)[number];

export interface WorkspaceAction {
  id: string;
  label: string;
  description: string;
  group: ActionGroup;
  /** Si existe, la acción es un turno normal del agente con este prompt. */
  agentPrompt?: string;
}

export const WORKSPACE_ACTIONS: WorkspaceAction[] = [
  { id: 'tests', label: 'Tests del proyecto', description: 'verificar.sh, gradle, mvn, npm o pytest', group: 'Ejecutar' },
  { id: 'impacted-tests', label: 'Tests afectados', description: 'Solo los relacionados con el git diff', group: 'Ejecutar' },
  { id: 'dependency-audit', label: 'Auditar dependencias', description: 'Vulnerabilidades conocidas (CVE)', group: 'Ejecutar' },
  { id: 'docker-up', label: 'Docker Compose up', description: 'Levantar contenedores en segundo plano', group: 'Ejecutar' },
  { id: 'flutter-test', label: 'Flutter test', description: 'Suite de pruebas de Flutter', group: 'Ejecutar' },
  { id: 'dev-sandbox', label: 'Sandbox Docker', description: 'Contenedor desechable con el workspace', group: 'Ejecutar' },
  { id: 'local-tunnel', label: 'Túnel localhost', description: 'Publicar un puerto local con localtunnel', group: 'Ejecutar' },

  { id: 'worktree', label: 'Crear worktree', description: 'Rama y carpeta aisladas para una tarea', group: 'Git' },
  { id: 'pull-request', label: 'Abrir pull request', description: 'gh pr create con los datos de los commits', group: 'Git' },
  { id: 'pre-push-hook', label: 'Instalar hook pre-push', description: 'Bloquea pushes con tokens expuestos', group: 'Git' },
  { id: 'semantic-commit', label: 'Commit semántico', description: 'Mensaje Conventional Commits desde git diff --cached o git diff', group: 'Git', agentPrompt: 'Inspecciona los cambios actuales con `git diff --cached` (o `git diff` si no hay cambios en stage). Redacta un mensaje de commit según Conventional Commits (tipo(scope): descripción concisa en imperativo). Si los cambios son extensos, incluye cuerpo explicativo con viñetas.' },
  { id: 'audit-branch', label: 'Auditoría de rama vs main', description: 'Revisión exhaustiva de cambios frente a la rama principal', group: 'Git', agentPrompt: 'Determina la rama base principal (main o master) y ejecuta `git diff main...HEAD` (o `origin/main...HEAD`). Realiza una auditoría exhaustiva: seguridad, regresiones potenciales, deuda técnica, rendimiento y completitud de pruebas unitarias.' },
  { id: 'rollback', label: 'Descartar cambios', description: 'Revierte archivos sin commit, pide confirmación', group: 'Git' },

  { id: 'scan-secrets', label: 'Buscar secretos', description: 'API keys y tokens en el git diff', group: 'Revisar' },
  { id: 'review-sql', label: 'Revisar SQL', description: 'Selección o archivo activo: riesgos y rendimiento', group: 'Revisar' },
  { id: 'detect-n-plus-one', label: 'Consultas N+1', description: 'Bucles con relaciones en el archivo activo', group: 'Revisar' },
  { id: 'audit-accessibility', label: 'Accesibilidad', description: 'Reglas WCAG en el archivo activo', group: 'Revisar' },
  { id: 'audit-env', label: 'Variables de entorno', description: 'Comparar el archivo activo con .env.example', group: 'Revisar' },
  { id: 'sanitize-pii', label: 'Anonimizar el mensaje', description: 'Quita emails, tarjetas, teléfonos y JWT del borrador', group: 'Revisar' },

  { id: 'auto-heal', label: 'Arreglar errores', description: 'Envía al agente los errores del workspace', group: 'Pedir al agente' },
  { id: 'review-diff', label: 'Revisar el diff', description: 'Revisión antes de hacer commit', group: 'Pedir al agente', agentPrompt: 'Ejecuta `git diff HEAD` y revísalo: errores, seguridad y calidad. Responde solo con hallazgos concretos, con archivo y línea.' },
  { id: 'pr-summary', label: 'Resumen de PR', description: 'Descripción a partir del diff real', group: 'Pedir al agente', agentPrompt: 'Lee el git diff y el log de esta rama y escribe la descripción del pull request. Menciona pruebas solo si las ejecutaste.' },
  { id: 'changelog', label: 'Changelog', description: 'A partir del log de git', group: 'Pedir al agente', agentPrompt: 'Lee los últimos 15 commits con git log y redacta un changelog agrupado por tipo de cambio.' },
  { id: 'dead-code', label: 'Código muerto', description: 'Funciones huérfanas y logs residuales', group: 'Pedir al agente', agentPrompt: 'Busca en este repositorio código muerto, logs residuales y TODO sin atender. Lista archivo y línea, sin cambiar nada.' },
  { id: 'licenses', label: 'Licencias', description: 'Compatibilidad de dependencias', group: 'Pedir al agente', agentPrompt: 'Revisa las dependencias reales de este proyecto y sus licencias. Señala las copyleft o incompatibles con uso comercial.' },
  { id: 'c4-diagram', label: 'Diagrama C4', description: 'Arquitectura real del workspace', group: 'Pedir al agente', agentPrompt: 'Analiza este repositorio y genera un diagrama C4 de contenedores en Mermaid basado en lo que encuentres.' },
  { id: 'sequence-diagram', label: 'Diagrama de secuencia', description: 'Flujo principal en Mermaid', group: 'Pedir al agente', agentPrompt: 'Identifica el flujo principal de este repositorio y genera su diagrama de secuencia en Mermaid.' },
  { id: 'openapi', label: 'Especificación OpenAPI', description: 'Desde los controladores reales', group: 'Pedir al agente', agentPrompt: 'Lee los controladores de este proyecto y propón su especificación OpenAPI 3 en YAML.' },
  { id: 'mock-data', label: 'Datos de prueba', description: 'Fixtures desde modelos o del borrador', group: 'Pedir al agente', agentPrompt: 'Genera fixtures de prueba coherentes con los modelos de este proyecto.' },
  { id: 'load-test', label: 'Prueba de carga', description: 'Script Locust para los endpoints reales', group: 'Pedir al agente', agentPrompt: 'Identifica los endpoints de este proyecto y escribe un script de Locust para probarlos.' },
  { id: 'runbook', label: 'Runbook', description: 'Guía de incidentes del proyecto', group: 'Pedir al agente', agentPrompt: 'Revisa la infraestructura de este repositorio y redacta un runbook de incidentes específico para él.' },
  { id: 'explain-repo', label: 'Explicar el repositorio', description: 'Mapa de carpetas, entradas y flujo principal', group: 'Pedir al agente', agentPrompt: 'Recorre este repositorio y explica cómo está organizado: carpetas principales, puntos de entrada, flujo de una petición típica y dependencias clave. Cita archivos reales.' },
  { id: 'todo-scan', label: 'Pendientes (TODO/FIXME)', description: 'Lista y prioriza los comentarios pendientes', group: 'Pedir al agente', agentPrompt: 'Busca TODO, FIXME y HACK en el repositorio. Agrúpalos por archivo, indica cuáles parecen urgentes y cuáles ya no aplican. No cambies nada.' },
  { id: 'test-gaps', label: 'Huecos de pruebas', description: 'Qué lógica importante no tiene prueba', group: 'Pedir al agente', agentPrompt: 'Revisa el código y las pruebas existentes. Lista la lógica con ramas o dinero/seguridad de por medio que no tenga prueba, ordenada por riesgo. Propón el caso mínimo para cada una.' },
  { id: 'security-diff', label: 'Seguridad del diff', description: 'Revisión de seguridad solo de lo que cambió', group: 'Pedir al agente', agentPrompt: 'Ejecuta `git diff HEAD` y revísalo solo desde seguridad: inyección, autorización, secretos, validación de entradas y manejo de datos personales. Responde con hallazgos concretos, archivo y línea.' },
  { id: 'perf-review', label: 'Cuellos de botella', description: 'Dónde se pierde tiempo o memoria', group: 'Pedir al agente', agentPrompt: 'Busca en el código posibles cuellos de botella: consultas N+1, bucles anidados, lecturas repetidas, trabajo síncrono pesado. Indica archivo y línea y cómo medirlo antes de cambiar nada.' },
  { id: 'readme-improve', label: 'Mejorar el README', description: 'Reescribe lo desactualizado según el código', group: 'Pedir al agente', agentPrompt: 'Lee el README y compáralo con el código real. Lista lo que está desactualizado o falta (instalación, uso, variables de entorno) y propón el texto corregido sin inventar comportamiento.' },
  { id: 'commit-split', label: 'Dividir en commits', description: 'Cambios agrupados en commits atómicos', group: 'Pedir al agente', agentPrompt: 'Mira `git status` y `git diff`. Propón cómo dividir los cambios en commits atómicos y con mensaje Conventional Commits, indicando qué archivos van en cada uno. No ejecutes el commit.' },
  { id: 'refactor-plan', label: 'Plan de refactor', description: 'Pasos pequeños y seguros para simplificar', group: 'Pedir al agente', agentPrompt: 'Identifica la parte más difícil de mantener de este repositorio y propón un plan de refactor en pasos pequeños, cada uno verificable con pruebas existentes. No cambies código todavía.' },
  { id: 'onboarding-guide', label: 'Guía de incorporación', description: 'Cómo empezar a trabajar en el proyecto', group: 'Pedir al agente', agentPrompt: 'Escribe una guía de incorporación para alguien nuevo: cómo instalar, ejecutar, probar y desplegar, y qué archivos leer primero. Usa solo comandos que existan en el repositorio.' },
  { id: 'explain-error', label: 'Explicar un error', description: 'Causa raíz de un error pegado en el mensaje', group: 'Pedir al agente', agentPrompt: 'Explica la causa raíz del error que aparece en el contexto adicional: qué lo provoca, dónde mirar en el código y cómo comprobarlo. Si no hay error en el contexto, pídemelo.' }
];

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Busca sin distinguir tildes y exige todas las palabras escritas. */
export function filterActions(query: string, group: ActionGroup | 'all'): WorkspaceAction[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  return WORKSPACE_ACTIONS.filter((action) => {
    const searchable = normalizeText(`${action.label} ${action.description} ${action.group}`);
    return (group === 'all' || action.group === group) && words.every((word) => searchable.includes(word));
  });
}
