# Lecciones del Proyecto

Señal: Al empaquetar scripts CLI como backend embebido dentro del proceso principal de Electron con esbuild.
Lección: `require.main === module` se evalúa como `true` en el punto de entrada de Electron y dispara auto-ejecuciones a menos que se agregue `&& !process.versions.electron`, y en Windows `start "${url}"` abre un CMD con ese título a menos que se use `start "" "${url}"`.
Evidencia: `src/server/standalone.ts` y la terminal abierta con título `http://localhost:3710` en `C:\Users\juan0\.agent-hub\media_cache\1794109649140-image.png`.

Señal: Al tocar el límite de gasto o un bucle automático (Modo Loop) que encadena turnos en `ChatService.drain`.
Lección: `finishTurn` borra las respuestas sin texto ni actividad; si `reply.costUSD` se asigna después, ese gasto se pierde, `spentUSD` nunca llega al límite y el loop no termina (el test se queda sin memoria).
Evidencia: test "detiene el bucle continuo cuando se supera el presupuesto asignado" en `tests/agent-hub.test.ts` y `src/chat/chat-service.ts` (costUSD antes de finishTurn).

Señal: Al escribir tests de handlers que leen o escriben en `workspaceDir()` (scratchpad, git, búsqueda).
Lección: el shim de `vscode` fija `workspaceFolders` con el `cwd` al cargarse, así que `process.chdir` no cambia nada y el handler opera sobre el repo real (el test del scratchpad pisaba `.agent-hub/scratchpad.md`); hay que sustituir `vscode.workspace.workspaceFolders` por una carpeta temporal y restaurarlo.
Evidencia: `src/server/vscode-shim.ts:5` y los tests "editorHandlers pasa a git rutas..." y "carga y guarda notas en scratchpad.md" en `tests/agent-hub.test.ts`.

Señal: Al cambiar en qué dirección escucha `HubServer` o qué URL abren Electron, Tauri o la extensión.
Lección: la extensión de VS Code y la app de escritorio levantan cada una un `HubServer` en el 3710; si una escucha en `127.0.0.1` y la otra en `::`, ambas arrancan sin conflicto y `http://localhost` (que en Windows resuelve a ::1) lleva la ventana al servidor equivocado. Todas las URLs deben usar `127.0.0.1` explícito.
Evidencia: `Get-NetTCPConnection -LocalPort 3710` mostraba `::` del proceso Code.exe y `127.0.0.1` de AgentHub.exe, con la ventana conectada al de VS Code; `src/server/hub-server.ts` (getter `url`).

Señal: Al consultar la rama git activa en repositorios nuevos o sin commits iniciales.
Lección: `git rev-parse --abbrev-ref HEAD` falla con "fatal: ambiguous argument HEAD" si el repositorio no tiene commits; `git branch --show-current` resuelve la rama correctamente en repositorios vacíos y existentes.
Evidencia: fallo en `tests/agent-hub.test.ts` con `git init -b` resuelto al adoptar `git branch --show-current` en `src/host/workspace.ts` (`getGitBranch`).

Señal: Al formatear explicaciones con encabezados retóricos (`### ¿Cómo funciona...?`) seguidos de listas numeradas.
Lección: `extractQuestionOptions` los parseaba como opciones interactivas de respuesta; deben descartarse encabezados markdown (`#`), preguntas conceptuales e ítems con `:` o contenido posterior.
Evidencia: falso positivo en `MessageList.tsx` corregido en `src/shared/question-options.ts` y test "descarta títulos explicativos" en `tests/agent-hub.test.ts`.

Señal: agentes que formulan preguntas de decisión con viñetas (`- `) o roles con `readOnly: true` (ej. Coordinador) cuando la sesión tiene permiso completo.
Lección: `extractQuestionOptions` debe aceptar viñetas (`- `, `* `, `• `) con frases de decisión ("Necesito saber... Según eso:") y estructurar título/descripción; además `isReadOnly` debe respetar `session.permission === 'full'` por encima del rol predeterminado para no bloquear ediciones ni emitir alertas erróneas de solo lectura.
Evidencia: capturas con Claude Coordinador (`1794415312371-image.png` y `1794415320000-image.png`), resuelto en `src/shared/question-options.ts`, `src/chat/chat-service.ts` y test unitario en `tests/agent-hub.test.ts`.

Señal: Al implementar botones y atajos de ventana flotante o desacople (`popOutWindow`, `Ctrl+Alt+W`) en Electron y navegador.
Lección: `before-input-event` con `Ctrl+W` (`!input.shift`) sin validar `!input.alt` oculta la ventana a la bandeja al pulsar `Ctrl+Alt+W`, y `standalone` lo tenía como no-op; se debe spawnear un `BrowserWindow` con `?solo=<id>` en Electron o un popup `window.open` en navegador.
Evidencia: `src/electron/main.ts` (`createDetachedWindow`), `src/server/standalone.ts` y `src/webview/App.tsx` (`handlePopOut`).

Señal: Al renderizar enlaces markdown o fichas de archivos dentro de texto en negrita (`**...**`) o cursiva (`*...*`).
Lección: `renderInline` evaluaba `part.slice(2, -2)` como string plano en `<strong>`, mostrando el marcado de enlaces sin procesar; debe llamarse recursivamente a `renderInline` dentro de negrita y cursiva.
Evidencia: captura `1794418590753-image.png` y corrección en `src/webview/components/chat/Markdown.tsx` (`renderInline`).

Señal: Al listar o cambiar ramas Git en el gestor modal o badge con proyectos o worktrees activos.
Lección: `emitGitBranches` y las acciones git deben resolver la ruta usando `dir || sessionId || activeSession.projectPath` en vez de caer en `agent-hub`, limpiar los prefijos de worktrees (`+ `) y remotos (`git branch -a`), y emitir `dirGitStatus` para refrescar en vivo.
Evidencia: captura `1794418709315-image.png` (solo salía `main` de agent-hub), solucionado en `src/host/handlers/editor-handlers.ts`, `src/webview/App.tsx` y test unitario en `tests/agent-hub.test.ts`.

Señal: Agentes (ej. rol Coordinador) que delegan y prometen "cuando reporte te aviso" o "te aviso luego".
Lección: Cada turno termina con la respuesta del modelo y el proceso se apaga; el modelo no se queda en segundo plano. El prompt debe prohibir promesas a futuro de avisar, forzar reporte del estado actual o ejecución síncrona, y advertir si no hay squad activo en el chat.
Evidencia: captura `1794418842850-image.png` y conversación SESV-121 en `sessions.json`, resuelto en `src/shared/protocol-roles.ts` y `src/agents/prompt-composer.ts`.

Señal: Al copiar, borrar o restaurar `dist` de AgentHub desde código (versiones, rollback, empaquetado).
Lección: En la app instalada `resources/app/dist` es un junction al `dist` del repo: hay que hacer `realpathSync` antes de `cpSync` (si no, copia el enlace) y vaciar dist por dentro en vez de borrarlo (borrarlo rompe el junction).
Evidencia: `src/electron/dist-versions.ts` (`snapshotDist`, `restoreVersion`) y `actualizar.ps1`.

Señal: Al añadir una franja o tarjeta nueva dentro de una vista `flex flex-col overflow-y-auto` (HUD, paneles con scroll).
Lección: Los hijos de un flex-col con `min-h-0` se encogen hasta casi desaparecer (la cinta del HUD quedó en 14 px); las franjas de alto fijo necesitan `shrink-0`. Y una animación de entrada con `fill-mode: both` deja `transform` fijo y anula los `hover:translate`; usar `backwards`.
Evidencia: `src/webview/components/TacticalHudView.tsx` (`.hud-ticker`) y `.hud-rise` en `src/webview/styles.css`.

Señal: Al cambiar colores de toda la webview (paleta, tema, rediseño).
Lección: Los tonos zinc de Tailwind se leen de `--hub-zinc-*` (styles.css) con la mezcla del tema de VS Code como respaldo; dentro de VS Code se ponen a `initial` para que gane el tema del editor. Cambia la paleta ahí, no clase por clase.
Evidencia: `tailwind.config.js` (`var(--hub-zinc-${step}, color-mix(...))`) y `:root`/`body[class*='vscode-']` en `src/webview/styles.css`.

Señal: Al citar en el chat un archivo para que el usuario lo abra (maquetas HTML, specs, informes).
Lección: Solo los enlaces markdown y las rutas en `código` con carpeta (`docs/x.html`) o absolutas se vuelven fichas clicables que abren Documentos; un nombre suelto (`x.html`) queda como texto copiable. Cita siempre la ruta con carpeta.
Evidencia: `isInlineFilePath` y `FileLinkChip` en `src/webview/components/chat/Markdown.tsx`; test "Rutas en `código` dentro del chat".

Señal: Al colapsar etiquetas de texto de pestañas o navegación superior con Tailwind responsive.
Lección: Evitar breakpoints ultra-anchos como `min-[1360px]` para ocultar texto de navegación; en laptops y monitores estándar (1080p-1200p) convierte las pestañas en iconos misteriosos sin rotulado. Usar `hidden lg:inline` (1024px) para mantener contexto legible.
Evidencia: `src/webview/App.tsx:849` (ajuste de `min-[1360px]:inline` a `lg:inline`).

Señal: Al unificar la identidad visual multiplataforma de AgentHub (Electron, Standalone y VS Code).
Lección: Declarar `backgroundColor: '#07090e'` en el host de Electron y `<body class="bg-[#07090e] text-[#f1f5f9]">` en el HTML raíz garantiza arranque Zero-Flash; los componentes reactivos deben emplear la triada táctica HUD (#07090e base, #0a0e17 superficie, #172238 bordes, con acentos cian #06b6d4 y esmeralda #10b981) cumpliendo contraste WCAG AA ≥ 4.5:1 en todos los estados.
Evidencia: `src/electron/main.ts`, `src/webview/index.html`, `src/webview/styles.css` y las 25 maquetas de arquitectura en `docs/design/`.

Señal: Al renderizar bloques de código en el visor Markdown sin penalizar peso de bundle ni tiempo de arranque.
Lección: Evitar librerías AST pesadas (>1.5MB como Prism o Shiki); un tokenizador léxico ligero con lookahead contextual (`nextToken === '('` para funciones `.syn-fn`, constantes en mayúsculas `.syn-const`, operadores cian `.syn-op` y Sets O(1) para keywords y tipos) ejecuta en <1ms por bloque y mantiene el bundle ultra-ligero y reactivo.
Evidencia: `src/webview/components/chat/syntax-highlighter.tsx`, `src/webview/styles.css` y `docs/design/syntax-highlighter-engine-architecture.svg`.

Señal: un componente que se repite por columna o por chat muestra rama, cambios git o carpeta.
Lección: `branchesData` y `workspaceOverview` de App son solo los del chat activo; pasarlos a cada columna pinta la misma rama en todas. Pide `getDirGitStatus` por `projectPath` y guarda las respuestas `gitBranches`/`dirGitStatus` por `msg.dir` (el host devuelve el mismo `dir` que recibió).
Evidencia: src/webview/components/SplitWorkspace.tsx (useDirGit); antes recibía `currentBranch` global con 'main' por defecto.

Señal: un desplegable (absolute z-50) se ve bien en un chat solo pero queda debajo del contenido dentro de las columnas.
Lección: la cabecera de columna usa `backdrop-blur` (crea contexto de apilamiento) y la columna `overflow-hidden`, así que ningún z-index lo saca; pinta el menú con `FloatingPanel` (portal a body, `position: fixed`) y en el clic-fuera comprueba también `panelRef`.
Evidencia: src/webview/components/FloatingPanel.tsx, usado por WorkspacePicker.tsx y GitBranchBadge.tsx; cabecera en SplitWorkspace.tsx.

Señal: un cambio del webview compila bien pero la app de escritorio sigue mostrando lo de antes.
Lección: AgentHub.exe instalado lee `%LOCALAPPDATA%\Programs\AgentHub\resources\app\dist`, que debe ser un junction al `dist` del repo; `postbuild:webview`/`postbuild:electron` lo rehacen solos tras un `package:win`. Basta compilar y Ctrl+R (cambios de electron/main requieren reabrir); no hace falta copiar nada a mano.
Evidencia: scripts/link-installed-app.js; `(Get-Item ...\resources\app\dist -Force).LinkType` → Junction.
