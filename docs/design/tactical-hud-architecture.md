# Arquitectura de Diseño: Tactical Command Center (100% Feature-Complete)

## 1. Principio Fundamental de Cero Omisiones
El Command Center no simplifica ni elimina ninguna funcionalidad de AgentHub; al contrario, organiza de forma armónica e interactiva el **100% de las herramientas existentes** del backend y frontend bajo una interfaz táctica Obsidian (`#07090e`, `#0e131f`, acentos ámbar `#f59e0b`, cian `#38bdf8`, esmeralda `#10b981`, índigo `#6366f1` y púrpura `#c084fc`).

---

## 2. Matriz Exhaustiva de Funcionalidades Implementadas

### A. Compositor de Mensajes (Composer)
- **Barra de Contexto Rápido:**
  - `📎 Contexto`: adjunta la selección o archivo activo del editor de código.
  - `📁 Archivos`: selector de archivos del workspace con búsqueda difusa.
  - `± Diff`: adjunta el `git diff` actual para que el agente entienda las modificaciones en curso.
  - `⚠️ Problemas`: adjunta los errores y avisos de compilación/linter activos.
- **Acciones y Flujos del Workspace:**
  - `▶ Test`: ejecución directa de suites de pruebas con informe de fallos.
  - `✨ Commit`: generador de Conventional Commits con IA a partir del diff.
  - `⚙ Flujos (Desplegable)`:
    - Botón para ejecutar el **Pipeline Autónomo TDD** (`Arquitecto -> Tester -> Desarrollador -> Revisor`).
    - Selector de plantillas de equipo (`TEAM_TEMPLATES`: TDD, Full-Stack, Seguridad).
    - Botón para **Auditar rama contra main** (`git diff main...HEAD`).
    - Checkbox de **Copia aparte (Worktree aislado)**.
    - Checkbox de **Aprobar cada traspaso**.
    - Checkbox de **Plan primero (solo lectura inicial)**.
  - `🔧 Acciones`: paleta de acciones del workspace (`ActionPalette`).
- **Capacidades Multimodales y Productividad:**
  - `🎤 Dictado por voz`: grabación de audio en vivo con contador de segundos y adjunto para modelos multimodales.
  - `⏳ Cola de mensajes (Message Queue)`: cola de instrucciones en espera (`#1`, `#2`), previsualización de adjuntos y reanudación automática.
  - `Menciones @agente y @archivo`: ruteo de prompts a agentes específicos del squad o anexado de archivos.
  - `Comandos de barra /`: snippets rápidos (`/resumir`, `/explicar`, `/tests`, `/refactor`, `/loop`, `/goal`).
  - `Conmutador Enter vs Ctrl+Enter`: alternancia para redacción cómoda de prompts multilínea extensos.

### B. Lista de Mensajes (MessageList)
- **Preguntas Interactivas (`QuestionOptions`):** Renderizado de chips y botones de selección rápida (A, B, C) cuando el modelo solicita una decisión al usuario.
- **Bloques de Pensamiento (`Thinking`):** Desplegable con tiempo de deliberación y texto de razonamiento analítico.
- **Diffs de Código (`DiffLines`):** Bloques de diferencias con sintaxis resaltada y botones de aplicar/revertir.
- **Paso a Paso vs Respuesta (`splitTurn`):** Separación visual nítida entre la narración de herramientas y la respuesta final.
- **Visualizador Multimedia:** Reproductores nativos para imágenes, audio (`<audio controls>`) y video (`<video controls>`).
- **Acciones por Mensaje:** Fijar (`Pin`), Copiar (`Copy`), Reintentar (`Failover` a otro proveedor: Claude, Gemini, OpenAI, Ollama), Editar prompt original.
- **Metadatos:** Coste estimado en USD por turno y duración exacta en milisegundos.

### C. Cabecera del Chat y Deck de Sesión (ChatView)
- **Selector de Permisos del Agente:** Dropdown entre modo `Completo` y `Solo lectura`.
- **Deck de Contexto y Presupuesto:** Medidor de consumo de tokens (1M límite para Gemini, desglose de historial vs adjuntos vs sistema) y control de gasto acumulado en USD.
- **Selector de Color de Proyecto (`AccentPicker`):** Identificación cromática por proyecto.
- **Exportación de Conversación:** Descarga en formatos `Markdown (.md)`, `HTML (.html)` y `JSON (.json)`.
- **Índice de Conversación:** Acceso rápido a preguntas del usuario y mensajes fijados con anclaje visual.

### D. Control de Versiones Git y Workspace
- **Detección Verídica de Repositorio:**
  - Si la carpeta **no tiene Git**: muestra el estado **`⚪ Sin Git`** (neutral) con botón **`[+ git init]`** para inicializar el repo. Ya no fuerza erróneamente `main`.
  - Si la carpeta **sí tiene Git**: muestra la rama activa (`⎇ main`) con el badge de archivos modificados (`+2`).
  - Si solo hay 1 rama local, el menú desplegable explica con claridad que no existen más ramas creadas y proporciona el input y botón **`[+ Nueva rama]`**.
- **Aislamiento de CWD por Chat:** Cada columna y chat almacena y ejecuta sus comandos en su directorio raíz independiente (`session.projectPath`).

### E. Vistas Principales del Sistema
1. `✦ HUD Center`: Panorámica táctica con dial holográfico, trazado SVG vivo de convergencia y matriz de estaciones.
2. `💬 Chat & Split`: Multi-columna con soporte de 1 a 4 columnas, filas y cuadrícula 2x2 con broadcast global.
3. `📄 Docs`: Visor unificado Markdown y HTML seguro en sandbox con selector de dispositivos (**Desktop / Tablet 768px / Móvil 390px**) y conmutador `[ Código / Preview ]`.
4. `🧠 Memoria`: Tarjetas de conocimiento adquirido en `.agent-hub/experience.md`.
5. `👥 Agentes`: Pipeline visual secuencial, barras de duración y coste por agente, y gestión de fusiones (Merge / Discard).
6. `👤 Cuentas`: Perfiles de conexión (Antigravity, Gemini CLI, OpenAI), estado de inicio de sesión y cuotas en tiempo real.
7. `🔌 MCPs`: Sincronización y conmutación de servidores Model Context Protocol (filesystem, github, playwright, context7).
8. `📊 Métricas`: Dashboard de telemetría de tokens, latencias (p95) y costes estimados.

### F. Terminal Shell Integrada (v2)
- Multi-pestaña interactiva con selector de shells (`pwsh`, `cmd`, `bash`, `wsl`).
- Alternancia de acoplamiento entre **Dock inferior (Bottom)** y **Dock lateral derecho (Right)**.
- Snippets persistentes en `.agent-hub/terminal-snippets.json`.
- Botón **Corregir con IA (Ask AI)** ante comandos fallidos con código != 0.
- Botón de anexar salida de terminal al chat activo (`attachToChat`).

### G. Sistema de Modales Accesibles y Focus Trapping (WCAG 2.2 AAA)
- **Marco Unificado (`ModalShell`, `InteractiveDiffModal`, `SpotlightBar`):**
  - **Trampa Cíclica de Foco (`trapFocus`):** La navegación con `Tab` hacia adelante salta del último elemento interactivo al primero; `Shift+Tab` hacia atrás salta del primero al último sin fugas al DOM inferior.
  - **Restauración Automática de Foco (`opener?.focus()`):** Al desmontar o cerrar cualquier modal, el foco del cursor retorna de forma instantánea al disparador exacto (`document.activeElement` guardado al abrir).
  - **Cierre Seguro por Teclado y Entorno:** Escucha global de la tecla `Escape` con limpieza en desmontaje y cierre al hacer clic en el backdrop oscurecido (`rgba(0,0,0,0.85)`).
  - **Semántica W3C APG:** Atributos obligatorios `role="dialog"`, `aria-modal="true"`, y `aria-label` descriptivos en todos los modales de la suite.

### H. Mesh MCP y Matriz de Memoria Persistente (v2)
- **Malla de Servidores MCP (Model Context Protocol 2024-11-05):**
  - Protocolo cliente-servidor sobre transportes stdio (JSON-RPC) y SSE con descubrimiento dinámico de servidores (`filesystem`, `github`, `playwright`, `postgres`, `memory-mcp`, `context7`, `jira`, `bigquery`).
  - Monitoreo en vivo de ciclo de vida (`online`, `offline`, latencia p95 ms, recuento de herramientas y llamadas activas).
  - Inspector dinámico de esquemas JSON y validación de parámetros de entrada con aislamiento seguro en workspace.
- **Matriz de Memoria de Experiencia Persistente (Self-Evolution Engine):**
  - Almacenamiento dual estructurado: memoria rápida en `.agent-hub/memory.json` y registro humano en `.agent-hub/experience.md`.
  - Taxonomía categórica (`ARCHITECTURE`, `SECURITY`, `ACCESSIBILITY`, `TESTING`, `UI/UX`) con ponderación de impacto (★1 a ★5).
  - Algoritmo de inyección semántica automática en el Context Window con limitador de presupuesto de tokens (Token Budget Meter) para evitar bloat en el prompt del sistema.

### I. Centro de Mando Táctico y Matriz de Telemetría (v2)
- **Circular Ring Engine (`TacticalHudView.tsx`):**
  - Indicadores radiales matemáticos SVG (`strokeDashoffset = length * (1 - ratio)`) con sincronización en tiempo real de salud del bus, carga de memoria y consumo de tokens.
  - Estados operativos dinámicos (`HEALTHY`, `ALTA CARGA`, `CRITICAL`, `MAINTENANCE`).
- **Live Activity Ticker:**
  - Cinta de actividad continua (marquee 60 FPS) con eventos de squad, marcas de tiempo precisas y saltos directos al chat respectivo.
- **Deck de Roles de Protocolo & Handoffs Seguros:**
  - Pipeline visual de 4 agentes con código cromático canónico (`Arquitecto: violeta`, `Tester: esmeralda`, `Desarrollador: cian`, `Revisor: ámbar`).
  - Stream de mini-terminal shell (`pwsh`) con protección CWD garantizada y código de retorno de comandos.

### J. Compositor Multimodal y Orquestador de Cola Asíncrona (v2)
- **Ingesta Multimodal Táctica (`Composer.tsx`):**
  - Creador dinámico con adjuntos de editor activo (`activeEditorTab`), árbol de git diff (`gitDiffTree`) y diagnósticos de errores (`problemDiagnostics`).
  - Dictado por voz nativo con API Web Speech (`webkitSpeechRecognition`) y fallback resiliente con `MediaRecorder` a 16kHz PCM.
  - Autocompletado de comandos slash (`/goal`, `/plan`, `/audit`, `/test`) y menciones contextuales (`@agent`, `@file`, `@docs`, `@git`).
- **Orquestador de Cola Asíncrona (`Queue Orchestrator`):**
  - Encadenamiento secuencial no bloqueante de sub-instrucciones (`queuedPrompts[]`) durante turnos activos de IA.
  - Control de flujo y priorización manual con botones de pausa/reanudación y purga atómica de cola.
  - Integración de metodologías de escuadrón guiadas (ODD, SDD, EDD, TDD) accesibles vía drawer desplegable.

### K. Motor Táctico de Documentos y Sandbox Multi-Viewport (v2)
- **Pipeline de Exploración y Árbol Virtual (`DocumentsView.tsx`):**
  - Indexación dinámica con `buildTree(files)` ignorando rutas del sistema, compilados (`dist`) y dependencias (`node_modules`).
  - Taxonomía de filtrado segmentada (`all`, `generated` en `.agent-hub/`, `markdown`, `html`, scripts).
  - Cálculo instantáneo de métricas en memoria: palabras, caracteres, líneas y tiempo estimado de lectura a 220 WPM.
- **Editor Dual Split y AST Outline:**
  - Persistencia del modo (`edit`, `split`, `preview`) en almacenamiento local.
  - Barra de herramientas Markdown con inserción AST no destructiva y menú de navegación jerárquico (`outlineOf` regex engine).
  - Máquina de estados contra conflictos de guardado concurrente (`mtime` validation, sobrescritura o recarga limpia de disco).
- **Sandbox HTML Aislado & Multi-Viewport Responsivo:**
  - Aislamiento de prototipos interactivos vía `iframe sandbox="allow-scripts"` sin exposición de credenciales del host ni navegación superior.
  - Selector táctico de vista de dispositivos: **Escritorio** (100% fluido), **Tablet** (768 × 1024 px con bisel táctico `#162035`) y **Móvil** (375 × 667 px con bisel táctico `#162035`).
  - Botón de refresco instantáneo mediante invalidación de key reactiva (`previewKey++`).

### L. Anatomía del Mensaje Táctico, Matriz de Decisión y Time-Travel (v2)
- **Pipeline de Desglose de Turno (`splitTurn` en `MessageList.tsx`):**
  - Desacoplamiento automático entre trazas internas de ejecución (`TurnProcess`: notas intermedias y badges de llamadas a herramientas) y la síntesis authoritative final (`TurnAnswer`).
  - Animación Aurora Wave en el borde durante la fase de razonamiento espectral a 60 FPS (`#06b6d4 -> #14b8a6 -> #a855f7`).
  - Cronómetro de fase en tiempo real (`Pensando` -> `Usando herramienta` -> `Escribiendo`) con conteo de segundos (`M:SS`).
- **Matriz de Decisión Interactiva y Atajos Numéricos 1-5:**
  - Extractor heurístico `extractQuestionOptions` que identifica preguntas de opción múltiple estructuradas en las respuestas.
  - Aceleradores de teclado `1-5`: selección y aprobación inmediata con un solo golpe de tecla sin desplazamiento de ratón.
  - Indicador `(Recomendado)` con resplandor esmeralda de alto contraste (`#10b981/15` + borde) y opción de respuesta personalizada ("Otra opción").
- **Motor de Time-Travel Branching y Auditoría Imparcial:**
  - `GitFork`: Bifurcación instantánea de la conversación creando una rama git independiente (`postToHost({ command: 'forkSession' })`).
  - `RestoreStage`: Reversión del espacio de trabajo al commit del hito con diálogo de confirmación en línea.
  - `CrossReview` ("Segunda opinión"): Despacho ciego a un modelo competidor conectado para validación técnica imparcial.

### M. Motor Táctico de Diff Interactivo, Inspector de Código y Parches (v2)
- **Inspección de Hunks y Métricas Git (`InteractiveDiffModal.tsx`):**
  - Desglose delta con contadores vivos de líneas añadidas (`+{added}`) en esmeralda y removidas (`−{removed}`) en rosa.
  - Normalización de encabezados de hunk `@@ -l,s +l,s @@` e ingesta contextual de código sin fugas fuera del workspace CWD asignado.
  - Alternador de modos con persistencia: **Split** (dos columnas sincronizadas) y **Unified** (flujo raw de parche git).
- **Sincronización Doble Columna y Búsqueda en Código:**
  - Columna izquierda: `ORIGINAL (HEAD)` con indicador de línea rosa y encabezado sticky.
  - Columna derecha: `ACTUAL (MODIFICADO)` con indicador de línea esmeralda y encabezado sticky.
  - Búsqueda en tiempo real con motor de pasos bidireccional (`matches[]`) y auto-centrado de línea con `scrollIntoView({ block: 'center' })`.
  - Cuadro de salto directo numérico a línea (`Ir a línea: N`).
- **Exportador de Parches y Revert FSM:**
  - Descarga inmediata de archivo `.diff` estándar (`downloadText(`${file}.diff`, rawDiff)`).
  - Máquina de estados para reversión segura: confirmación en 2 pasos (`¿Descartar cambios? [Sí, revertir] [Cancelar]`) que previene pérdida accidental de código.
  - Accesibilidad W3C APG: Trampa de foco cíclica con `Tab`/`Shift+Tab` y restauración automática a `opener?.focus()` al desmontar.

### N. Auditor Táctico de Seguridad, Blindaje de Secretos y Ramas Git (v2)
- **Escáner Multi-Dominio de Seguridad (`SecurityAuditorModal.tsx`):**
  - Detección de secretos y tokens en código fuente (`secretIssues`: regex, entropía, línea y snippet interactivo).
  - Verificación de variables de entorno no documentadas (`undocumentedEnvVars`) ausentes en `.env.example`.
  - Detección preventiva de sentencias SQL destructivas (`sqlIssues`: DDL, DROP TABLE, DELETE sin WHERE).
- **Remediación 1-Clic con Agente e Informes Markdown:**
  - Compilación automática con `buildReport()` formateando hallazgos para consumo del LLM.
  - Despacho directo con botón [Corregir con Agente] que activa la sesión activa con instrucciones de mitigación.
  - Inspección instantánea en visor de código al hacer clic en cualquier hallazgo (`onPreviewFile`).
- **Gestor de Ramas Git y Worktrees de Escuadrón (`BranchManagerModal.tsx`):**
  - Rama activa con indicador de estado esmeralda pulsante.
  - Creación sanitizada (`cleanName`) que rechaza caracteres prohibidos de git ref (`~^:?*[\\]`) y nombres duplicados.
  - Soporte de ramas aisladas de agentes/escuadrones (`squadBranches[]`) para concurrencia multi-modelo sin colisiones.
  - FSM de eliminación segura con confirmación interactiva en dos pasos.

### O. Borrador Táctico, Persistencia Markdown y Despacho Contextual (`ScratchpadDrawer.tsx`)
- **Persistencia Reactiva & Debounce:**
  - Persistencia automática en el archivo local `.agent-hub/scratchpad.md` dentro del workspace del usuario.
  - Temporizador debounce no intrusivo de 1500 ms con indicador visual de estado (`Pendiente...` / `Guardado`).
  - Integración directa con el visor de documentos mediante `agenthub:open-document` para edición expandida.
- **Inyección Contextual & Atajos Tácticos:**
  - Atajo `Ctrl+Enter` para empaquetar el borrador con el prefijo `[CONTEXTO DEL SCRATCHPAD DE TRABAJO]` y despacharlo directamente al compositor del agente activo, cerrando el drawer automáticamente.
  - Forzado de guardado síncrono con `Ctrl+S`, indentación suave con `Tab` (2 espacios preservando selección) y salida segura con `Escape`.
- **Formateo de Tareas & FSM Destructivo:**
  - Inserción en 1-clic de sintaxis GFM `- [ ] ` con salto de línea inteligente.
  - Máquina de estados en dos pasos para el vaciado del borrador (`¿Vaciar? Sí / X`), impidiendo la pérdida accidental de notas.
  - Telemetría en vivo de palabras y caracteres en el pie del drawer.

### P. Selector Táctico de Espacios de Trabajo y Árbol Multi-Raíz (`WorkspacePicker.tsx`)
- **Exploración Jerárquica & Filtro Git:**
  - Pipeline IPC con `listDirs` y navegación mediante migas de pan (breadcrumbs) con botón de ascenso un nivel (`atRoot`).
  - Detección automática de repositorios con metadata `isGit: boolean` y filtro toggle `reposOnly` para aislar proyectos bajo control de versiones.
  - Búsqueda en vivo normalizada mediante `normalizeText()` insensible a mayúsculas y acentos diacríticos.
- **Favoritos & Proyectos Recientes:**
  - Persistencia permanente en `localStorage` bajo la clave `agent-hub.favoriteDirs` con selector interactivo de estrellas.
  - Listado de proyectos recientes con resaltado de la ruta activa (`isCurrent`) con borde cian y checkmark esmeralda.
- **Acciones Rápidas & Confinamiento CWD:**
  - Despacho inmediato para abrir en el Explorador de Windows, lanzar Visual Studio Code (`openInVsCode`) o copiar ruta al portapapeles.
  - Apertura del selector nativo del sistema operativo mediante `chooseWorkspaceDir`.
  - Soporte de ámbito global (`setWorkspaceDir`) o por sesión individual (`setSessionDir`), preservando las protecciones de confinamiento anti-System32.

### Q. Matriz de Roles del Protocolo y Motor de Esfuerzo de Razonamiento (`ProtocolRoleSelector.tsx`, `EffortSelector.tsx`)
- **Taxonomía Canónica de 10 Roles:**
  - Explorador (readOnly), Arquitecto, Tester, Desarrollador, Revisor (readOnly), Externo, Documentador, Diseñador, Coordinador y Depurador.
  - Metadata contextual en tooltip reactivo: modelo recomendado, nivel CoT sugerido, permisos de escritura en disco y destino de traspaso (`handoffTo`).
  - Modalidades compacta (para barras de herramientas) y expandida (con tooltip enriquecido y tags visuales del protocolo).
- **Escala de Esfuerzo de Pensamiento (CoT):**
  - Selector con indicador de tacómetro HUD de 5 niveles: `low` (Bajo), `medium` (Medio), `high` (Alto), `xhigh` (Xalto) y `max` (Máximo).
  - Filtrado dinámico por capacidades del modelo activo (`supportedEfforts`) deshabilitando opciones inválidas para prevenir errores de llamada API.
  - Ayudas descriptivas en hover y feedback de latencia estimada.

### R. Catálogo Multi-Proveedor y Blindaje de Cuota con Failover Automático (`ModelCatalogModal.tsx`, `QuotaNotice.tsx`, `ModelAccountBar.tsx`)
- **Catálogo Unificado Multi-Proveedor:**
  - Agregación reactiva de cuentas activas de Claude CLI, Antigravity (Google), Copilot y Ollama.
  - Clasificación taxonómica en familias: `argon`, `flash`, `opus`, `sonnet`, `haiku` y `other` con iconografía diferenciada.
  - Fijado permanente de favoritos en `localStorage` (`agent-hub.favoriteModels`) con ordenamiento prioritario y búsqueda normalizada `normalizeText()`.
- **Blindaje de Cuota al 90% & Failover en 1-Clic:**
  - Monitor dual de utilización: ventana móvil de 5 horas (`fiveHourUtilization`) y cuota semanal acumulada (`weeklyUtilization`).
  - Umbral estricto de saturación en 90% (`SATURATED_PERCENT = 90`) con banner de alerta visualámbar.
  - Descubrimiento automático de proveedor alternativo conectado y botón de conmutación inmediata [Cambiar a {alternative.name}].
  - FSM de re-armado automático: si el aviso se descarta pero el consumo sigue escalando, la alerta reaparece por seguridad.
- **Aviso de Estado Sin Cuentas (`AccountNotice.tsx`):**
  - Detección reactiva de desconexión o falta de suscripción con botón directo para enlazar proveedor o iniciar sesión vía terminal.

### S. Controlador Git Inline, Conmutador de Ramas y Estado de Cambios (`GitBranchBadge.tsx`)
- **Insignia Inline & Contador de Cambios:**
  - Visualización del nombre de rama HEAD con checkmark esmeralda en árbol limpio o píldora ámbar pulsante con contador de archivos modificados (`uncommittedCount`).
  - Detección de carpetas sin repositorio Git con aviso "Sin Git" y botón directo para inicializar en disco (`git init` asistido).
  - Inspección local directa sin `git fetch` de red: respuesta instantánea (&lt; 2ms) y funcionamiento 100% offline.
- **Menú Popover & Filtro Reactivo:**
  - Desplegable con cabecera de estado, búsqueda en vivo de ramas locales (`inputRef` con autofoco) y botón de refresco.
  - Soporte de ramas de equipo/worktree (`squadBranches[]`) con iconografía de merge cian.
- **Checkout en 1-Clic & Creación Sanitizada:**
  - Conmutación inmediata de rama con un clic en la fila (`handleCheckoutBranch`) cerrando el popover automáticamente.
  - Formulario integrado de creación de ramas con auto-slugificación de espacios en guiones (`replace(/\s+/g, '-')`).
  - Enlace directo al modal avanzado de gestión de ramas (`BranchManagerModal.tsx`).

### T. Espacio de Trabajo Dividido y Malla Multitarea Concurrente (`SplitWorkspace.tsx`)
- **Malla Multi-Agente & Layouts Dinámicos (useSplit):**
  - Soporta hasta 4 paneles concurrentes (`MAX_COLUMNS = 4`) con umbral mínimo de 340px por columna y scroll horizontal suave.
  - 3 modos de disposición conmutables en 1-clic: Columnas (`cols`), Filas apiladas (`rows`) y Malla balanceada 2x2 (`grid`).
  - Persistencia en `localStorage` de paneles activos (`agent-hub.split`), layout (`agent-hub.splitLayout`) y conjuntos guardados (`agent-hub.splitSets`).
- **Memoización sameChat a 60 FPS:**
  - Comparador granular `sameChat` que aísla los repintados estrictamente al panel que recibe tokens en streaming (`state.live[id]`).
  - Previene repintados en cascada entre los 4 paneles cuando un agente genera texto.
  - Estado maximizado (`maximized`): permite enfocar temporalmente un panel al 100% sin destruir ni reiniciar las sesiones en paralelo.
- **Enrutamiento CWD & Git Independiente:**
  - Cada panel integra su propio `WorkspacePicker` y `GitBranchBadge`, permitiendo trabajar en proyectos y ramas disjuntos simultáneamente.
  - Reordenamiento horizontal fluido de paneles con `move(from, to)`.

### U. Bandeja Multimodal de Adjuntos y Motor de Resaltado Sintáctico (`AttachmentChips.tsx`, `syntax-highlighter.tsx`, `DiffLines.tsx`)
- **Bandeja Multimodal & Estimador de Tokens:**
  - Chips interactivos para archivos de código con rango de líneas (`#L10-L40`), miniaturas de imagen para vision LLM y etiquetas multimedia (audio/video).
  - Cálculo dinámico de tokens de contexto estimados antes de enviar (`~tokens tokens de contexto`) y acción masiva de vaciado [Quitar todos].
  - Colapso suave sin saltos de layout en el compositor.
- **Motor de Resaltado Sintáctico (0 Dependencias):**
  - Parser léxico interno con expresión regular optimizada en `syntax-highlighter.tsx` que colorea 500 líneas en menos de 1.2 ms.
  - Soporte multi-lenguaje: TypeScript, Python, Rust, Go, SQL, Bash, JSON y Diffs sin librerías externas pesadas.
  - Clases CSS canónicas: `syn-kw`, `syn-type`, `syn-str`, `syn-com`, `syn-op`, `syn-const`.
- **Renderizado de Diffs en Línea (`DiffLines.tsx`):**
  - Formato git delta con borde subpixel de 2px (verde esmeralda en adiciones `+`, rojo rosa en supresiones `-`, cabeceras cian `@@`).
  - Texto seleccionable nativo (`select-text`) para copiar código limpio directamente desde el chat.

### V. Barra Táctica Spotlight y Lanzador Global de Intenciones (`SpotlightBar.tsx`)
- **Modal Spotlight Global & Trampa de Foco W3C APG:**
  - Invocación universal con atajo de teclado `Ctrl+K` / `Cmd+K` con backdrop blur semitransparente.
  - Trampa de foco cíclica (`trapFocus`) que confina la navegación por teclado (`Tab`/`Shift+Tab`) dentro del diálogo.
  - Restauración automática del cursor al elemento disparador al cerrar (`opener?.focus()`).
- **Navegación de Historial con Flechas (Up/Down):**
  - Ciclado fluido hacia atrás (`ArrowUp`) y hacia adelante (`ArrowDown`) en el historial local (`agent-hub.promptHistory`).
  - Preserva el texto de trabajo en redacción cuando el usuario baja de nuevo al buffer inicial.
  - Chips de acceso rápido para los 5 prompts más recientes con inserción en 1-clic.
- **Píldoras de Acción Rápida (Intents):**
  - Botones dedicados para generar commit semántico (`onGenerateCommit`), auditar seguridad de la rama (`onAuditBranch`) y ejecutar suites de pruebas unitarias (`onRunTests`).
  - Despacho inmediato al chat activo al pulsar `Enter`.

### 2.W Barra Táctica Flotante de Telemetría y Motor Cinético de Movimiento
- **Diagrama de Arquitectura (Spec Card #70):** [tactical-floating-telemetry-bar-and-kinetic-motion-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-floating-telemetry-bar-and-kinetic-motion-architecture.svg)
- **Showcase Interactivo:** [tactical-floating-telemetry-bar-and-kinetic-motion-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-floating-telemetry-bar-and-kinetic-motion-showcase.html)
- **Componentes Frontend Asociados:**
  - `TelemetryBar.tsx`: Barra flotante colapsable mediante tag semántico `<details>` con cero re-renders al cerrar y chevron con rotación fluida 180° (`group-open:rotate-180`).
  - `motion.tsx`: Motor de micro-interacciones cinéticas a 60 FPS con rAF, odómetro mecánico `CountUp` y atracción magnética de botones `hud-magnet`.
  - `AgentHubLogo.tsx`: Logotipo orbital táctico con anillos vectoriales animados a 60 FPS purificado a tonos cian y esmeralda.
- **Medidores Duales de Cuota y Umbrales Reactivos:**
  - Cuota semanal (ventana 7 días) y ventana móvil de 5 horas.
  - Alerta ámbar al superar el 85% de saturación (`> 85%`).
  - Alerta crítica roja con halo pulsante al superar el 95% (`shadow-[0_0_8px_rgba(239,68,68,0.5)]`).
- **Desglose Métrico Atómico:**
  - Turnos totales ejecutados con insignia `ShieldCheck`.
  - Tokens de entrada (`ArrowDownRight`) y salida (`ArrowUpRight`) formateados en miles (`k`).
  - Promedio de tokens por turno (`Ø tokens/turno`).
  - Tokens de caché leídos (`emerald-300`) y tokens de razonamiento profundo (`Brain`, `violet-300`).
  - Acumulador estimado de costo en USD alineado a la derecha (`ml-auto`) con resolución de micro-centavos (`$0.0000`).
- **Blindaje de Accesibilidad:**
  - Cumplimiento riguroso de `prefers-reduced-motion: reduce`: anula ticks de rAF instantáneamente preservando valores finales exactos sin saltos visuales.

### 2.X Gestor Multi-Tenant de Cuentas, Perfiles y Credenciales Tácticas
- **Diagrama de Arquitectura (Spec Card #71):** [tactical-account-profiles-and-multi-tenant-auth-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-account-profiles-and-multi-tenant-auth-architecture.svg)
- **Showcase Interactivo:** [tactical-account-profiles-and-multi-tenant-auth-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-account-profiles-and-multi-tenant-auth-showcase.html)
- **Componentes Frontend Asociados:**
  - `AccountsView.tsx`: Vista táctica consolidada por proveedor (Claude, Google Antigravity, GitHub Copilot, Ollama Local).
  - `ProfileCard.tsx`: Tarjeta interactiva de perfil con indicador `ACTIVO EN ESTE CHAT`, insignias de suscripción (`PRO`, `TEAM`, `MAX`), selector `Usar en chat`, botón de desconexión y listado de modelos disponibles.
  - `AddAccountModal.tsx`: Diálogo accesible con tabs por proveedor, notas explicativas, campo de etiqueta identificadora (máx 40 caracteres) e inicio de sesión reactivo.
  - `ProviderBadge.tsx`: Insignia de alta fidelidad con código de color específico por plataforma.
- **Puente CLI y Rotación de Cuentas:**
  - Conmutación automática ante saturación de cuota en CLI (fallback 90%).
  - Copiador de correo electrónico de cuenta al portapapeles con confirmación visual rápida (`Check`).
  - Vinculación directa de cuenta a la sesión activa mediante IPC `updateSession({ profileId })`.

### 2.Y Cajón Táctico de Sesiones, Jerarquía de Flujos y Árbol de Proyectos
- **Diagrama de Arquitectura (Spec Card #72):** [tactical-session-drawer-and-flows-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-session-drawer-and-flows-architecture.svg)
- **Showcase Interactivo:** [tactical-session-drawer-and-flows-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-session-drawer-and-flows-showcase.html)
- **Componentes Frontend Asociados:**
  - `SessionDrawer.tsx`: Cajón lateral maestro con árbol de proyectos, carpetas colapsables, grupos de escuadrones (`groupByFlow`), insignias de rol (`agentLabel`), buscador de mensajes y favoritos en `localStorage`.
- **Estructura Jerárquica y Escuadrones:**
  - Agrupación atómica por proyecto (`projectName` o contenedor `Sin proyecto / UNASSIGNED`).
  - Sub-árbol anidado para escuadrones multi-agente (`squadId`, miembros ordenados por plantilla de protocolo: Arquitecto, Desarrollador, Revisor).
  - Chats individuales sueltos desplegados directamente como filas de acceso inmediato.
- **Búsqueda en Mensajes y Filtrado:**
  - Búsqueda en vivo con debounce de 250ms que inspecciona títulos, roles y coincidencias en mensajes internos (`searchHits`).
  - Tríada de ordenamiento: `recent` (actividad reciente), `name` (orden alfabético) y `messages` (volumen de conversación).
  - Marcado de favoritos fijados arriba del listado general.
- **Salvaguardas Destructivas:**
  - Limpiador en lote asistido para eliminar chats vacíos (0 mensajes) con confirmación de dos pasos (`confirmClearEmpty`).
  - Pestillo de confirmación en línea para borrado individual de sesión (`pendingDeleteId`).
  - Modal accesible de renombrado de proyecto en bloque.

### 2.Z Memoria Táctica a Largo Plazo, Matriz de Experiencia y Ventana Deslizante
- **Diagrama de Arquitectura (Spec Card #73):** [tactical-memory-experience-and-context-tail-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-memory-experience-and-context-tail-architecture.svg)
- **Showcase Interactivo:** [tactical-memory-experience-and-context-tail-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-memory-experience-and-context-tail-showcase.html)
- **Componentes Frontend Asociados:**
  - `MemoryView.tsx`: Vista táctica de memoria persistente con delimitador tail de contexto de 2000 caracteres, baraja de lecciones estructuradas y editor raw de Markdown.
- **Delimitador de Ventana Deslizante (Context Tail):**
  - Cola activa estricta de 2000 caracteres (`SENT_TAIL_CHARS = 2000`) inyectada dinámicamente en el system prompt del agente.
  - Indicador visual tipo barra de progreso que desglosa el contenido en contexto activo (`isInContext: true`, borde esmeralda) versus desbordamiento histórico archivado en disco.
  - Telemetría en tiempo real: recuento de caracteres, palabras, líneas y estado de sincronización (`dirty`).
- **Matriz de Lecciones Estructuradas:**
  - Parseador de bloques con esquema de tres campos: `Señal:` (cuándo aplica), `Lección:` (directiva reglamentaria) y `Evidencia:` (pruebas o commits de verificación).
  - Filtro por palabras clave y copiador rápido de lección al portapapeles.
  - Formulario modal accesible para añadir nuevas lecciones con validación de campos obligatorios.
- **Editor Raw y Sincronización Segura:**
  - Editor monospaciado con detección de cambios sucios, botón Deshacer (`undo`) y guardado reactivo a disco mediante `postToHost({ command: 'saveExperience' })`.

---

## 3. Resolución de Workspace CWD y Protección Anti-System32
- **Diagrama de Arquitectura:** [workspace-cwd-resolution-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/workspace-cwd-resolution-architecture.svg)
- **Filtro de Seguridad (`isSystemOrAppDir`):**
  - Intercepta y bloquea `C:\Windows\System32`, `SysWOW64`, raíces de disco y directorios de instalación (`AppData\Local\Programs\AgentHub`).
  - Previene que el CWD de Electron en Windows (que se inicializa por defecto en `System32` o el ejecutable) contamine los espacios de trabajo.
- **Herencia en Cascada para Flujos y Equipos (`startPipeline`, `spawnAgents`, `createSession`):**
  - Prioridad 1: Carpeta asignada al proyecto explícito (`hub.sessions.projectPath(name)`).
  - Prioridad 2: Carpeta de la sesión activa (`current.isolatedBase ?? current.projectPath`).
  - Prioridad 3: Proyecto de la sesión activa (`current.projectName`).
  - Prioridad 4: Espacio de trabajo de VS Code / Host (`workspaceDir()`).
  - Prioridad 5: Historial reciente de workspaces (`getRecentWorkspaces()`).
  - Prioridad 6: Directorio seguro de usuario (`os.homedir()`).
- **Garantía en Tiempo de Ejecución (`chat-service.ts`):**
  - Cada agente de un squad corre estrictamente en su carpeta asignada (`session.projectPath` o su git worktree aislado).
  - Al realizar handoffs secuenciales (`Arquitecto -> Tester -> Desarrollador -> Revisor`), el compañero de equipo hereda su `target.projectPath` asignado sin fugas.

---

## 4. Archivos de Referencia y Verificación
- **Portal Maestro y Galería de Componentes:** [master-design-portal-and-component-gallery-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/master-design-portal-and-component-gallery-showcase.html)
- **Diagrama Arquitectónico del Portal Maestro (Spec Card #45):** [master-design-portal-and-component-gallery-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/master-design-portal-and-component-gallery-architecture.svg)
- **Compositor Táctico y Paleta de Acciones (Spec Card #46):** [tactical-composer-and-action-palette-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-composer-and-action-palette-architecture.svg)
- **Showcase Interactivo del Compositor Táctico:** [tactical-composer-and-action-palette-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-composer-and-action-palette-showcase.html)
- **Barra Lateral de Archivos y Workspace Git (Spec Card #47):** [project-files-sidebar-and-git-workspace-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/project-files-sidebar-and-git-workspace-architecture.svg)
- **Showcase Interactivo del Explorador de Archivos y Git:** [project-files-sidebar-and-git-workspace-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/project-files-sidebar-and-git-workspace-showcase.html)
- **Consola Terminal y Shell Multiplexer (Spec Card #48):** [terminal-drawer-and-shell-hud-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/terminal-drawer-and-shell-hud-architecture.svg)
- **Showcase Interactivo de la Terminal Shell:** [terminal-drawer-and-shell-hud-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/terminal-drawer-and-shell-hud-showcase.html)
- **Modales Accesibles y Focus Trap HUD (Spec Card #49):** [modal-accessibility-and-focus-trap-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/modal-accessibility-and-focus-trap-architecture.svg)
- **Showcase Interactivo de Modales y Focus Trap:** [modal-accessibility-and-focus-trap-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/modal-accessibility-and-focus-trap-showcase.html)
- **Paleta de Acciones y Diagramas Interactivos (Spec Card #50):** [tactical-action-palette-and-interactive-diagrams-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-action-palette-and-interactive-diagrams-architecture.svg)
- **Showcase Interactivo de Acciones y Diagramas:** [tactical-action-palette-and-interactive-diagrams-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-action-palette-and-interactive-diagrams-showcase.html)
- **Orquestador de Escuadrones y Matriz de Agentes (Spec Card #51):** [squad-orchestrator-and-agents-matrix-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/squad-orchestrator-and-agents-matrix-architecture.svg)
- **Showcase Interactivo del Orquestador y Matriz de Agentes:** [squad-orchestrator-and-agents-matrix-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/squad-orchestrator-and-agents-matrix-showcase.html)
- **Malla MCP y Matriz de Memoria v2 (Spec Card #52):** [mcp-mesh-and-memory-matrix-v2-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/mcp-mesh-and-memory-matrix-v2-architecture.svg)
- **Showcase Interactivo de Malla MCP y Memoria v2:** [mcp-mesh-and-memory-matrix-v2-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/mcp-mesh-and-memory-matrix-v2-showcase.html)
- **Centro de Mando y Matriz de Telemetría v2 (Spec Card #53):** [tactical-command-center-and-telemetry-matrix-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-command-center-and-telemetry-matrix-architecture.svg)
- **Showcase Interactivo del Centro de Mando y Telemetría v2:** [tactical-command-center-and-telemetry-matrix-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-command-center-and-telemetry-matrix-showcase.html)
- **Bus de Notificaciones y Atajos HUD v2 (Spec Card #54):** [tactical-notifications-and-shortcuts-hub-v2-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-notifications-and-shortcuts-hub-v2-architecture.svg)
- **Showcase Interactivo de Notificaciones y Atajos v2:** [tactical-notifications-and-shortcuts-hub-v2-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-notifications-and-shortcuts-hub-v2-showcase.html)
- **Arquitectura Global del Sistema Táctico (Spec Card #55):** [tactical-hud-global-system-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-hud-global-system-architecture.svg)
- **Cubierta de Onboarding y Estado Sin Sesión (Spec Card #56):** [tactical-empty-state-and-onboarding-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-empty-state-and-onboarding-architecture.svg)
- **Showcase Interactivo de Onboarding y Empty State:** [tactical-empty-state-and-onboarding-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-empty-state-and-onboarding-showcase.html)
- **Compositor Multimodal y Orquestador de Cola v2 (Spec Card #57):** [tactical-multimodal-composer-and-queue-orchestrator-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-multimodal-composer-and-queue-orchestrator-architecture.svg)
- **Showcase Interactivo del Compositor Multimodal y Cola v2:** [tactical-multimodal-composer-and-queue-orchestrator-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-multimodal-composer-and-queue-orchestrator-showcase.html)
- **Motor Táctico de Documentos y Sandbox Multi-Viewport (Spec Card #58):** [tactical-document-engine-and-sandbox-previewer-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-document-engine-and-sandbox-previewer-architecture.svg)
- **Showcase Interactivo del Motor de Documentos y Sandbox v2:** [tactical-document-engine-and-sandbox-previewer-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-document-engine-and-sandbox-previewer-showcase.html)
- **Anatomía del Mensaje Táctico, Matriz de Decisión y Time-Travel (Spec Card #59):** [tactical-message-stream-and-decision-matrix-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-message-stream-and-decision-matrix-architecture.svg)
- **Showcase Interactivo de la Anatomía del Mensaje y Matriz v2:** [tactical-message-stream-and-decision-matrix-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-message-stream-and-decision-matrix-showcase.html)
- **Motor Táctico de Diff Interactivo y Parches (Spec Card #60):** [tactical-interactive-diff-and-patch-engine-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-interactive-diff-and-patch-engine-architecture.svg)
- **Showcase Interactivo del Diff Interactivo y Parches v2:** [tactical-interactive-diff-and-patch-engine-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-interactive-diff-and-patch-engine-showcase.html)
- **Auditor Táctico de Seguridad y Gestor de Ramas Git (Spec Card #61):** [tactical-security-auditor-and-branch-manager-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-security-auditor-and-branch-manager-architecture.svg)
- **Showcase Interactivo del Auditor de Seguridad y Ramas Git v2:** [tactical-security-auditor-and-branch-manager-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-security-auditor-and-branch-manager-showcase.html)
- **Borrador Táctico y Motor de Notas Rápidas (Spec Card #62):** [tactical-scratchpad-and-quicknotes-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-scratchpad-and-quicknotes-architecture.svg)
- **Showcase Interactivo del Borrador Táctico y Notas Rápidas v2:** [tactical-scratchpad-and-quicknotes-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-scratchpad-and-quicknotes-showcase.html)
- **Selector Táctico de Espacios de Trabajo y Árbol Multi-Raíz (Spec Card #63):** [tactical-workspace-picker-and-multiroot-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-workspace-picker-and-multiroot-architecture.svg)
- **Showcase Interactivo del Selector de Espacios de Trabajo v2:** [tactical-workspace-picker-and-multiroot-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-workspace-picker-and-multiroot-showcase.html)
- **Matriz de Roles del Protocolo y Motor de Esfuerzo (Spec Card #64):** [tactical-protocol-roles-and-effort-engine-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-protocol-roles-and-effort-engine-architecture.svg)
- **Showcase Interactivo de Roles del Protocolo y Esfuerzo v2:** [tactical-protocol-roles-and-effort-engine-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-protocol-roles-and-effort-engine-showcase.html)
- **Catálogo Multi-Proveedor y Blindaje de Cuota con Failover (Spec Card #65):** [tactical-model-catalog-and-quota-failover-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-model-catalog-and-quota-failover-architecture.svg)
- **Showcase Interactivo del Catálogo de Modelos y Failover v2:** [tactical-model-catalog-and-quota-failover-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-model-catalog-and-quota-failover-showcase.html)
- **Controlador Git Inline y Conmutador de Ramas (Spec Card #66):** [tactical-inline-git-controller-and-branch-switcher-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-inline-git-controller-and-branch-switcher-architecture.svg)
- **Showcase Interactivo del Controlador Git Inline v2:** [tactical-inline-git-controller-and-branch-switcher-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-inline-git-controller-and-branch-switcher-showcase.html)
- **Espacio de Trabajo Dividido y Malla Multitarea (Spec Card #67):** [tactical-split-workspace-and-multitasking-grid-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-split-workspace-and-multitasking-grid-architecture.svg)
- **Showcase Interactivo del Espacio de Trabajo Dividido v2:** [tactical-split-workspace-and-multitasking-grid-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-split-workspace-and-multitasking-grid-showcase.html)
- **Bandeja de Adjuntos y Resaltado Sintáctico (Spec Card #68):** [tactical-attachment-tray-and-syntax-highlighter-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-attachment-tray-and-syntax-highlighter-architecture.svg)
- **Showcase Interactivo de Adjuntos y Resaltador Sintáctico v2:** [tactical-attachment-tray-and-syntax-highlighter-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-attachment-tray-and-syntax-highlighter-showcase.html)
- **Barra Táctica Spotlight y Lanzador de Intenciones (Spec Card #69):** [tactical-spotlight-bar-and-prompt-launcher-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-spotlight-bar-and-prompt-launcher-architecture.svg)
- **Showcase Interactivo de la Barra Spotlight v2:** [tactical-spotlight-bar-and-prompt-launcher-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-spotlight-bar-and-prompt-launcher-showcase.html)
- **Barra Táctica Flotante de Telemetría y Motor Cinético (Spec Card #70):** [tactical-floating-telemetry-bar-and-kinetic-motion-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-floating-telemetry-bar-and-kinetic-motion-architecture.svg)
- **Showcase Interactivo de Telemetría Flotante y Movimiento Cinético v2:** [tactical-floating-telemetry-bar-and-kinetic-motion-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-floating-telemetry-bar-and-kinetic-motion-showcase.html)
- **Gestor Multi-Tenant de Cuentas y Credenciales (Spec Card #71):** [tactical-account-profiles-and-multi-tenant-auth-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-account-profiles-and-multi-tenant-auth-architecture.svg)
- **Showcase Interactivo del Gestor de Cuentas y Perfiles v2:** [tactical-account-profiles-and-multi-tenant-auth-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-account-profiles-and-multi-tenant-auth-showcase.html)
- **Cajón Táctico de Sesiones y Jerarquía de Flujos (Spec Card #72):** [tactical-session-drawer-and-flows-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-session-drawer-and-flows-architecture.svg)
- **Showcase Interactivo del Cajón de Sesiones y Flujos v2:** [tactical-session-drawer-and-flows-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-session-drawer-and-flows-showcase.html)
- **Memoria Táctica a Largo Plazo y Ventana Deslizante (Spec Card #73):** [tactical-memory-experience-and-context-tail-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-memory-experience-and-context-tail-architecture.svg)
- **Showcase Interactivo de Memoria y Ventana Deslizante v2:** [tactical-memory-experience-and-context-tail-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/tactical-memory-experience-and-context-tail-showcase.html)
- **Portal Maestro y Catálogo de 73 Spec Cards:** [master-design-portal-and-component-gallery-showcase.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/master-design-portal-and-component-gallery-showcase.html)
- **Prototipo HTML/CSS/JS Interactivo:** [command-center-redesign.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/command-center-redesign.html)
- **Diagrama de Resolución de Workspace:** [workspace-cwd-resolution-architecture.svg](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/workspace-cwd-resolution-architecture.svg)
- **Suite de Pruebas:** 14/14 pruebas unitarias de flujos y aislamiento superadas (`0` fallos).
- **Compilación de Producción:** `npm run build` completado exitosamente con 0 advertencias o errores de tipado.
