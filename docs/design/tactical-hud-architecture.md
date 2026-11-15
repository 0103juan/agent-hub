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

---

## 3. Archivos de Referencia y Verificación
- **Prototipo HTML/CSS/JS Interactivo:** [command-center-redesign.html](file:///C:/Users/juan0/Documents/GitHub/portafolio/agent-hub/docs/design/command-center-redesign.html)
- **Suite de Pruebas:** 198/198 pruebas unitarias superadas (`0` fallos).
- **Compilación de Producción:** `npm run build` completado exitosamente.
