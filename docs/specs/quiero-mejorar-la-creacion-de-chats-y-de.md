# Spec: chats y agentes organizados por flujo

Fecha: 2026-11-15 · Pipeline autónomo, sin aprobación previa · Repo: `portafolio/agent-hub`

## 1. Requerimiento

> "Quiero mejorar la creación de chats y de agentes, que se organicen mejor por flujo. O que no se vea tanto como un montón de roles con números, algo más específico."

La captura es el menú "Marca los chats que quieres ver juntos" (`SplitWorkspace.tsx:245`). Muestra una lista plana: `tester-1`, `arquitecto-1`, `desarrollador-1`, `revisor-1`, `documentador-1`, `desarrollador-1`, `revisor-1`, `coordinador-1`, `explorador-1`, y al final un chat con título real. Los proyectos "AgentHub" y "agent-hub" repiten los mismos nombres. No se sabe qué agente es de qué flujo ni de qué trata.

## 2. Causa (verificada en el código)

| Hecho | Evidencia |
|---|---|
| Al crear un flujo, cada sesión recibe `taskSlug = "<rol>-1"` y `title = taskSlug` | `session-handlers.ts:255` (`startPipeline`), `session-store.ts:121` (`title: options.taskSlug ?? DEFAULT_TITLE`) |
| `spawnAgents` hace lo mismo con contador por rol (`desarrollador-2`) | `session-handlers.ts:123-128` |
| El flujo ya existe como dato: todas las sesiones del equipo comparten `squad` (`pipeline-<timestamp>` / `squad-<timestamp>`), pero es un id sin nombre humano y la interfaz no lo usa | `types.ts:239`, `session-handlers.ts:~248` |
| `taskSlug` además es la **dirección** del `>> nombre: mensaje` y de los traspasos. El enrutado sólo busca entre los compañeros del mismo `squad`, así que `tester-1` puede repetirse entre equipos sin chocar | `agent-name.ts:5`, `chat-service.ts:741-745` |
| El menú de chats ordena sólo por "está corriendo" y pinta `s.title` + proyecto | `SplitWorkspace.tsx:143,252-262` |
| El panel de agentes y el cajón de historial muestran `agentName(session)` / `#taskSlug` | `AgentsView.tsx:146,184`, `SessionDrawer.tsx:594-596` |

Consecuencia de diseño: **el nombre de dirección (`taskSlug`) no se toca**; lo que cambia es lo que la persona ve y cómo se agrupa.

## 3. Diseño

### 3.1 Modelo de datos

Un campo nuevo en `ConversationSession` (`src/shared/types.ts`), opcional y sin migración:

```ts
/** Nombre legible del flujo; lo comparten los agentes de un mismo `squad`. */
squadName?: string;
```

- Se guarda en `session-store.ts` (`NewSessionOptions` y `create`), junto a `squad`.
- Una sesión sin `squadName` (todas las existentes) se ve exactamente como hoy. No hay migración ni reescritura de datos.
- `taskSlug`, `squad`, `protocolRole` y `handoffTo` no cambian de significado.

### 3.2 Módulo puro nuevo: `src/shared/flows.ts`

Todo lo que se pueda probar sin interfaz va aquí (una sola pieza, sin dependencias):

| Función | Qué hace |
|---|---|
| `flowNameFrom(prompt, fallback)` | Nombre corto del flujo a partir del requerimiento: quita `#123`, el prefijo de cortesía ("Quiero", "Necesito", "Por favor"…), toma la primera frase, la corta a ≤ 40 caracteres en un límite de palabra, con la primera letra en mayúscula. Vacío → `fallback`. |
| `agentLabel(session, mates)` | Nombre visible del agente: la etiqueta del rol (`PROTOCOL_ROLES[rol].label`), con número **sólo si el mismo rol se repite en el equipo** (`Desarrollador 2`). Sin rol: `Agente`. Sin `squad`: devuelve `session.title`. |
| `sessionTitle(role, flowName)` | `"<Rol> · <Flujo>"`, por ejemplo `Arquitecto · Chats por flujo`. Es el `title` con el que se crean las sesiones de un equipo. |
| `groupByFlow(sessions, runningIds)` | Devuelve `{ flows: [{ squad, name, project, members }], loose: [...] }`. Los miembros van en el orden del rol de la plantilla (`TEAM_TEMPLATES`) y, si no se conoce, en el de creación. Los flujos se ordenan: con algún miembro corriendo primero, luego por `updatedAt` más reciente. `loose` son las sesiones sin `squad`. |

### 3.3 Dónde se pone el nombre

- `startPipeline` (`session-handlers.ts`): `squadName = flowNameFrom(prompt, template.label)`; cada sesión se crea con `title = sessionTitle(rol, squadName)` y sigue con `taskSlug = "<rol>-1"`.
- `spawnAgents` (`session-handlers.ts`): acepta `flowName?: string` (opcional en el mensaje IPC `spawnAgents`, `ipc.ts`). `squadName = flowName?.trim() || flowNameFrom(prompt, "Equipo de <proyecto>")`. Mismo `title` por sesión.
- `createSession` (chat suelto): no cambia.
- Un agente sin rol de un equipo: `title = "Agente · <flujo>"`.
- El título automático del primer mensaje (`session-store.ts:160`) sólo reescribe títulos por defecto, así que no pisa el de un equipo.

### 3.4 Dónde se ve

1. **Menú "Marca los chats que quieres ver juntos"** (`SplitWorkspace.tsx`): por cada flujo, una cabecera `● <Flujo> · <proyecto>` (punto activo si alguno corre) y debajo sus agentes con `agentLabel`. La casilla de la cabecera marca o desmarca todos los miembros (respetando `MAX_COLUMNS`). Los chats sueltos van bajo "Chats sueltos". El proyecto sale en la cabecera del flujo, no en cada fila. Agrupa con `groupByFlow`. Se añade `squadName` a la comparación de `sameChat` (`SplitWorkspace.tsx:93`) o el menú no se refresca al cambiar el nombre.
2. **Panel de coordinación** (`AgentsView.tsx`): las tarjetas se agrupan bajo el nombre del flujo y muestran `agentLabel` en vez de `agentName`.
3. **Historial** (`SessionDrawer.tsx`): dentro de cada proyecto, los agentes de un mismo flujo van bajo un encabezado de flujo; la etiqueta `#tester-1` se reemplaza por la etiqueta del rol para sesiones de equipo.
4. **Formulario "Crear agentes en paralelo"** (`AgentsView.tsx`, `SpawnForm`): un campo "Nombre del flujo" opcional (placeholder: la propuesta de `flowNameFrom`).
5. **Avisos** (`chat-service.ts:621`): "Tester · Chats por flujo terminó" en vez de "tester-1 terminó".

### 3.5 Lo que no cambia

- Dirección de agentes y traspasos (`>> tester-1: …`), `agentName()`, los prompts que se les pasan y `teammates()`/`routeAgentMessages()`: siguen con `taskSlug`.
- Informe de equipo y resumen de costos (`team-report.ts`, `cost-summary.ts`): siguen con `agentName`.
- Nombre de la rama aislada (`agent-hub/<squad>`) y la carpeta del worktree.
- Plantillas de equipo, roles y modelos recomendados.

### 3.6 Endpoints / IPC

No hay endpoints nuevos. Cambia un mensaje:

| Mensaje | Cambio |
|---|---|
| `spawnAgents` (`ipc.ts`) | `+ flowName?: string` |
| `startPipeline` | sin cambio de forma: el nombre sale del requerimiento |

## 4. Criterios de aceptación (Given / When / Then)

**CA1. El nombre del flujo sale del requerimiento.**
- Given el requerimiento "Quiero mejorar la creación de chats y de agentes, que se organicen mejor por flujo".
- When se llama `flowNameFrom(texto, "Feature completa")`.
- Then devuelve una cadena de ≤ 40 caracteres, sin el "Quiero", en un límite de palabra, que empieza en mayúscula ("Mejorar la creación de chats y de…" o equivalente). Con `""` o sólo espacios devuelve `"Feature completa"`. Con `#123 corrige login` no contiene `#123`.

**CA2. Un pipeline nuevo crea agentes con nombre legible.**
- Given el requerimiento anterior y la plantilla `feature`.
- When se ejecuta `startPipeline`.
- Then las cinco sesiones comparten `squad` y el mismo `squadName`; sus `title` son `Arquitecto · <flujo>`, `Tester · <flujo>`, … y ninguno es `rol-N`.

**CA3. La dirección de los agentes no se rompe.**
- Given el pipeline de CA2.
- When el arquitecto escribe `>> tester-1: Hecho: …`.
- Then el mensaje llega al tester (el `taskSlug` sigue siendo `tester-1`) y `agentName(session)` sigue devolviendo `tester-1`.

**CA4. Un mismo nombre en dos flujos no choca.**
- Given dos pipelines en el mismo proyecto, cada uno con `tester-1`.
- When el arquitecto del primero escribe `>> tester-1: …`.
- Then sólo lo recibe el tester de su propio `squad`, y en el menú los dos aparecen bajo flujos distintos con su nombre.

**CA5. La etiqueta sólo lleva número si hay repetidos.**
- Given un equipo con un `desarrollador` y un `revisor`.
- When se calcula `agentLabel` de cada uno.
- Then es `Desarrollador` y `Revisor` (sin número).
- Given `spawnAgents` con dos `desarrollador`.
- Then son `Desarrollador 1` y `Desarrollador 2`, en orden de creación.

**CA6. El menú de chats agrupa por flujo.**
- Given dos flujos (cinco y cuatro agentes), otro con un agente en ejecución, y tres chats sueltos.
- When se abre "Marca los chats que quieres ver juntos".
- Then aparecen cabeceras de flujo con sus miembros debajo, en el orden del flujo; el flujo con un agente corriendo va primero; los sueltos van bajo "Chats sueltos"; el proyecto se muestra en la cabecera y no se repite en cada fila.

**CA7. La casilla de la cabecera marca todo el flujo.**
- Given un flujo de cinco agentes y `MAX_COLUMNS` mayor o igual a 5.
- When se marca la casilla de su cabecera.
- Then los cinco quedan marcados; al desmarcarla, ninguno. Si el flujo tiene más miembros que columnas libres, se marcan sólo los que caben y se muestra "Máximo N columnas".

**CA8. Las sesiones anteriores se ven igual.**
- Given sesiones guardadas sin `squadName` (ya existentes).
- When se abren el menú, el panel y el historial.
- Then no se cae nada: las que tienen `squad` se agrupan bajo un nombre por defecto (`Equipo <hora de creación>` o `Equipo de <proyecto>`) con `agentLabel`, y las que no, siguen como chats sueltos con su `title`.

**CA9. El formulario de agentes en paralelo acepta nombre.**
- Given el formulario con el nombre "Migración de login" y roles `desarrollador`, `tester`.
- When se envía.
- Then las dos sesiones tienen `squadName = "Migración de login"` y títulos `Desarrollador · Migración de login` y `Tester · Migración de login`. Sin nombre y con un mensaje inicial, el nombre sale de `flowNameFrom`; sin ambos, `Equipo de <proyecto>`.

**CA10. El título del equipo no lo pisa el primer mensaje.**
- Given una sesión de equipo con `title = "Tester · Mi flujo"`.
- When llega su primer mensaje de usuario.
- Then el `title` no cambia.

**CA11. Los avisos usan el nombre legible.**
- Given un agente de un flujo con nombre.
- When termina su turno.
- Then el aviso dice `"<Rol> · <Flujo> terminó"`, no `"tester-1 terminó"`.

## 5. Verificación que debe construir el tester

Las pruebas viven en `tests/agent-hub.test.ts` (`node:test`, `npm test`), con el estilo del archivo.

- **Puras (CA1, CA5, CA6 en su parte de orden, CA8):** `flowNameFrom`, `agentLabel`, `sessionTitle`, `groupByFlow` sobre sesiones construidas a mano. Fallan hoy porque `src/shared/flows.ts` no existe.
- **Almacén (CA2 en su parte de datos, CA10):** `SessionStore.create({ squad, squadName, taskSlug, title… })` y `appendMessage`.
- **Enrutado (CA3, CA4):** reutilizar la prueba existente de `>> nombre` entre agentes (buscar `routeAgentMessages` / `AGENT_MESSAGE` en el archivo de pruebas). Si no hay, crear dos `squad` con un `tester-1` cada uno y comprobar quién recibe el mensaje.
- **Handlers (CA2, CA9):** si el contexto de `startPipeline` / `spawnAgents` se puede armar con los dobles que ya usa el archivo, probarlos; si no, se declara y se cubren sólo las funciones puras.
- **Interfaz (CA6, CA7, CA11):** no hay pruebas de componentes en el repo. Se verifican a mano o con Playwright MCP sobre la build (`npm run build`), con una captura del menú antes y después; el tester lo declara como verificación manual si no la automatiza.
- **Fallo inicial esperado:** CA1, CA2, CA5, CA9 y CA10 fallan hoy; CA3, CA4 y CA8 (comportamiento actual) pasan hoy y deben seguir pasando.

## 6. Tareas atómicas

1. **T1 (tester):** pruebas de la sección 5 en rojo.
2. **T2 (desarrollador):** `squadName` en `types.ts` y `session-store.ts`; `src/shared/flows.ts` con sus cuatro funciones (CA1, CA5, CA8, CA10).
3. **T3 (desarrollador):** `startPipeline` y `spawnAgents` ponen `squadName` y `title`; `flowName` en `ipc.ts` y en `SpawnForm` (CA2, CA9).
4. **T4 (desarrollador):** menú de `SplitWorkspace` agrupado, con casilla de cabecera y `sameChat` (CA6, CA7).
5. **T5 (desarrollador):** `AgentsView` y `SessionDrawer` agrupados y con la etiqueta de rol (CA8).
6. **T6 (desarrollador):** avisos con nombre legible, `chat-service.ts:621` (CA11).
7. **T7 (revisor):** que `taskSlug`/`agentName` y el enrutado no se hayan tocado (CA3, CA4); que `npm test` y `npm run build` pasen.
8. **T8 (documentador):** una línea en el README sobre el nombre del flujo y el campo del formulario.

Después de modificar el código, correr `graphify update .` (regla del proyecto).

## 7. Riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Se cambia `taskSlug` o `agentName` para "arreglar" el nombre | Se rompen los traspasos `>>` y los prompts de los compañeros | Es regla de diseño (3.5); CA3 y CA4 la protegen; el revisor la comprueba |
| `flowNameFrom` produce nombres feos con requerimientos largos o con código/URL | Cabeceras ilegibles | Corte en palabra a 40 caracteres, sin `#123`; el nombre se puede escribir a mano en el formulario |
| Dos flujos con el mismo nombre (mismo requerimiento) | Cabeceras iguales | Se distinguen por proyecto y por la hora de creación junto a la cabecera si el nombre se repite |
| `sameChat` no incluye `squadName` | El menú queda con el nombre viejo | Se añade a la comparación (T4) |
| Menú con muchos flujos (decenas) | Lista larga | Se ordena con los activos primero; se muestran los 6 más recientes y "Ver todos" queda como mejora si hace falta, no ahora |
| `groupByFlow` oculta a sesiones con `squad` ya borrado a medias | Una sesión con `squad` y sin compañeros se ve como flujo de un agente | Un flujo de un solo miembro se muestra como chat suelto |
| El proyecto "AgentHub" y "agent-hub" (dos nombres para el mismo repo) siguen separados | Parece duplicado | Fuera de alcance: es de `projectName`, no del flujo. Queda anotado |

## 8. Fuera de alcance

- Renombrar o fusionar proyectos (`projectName`).
- Cambiar roles, plantillas, modelos o prompts de los agentes.
- Renombrar flujos ya creados (se ven con un nombre por defecto, CA8). Un "renombrar flujo" se puede añadir luego sobre `squadName`.
- Mover agentes entre flujos.
- Pruebas automáticas de la interfaz (no existen en el repo).
