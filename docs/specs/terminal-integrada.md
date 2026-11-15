# Especificación: Mejoras a la Terminal Integrada (`TerminalDrawer` v2)

## 1. Contexto Actual
Actualmente, la terminal integrada de AgentHub se compone de:
- UI: [`src/webview/components/TerminalDrawer.tsx`](../../src/webview/components/TerminalDrawer.tsx)
- Backend: handlers `runTerminalCommand` y `stopTerminalCommand` en [`src/host/handlers/editor-handlers.ts`](../../src/host/handlers/editor-handlers.ts), usando una única variable global `terminalProc` con `child_process.spawn(..., { shell: true })`.

Limitaciones detectadas en la implementación actual:
1. Solo permite **un proceso a la vez** (`if (terminalProc) return`).
2. No soporta **PTY ni `stdin` interactivo** (comandos con prompts `y/N` o herramientas TUI quedan bloqueados).
3. El directorio de trabajo usa `workspaceDir() ?? process.cwd()` en lugar de la sesión/worktree activo.
4. No parsea códigos de escape **ANSI** (colores de `npm test`, `vitest`, `git`, `flutter`).
5. La pestaña `Salida del Sistema` (`activeTab === 'output'`) renderiza exactamente el mismo `output` que `Consola Shell`.
6. La altura es fija (`h-64` / `h-96`) sin redimensionado por arrastre.

---

## 2. Las 20 Ideas de Mejora (Priorizadas)

### Bloque A — Núcleo de Ejecución y Contexto (Alto Impacto)
1. **Sincronización automática de `cwd` con la sesión/worktree activo**: pasar `cwd` (resuelto desde la sesión activa o worktree) en `runTerminalCommand` y mostrar el directorio actual en el prompt (`~/proyecto (main) $`).
2. **Soporte de `stdin` interactivo**: exponer un mensaje IPC `sendTerminalInput` para responder a prompts (`y/N`, contraseñas o menús CLI) cuando `running === true`.
3. **Múltiples pestañas de terminal (Multi-session)**: reemplazar el `terminalProc` único por un `Map<string, TerminalSession>` identificado por `terminalId`, permitiendo correr un dev server en una pestaña y tests en otra.
4. **Renderizado de colores ANSI**: integrar un parser ligero (ej. `ansi-to-html` o parser propio de secuencias SGR) para respetar colores de salida sin perder el resaltado de errores.
5. **Persistencia de estado de shell (`cd`, variables de entorno)** o migración opcional a **PTY real** (`node-pty` con fallback a `spawn` si no hay compilación nativa disponible).

### Bloque B — Integración con IA y Flujo AgentHub (Diferenciador)
6. **Botón "Explicar / Corregir error con IA"**: aprovechar el ícono `Sparkles` ya importado en `TerminalDrawer.tsx` para enviar el último comando fallido (`exitCode !== 0`) + últimas 50 líneas de stderr directamente al chat del agente activo.
7. **Detección inteligente de comandos rápidos (`QUICK_COMMANDS`)**: adaptar los botones rápidos según el proyecto detectado (`package.json`, `pubspec.yaml`, `Cargo.toml`, `build.gradle`), no solo los 4 comandos fijos actuales.
8. **Separar realmente la pestaña "Salida del Sistema"**: mostrar en `output` los logs internos del servidor/host/MCP de AgentHub y en `terminal` únicamente la consola interactiva.
9. **Notificación sonora o badge al terminar comandos largos**: si un comando tarda más de 10 s y el drawer está cerrado o en segundo plano, mostrar un toast/badge con el `exitCode` y duración.
10. **Guardar salida como contexto del chat**: botón "Adjuntar al chat" que envíe la salida seleccionada o completa como chip de contexto en el `Composer`.

### Bloque C — Productividad y UX en el Drawer
11. **Redimensionado vertical por arrastre (drag handle)**: barra superior arrastrable para ajustar la altura libremente entre `140px` y `80vh`, persistida en `localStorage`.
12. **Búsqueda en la salida (`Ctrl+F`)**: barra de búsqueda incremental dentro del buffer de salida con conteo de coincidencias y navegación siguiente/anterior.
13. **Rutas de archivo y URLs clicables**: detectar patrones `src/...ts:42:10` o `http://localhost:3000` en la salida para abrir el archivo en `CodePreviewModal` o la URL en el navegador.
14. **Autocompletado de historial y comandos (`Tab` / ghost text)**: sugerencia inline basada en el historial guardado en `TERMINAL_HISTORY_KEY` y scripts de `package.json`.
15. **Búsqueda inversa en historial (`Ctrl+R`)**: filtro rápido sobre los últimos 100 comandos ejecutados.
16. **Indicador de `exitCode` por bloque de comando**: agrupar cada ejecución (`$ cmd` + salida) con un badge verde (`✓ 0`) o rojo (`✗ 1`) y botón individual de "Re-ejecutar" o "Copiar bloque".
17. **Límite de buffer / virtualización**: truncar o virtualizar líneas cuando el output supere 5,000 líneas para evitar degradación de rendimiento en logs largos (ej. `gradle` o `webpack`).
18. **Snippets / Macros por proyecto**: permitir guardar comandos frecuentes del proyecto en `.agent-hub/terminal-snippets.json` (ej. build, deploy, logs).
19. **Selector de shell en Windows/macOS/Linux**: elegir entre `pwsh`, `cmd`, `git-bash` o `wsl` por pestaña sin cambiar la configuración global.
20. **Modo "Pantalla completa" / Split con el chat**: expandir el drawer al 100% del área de trabajo o acoplarlo a la derecha en pantallas anchas.

---

## 3. Modelo de Datos Propuesto (Fase 1: Núcleo + IA + UX)

```ts
export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  shell?: 'default' | 'pwsh' | 'cmd' | 'bash' | 'wsl';
  running: boolean;
  lastExitCode?: number;
  startedAt?: number;
  output: string;
}

export interface TerminalCommandBlock {
  id: string;
  command: string;
  cwd: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  output: string;
}
```

---

## 4. Mensajes IPC / Endpoints (Webview ↔ Host)

| Dirección | Tipo | Payload | Descripción |
| :--- | :--- | :--- | :--- |
| Webview → Host | `runTerminalCommand` | `{ terminalId: string; commandLine: string; cwd?: string; shell?: string }` | Ejecuta comando en la pestaña indicada y `cwd` del proyecto activo. |
| Webview → Host | `sendTerminalInput` | `{ terminalId: string; data: string }` | Envía texto + `\n` al `stdin` del proceso activo. |
| Webview → Host | `stopTerminalCommand` | `{ terminalId: string }` | Termina el árbol de procesos (`killTree`) de esa pestaña. |
| Host → Webview | `terminalOutput` | `{ terminalId: string; output: string; command?: string; exitCode?: number; cwd?: string }` | Envía chunk de stdout/stderr o evento de cierre. |

---

## 5. Criterios de Aceptación (Given / When / Then)

- **CA-1 (CWD del proyecto activo):**
  - *Given* una sesión activa apuntando a `C:\Proyectos\mi-app` (o un worktree),
  - *When* el usuario ejecuta `git status` en la terminal integrada,
  - *Then* el comando se ejecuta con `cwd = C:\Proyectos\mi-app` y no en el directorio raíz de `agent-hub`.

- **CA-2 (Multi-pestaña independiente):**
  - *Given* una pestaña `T1` corriendo `npm run dev`,
  - *When* el usuario crea una pestaña `T2` y ejecuta `npm test`,
  - *Then* ambos procesos corren en paralelo sin bloquearse y detener `T2` no afecta a `T1`.

- **CA-3 (Entrada interactiva `stdin`):**
  - *Given* un proceso en ejecución esperando confirmación (`Continue? (y/N)`),
  - *When* el usuario escribe `y` y presiona Enter en el input de la terminal,
  - *Then* el host escribe `y\n` en `proc.stdin` y el proceso continúa su ejecución.

- **CA-4 (Explicar/Corregir error con IA):**
  - *Given* un comando que terminó con `exitCode !== 0`,
  - *When* el usuario pulsa "Corregir con IA",
  - *Then* se abre/enfoca el chat con el comando, el código de salida y las últimas 50 líneas de salida como contexto.

---

## 6. Tareas Atómicas de Implementación (Plan Sugerido)
1. **T1 (Backend):** Migrar `terminalProc` en `editor-handlers.ts` a `Map<string, ChildProcess>` por `terminalId`, soportando `cwd` explícito y `sendTerminalInput`.
2. **T2 (Frontend State):** Actualizar el estado de terminal en `App.tsx` / `hub-state.ts` para manejar múltiples `TerminalTab` y enrutar `terminalOutput` por `terminalId`.
3. **T3 (UI Drawer):** Añadir barra de pestañas, drag-to-resize, parser ANSI ligero, búsqueda (`Ctrl+F`) y envío de `stdin` cuando `running === true`.
4. **T4 (IA & Contexto):** Conectar botón `Sparkles` ("Corregir con IA") y detección dinámica de `QUICK_COMMANDS` según archivos del workspace.
5. **T5 (Tests):** Agregar tests unitarios para resolución de `cwd`, manejo multi-sesión y sanitización/truncado de buffer.

---

## 7. Riesgos y Mitigaciones
- **Riesgo:** `node-pty` requiere compilación nativa (`node-gyp`) en Windows/Electron y puede romper builds portables.
  - *Mitigación:* Iniciar con `spawn` + `stdin` + `Map` de sesiones (cero dependencias nativas) y dejar `node-pty` como adaptador opcional.
- **Riesgo:** Logs masivos (`>10,000` líneas) congelan el DOM de React.
  - *Mitigación:* Mantener un buffer circular en memoria (ej. máximo 3,000 líneas o 256 KB por pestaña) y renderizar por bloques/líneas memorizadas.
