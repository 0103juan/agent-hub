# AgentHub

Aplicación de escritorio (Electron) para conversar con varios modelos desde un solo panel, usando las suscripciones que ya tienes (Claude, Google Antigravity, GitHub Copilot) a través de sus CLIs, sin API keys.

## Qué hace

- **Chat con streaming** y actividad del agente en vivo: herramientas usadas, errores y turnos detenidos quedan visibles.
- **Cuenta, modelo y esfuerzo por conversación.** Los modelos salen de cada proveedor; Antigravity se consulta con `agy models`.
- **Conversaciones que continúan.** Cada sesión reanuda su conversación en la CLI. Al cambiar de proveedor, el historial reciente viaja como contexto.
- **Contexto adjunto:** selección activa, `@archivo` y cualquier archivo, con miniaturas para las imágenes. El texto pequeño va en el prompt; lo demás viaja por ruta para que el agente lo abra.
- **Roles del protocolo de desarrollo:** explorador, arquitecto, tester, desarrollador, revisor, externo, documentador y diseñador gráfico. Este último usa la skill `disenador-grafico`, que `build-and-install.ps1` instala para Claude y Antigravity.
- **Acciones:** ejecutar tests, revisar SQL, N+1, accesibilidad, variables de entorno y secretos, además de tareas que se le piden al agente sobre el código real.
- **Pestañas:** Chat, MCPs, Métricas y Cuentas. El historial se abre como panel lateral desde el chat.

## Requisitos

- Node.js 18 o superior.
- `claude` (Claude Code) y/o `agy` en `~/.gemini/bin`, con sesión iniciada.

## Desarrollo

```bash
npm install
npm test          # pruebas con node:test, sin tocar ~/.agent-hub
npm run build
npm run update    # compila, cierra la app instalada y la vuelve a abrir
```

La app instalada (`%LOCALAPPDATA%\Programs\AgentHub`) lee su carpeta `dist` por un junction a este repo, así que no hace falta reinstalar: `npm run update` la deja al día. Se instala una sola vez con `npm run package:win`. Si solo cambió la interfaz, `npm run build:webview` y recargar la ventana bastan. No hay extensión de VS Code: se retiró en favor de la app.

## Arquitectura

```text
src/
├── electron/         Ventana, bandeja y atajos de la app de escritorio
├── server/           Servidor local (HTTP/SSE) y punto de composición (`standalone.ts`)
├── shared/           Tipos, contrato de mensajes y selección de modelo (host y webview)
├── agents/           Un AgentProvider por proveedor, con su parser de stream
│   ├── claude/  antigravity/  copilot/
│   ├── cli-process.ts      Proceso vivo, líneas, errores y cancelación
│   ├── cli-process-pool.ts Reutiliza y limita los procesos
│   └── prompt-composer.ts  Rol, adjuntos e historial
├── chat/             ChatService: dueño de cada turno
├── storage/          Sesiones y telemetría en ~/.agent-hub
├── host/             Handlers de mensajes de la webview
├── analysis/         Análisis locales sin dependencia de VS Code
├── mcp/              Lista y sincronización de servidores MCP
└── webview/          Interfaz React, renderiza el estado que publica el host
```

- **Strategy:** `AgentProvider` aísla cada proveedor. Agregar uno es implementar la interfaz y registrarlo en `server/standalone.ts`.
- **Command:** cada mensaje de la webview tiene su handler, y el tipo `HandlerMap` obliga a cubrirlos todos.
- **Inversión de dependencias:** `ChatService` y los almacenes reciben sus colaboradores, por eso se prueban sin VS Code ni CLIs.
- **Una sola fuente de verdad:** la conversación vive en el host; la webview solo la pinta, así que recargar la ventana no pierde un turno.

## Rendimiento

- Las CLIs corren con `--input-format stream-json`: el proceso sigue vivo entre turnos y se evita su arranque. Al enfocar el cuadro de mensaje se precalienta.
- Se conserva un proceso inactivo durante 5 minutos, porque cada uno carga sus MCP (unos 1,2 GB medidos). Los límites están en `src/agents/cli-process-pool.ts`.
- Las cuentas salen de `~/.agent-hub/accounts-cache.json` y se refrescan en segundo plano cada hora o con el botón de refrescar.
- La escritura en disco se agrupa cada 400 ms y la vista solo recibe los mensajes de la sesión activa.

## Permisos

Los turnos corren con `--dangerously-skip-permissions`, porque en modo headless las CLIs no pueden preguntar. El agente puede leer, escribir y ejecutar comandos en el workspace sin confirmación.

## Limitaciones conocidas

- Antigravity tiene un solo inicio de sesión. Las carpetas `.gemini-*` no guardan credenciales: son etiquetas, y quitarlas no cierra ninguna sesión.
- Copilot no reporta tokens; su uso es una estimación.

## Licencia

MIT © [Juan Cuervo](https://github.com/0103juan)
