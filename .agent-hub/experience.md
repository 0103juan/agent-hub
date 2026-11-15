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
