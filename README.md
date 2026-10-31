# AgentHub — Multi-Subscription & MCP Orchestrator for VS Code

[![Node.js Tests](https://img.shields.io/badge/tests-11%20passed-brightgreen.svg)](#-suite-de-pruebas-automatizadas)
[![Zero API Keys](https://img.shields.io/badge/API%20Keys-%240.00%20Zero%20Token%20Costs-blue.svg)](#-arquitectura-cero-api-keys)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-v0.1.0-blueviolet.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](#)

**AgentHub** es una extensión profesional y panel de control para Visual Studio Code diseñada para orquestar tus suscripciones de pago (**Claude Pro / Team**, **Google Antigravity / Gemini**, **VS Code Language Model API**) **sin pagar por API keys ni cobros por token**.

Permite aprovechar al 100% las ventanas de contexto y cuotas ilimitadas/pro de tus herramientas CLI locales (`claude`, `agy.exe`, `gemini`, `code`), sincronizar servidores MCP automáticamente y aplicar un estricto protocolo de ingeniería de software por roles.

---

## 🎯 Capacidades Principales

### 1. 🔑 Arquitectura Cero API Keys (CLI Subscriptions)
* **Claude Multi-Cuenta:** Alterna instantáneamente entre tu cuenta principal (`~/.claude`) y cuentas secundarias (`~/.claude-profile-2` con `CLAUDE_CONFIG_DIR`) para multiplicar tu cuota sin pagar excedentes.
* **Google Antigravity / Gemini CLI:** Ejecución directa a través del binario local `agy.exe` autenticado con tu cuenta de Google.
* **Control de Esfuerzo Dinámico (Reasoning Effort):** Ajusta entre `Bajo`, `Medio`, `Alto` y `Max` en tiempo real, sincronizando automáticamente con el modelo seleccionado (e.g. Gemini 3.8 Flash High vs Claude 3.7 Sonnet).

### 2. 🛡️ Protocolo de Desarrollo por Roles
Garantiza disciplina de ingeniería en cada prompt mediante prompts de sistema estructurados:
* **Libre:** Chat interactivo sin restricciones.
* **Explorador:** Análisis de arquitectura y lectura profunda sin modificar archivos.
* **Arquitecto:** Diseño técnico, diagramas C4 y especificaciones `.agent-spec.md`.
* **Tester:** Generación de suites de prueba, cobertura y TIA (Test Impact Analysis).
* **Desarrollador:** Implementación de cambios atómicos y refactorizaciones limpias.
* **Revisor:** Auditoría estricta de estilo, rendimiento y seguridad antes del merge.
* **Externo:** Validación de contratos, dependencias y llamadas a servicios externos.
* **Documentador:** Changelogs interactivos, ADRs y manuales operativos.

### 3. ⚡ Barra de Herramientas DevOps & Protocolo
Acciones rápidas con un solo clic directamente desde el chat:
* **⚡ Test Stack:** Ejecuta automáticamente `verificar.sh`, `npm test`, `gradle test` o `pytest`.
* **⚡ Tests de Impacto (TIA):** Detecta los archivos modificados en Git y corre únicamente los tests afectados.
* **🌿 Worktrees Aislados:** Crea ramas de trabajo independientes sin ensuciar tu working tree principal.
* **🔒 Escáner de Secretos:** Detección en diffs de claves de OpenAI, Anthropic, GitHub, Google y AWS.
* **🛡️ Guardián de BD & Profiler SQL:** Bloquea sentencias destructivas (`DROP TABLE`, `TRUNCATE`) y audita `SELECT *` o búsquedas sin índice.
* **🎭 Anonimizador PII (GDPR):** Ofusca emails, números de tarjetas de crédito y tokens JWT antes del envío.
* **🐳 Docker Compose:** Control de contenedores (`up`, `down`, `logs`) integrado.
* **🗺️ Diagramas Mermaid & C4:** Visualización gráfica de flujos y arquitectura.

### 4. 🔄 MCP Switchboard & Auto-Sync
* Detecta en tiempo real todos los servidores MCP instalados en tu sistema (Postman, Atlassian, Google Drive, PostgreSQL, Playwright, etc.).
* Sincronización bidireccional automática entre perfiles de Claude y Google Antigravity.

---

## 🧪 Suite de Pruebas Automatizadas

El proyecto cuenta con un arnés de pruebas unitarias exhaustivas con el runner nativo de Node.js (`node:test` + `node:assert`):

```bash
npm test
```

### Resultados de la Suite (11/11 Pasados):
* **Suite 1: SessionStorage & Persistence Engine:** Creación de sesión, sincronización bidireccional de perfil/modelo/esfuerzo y acumulación de telemetría de tokens/turnos.
* **Suite 2: Protocol Roles Specification:** Validación de los 7 roles y sus directivas de sistema.
* **Suite 3: Seguridad & Escáner de Secretos:** Detección de claves de Anthropic, GitHub, Google y AWS en código fuente.
* **Suite 4: Guardián de BD & Auditoría de Migraciones:** Detección y bloqueo de DDL destructivo.
* **Suite 5: Profiler SQL:** Detección de anti-patrones SQL (`SELECT *`, `JOIN` sin `ON`, comodines iniciales).
* **Suite 6: Anonimizador PII (GDPR Sanitizer):** Reemplazo seguro de información confidencial.

---

## 🚀 Instalación y Desarrollo Local

### Requisitos
* **Node.js** v18+ y **npm**
* **Visual Studio Code** 1.85+
* Herramientas CLI opcionales según tus suscripciones:
  * `claude` (Claude Code CLI: `npm i -g @anthropic-ai/claude-code`)
  * `agy` (Google Antigravity CLI)

### Compilación y Ejecución
1. Clona el repositorio e instala dependencias:
   ```bash
   git clone https://github.com/0103juan/agent-hub.git
   cd agent-hub
   npm install
   ```

2. Compila el frontend Webview y el backend de la extensión:
   ```bash
   npm run build
   ```

3. Presiona `F5` en VS Code para lanzar el entorno de depuración `[Extension Development Host]`.

4. Haz clic en el ícono de **AgentHub** en la barra de actividades de VS Code.

---

## 📁 Estructura del Código

```text
agent-hub/
├── src/
│   ├── extension.ts                   # Entry point de VS Code y Message Bridge
│   ├── orchestrator/
│   │   ├── cli-runner.ts             # Ejecución streaming (Claude, Antigravity, Gemini)
│   │   ├── session-manager.ts        # Detección de cuentas, perfiles y CLI health
│   │   ├── session-storage.ts        # Persistencia local JSON de sesiones y cuotas
│   │   ├── mcp-syncer.ts             # Sincronización multi-directorio de MCPs
│   │   └── protocol-roles.ts         # Definición de roles del protocolo de ingeniería
│   └── webview/
│       ├── App.tsx                   # Aplicación React principal
│       ├── components/
│       │   ├── ChatCanvas.tsx        # Área de chat, streaming, toolbars e inputs
│       │   ├── Header.tsx            # Selector de perfiles, modelos y esfuerzo de razonamiento
│       │   ├── TelemetryBar.tsx      # Métricas de cuota y ventana de uso en tiempo real
│       │   └── MCPManager.tsx        # Dashboard de servidores MCP
│       └── main.tsx                  # Bootstrap React Webview
├── tests/
│   └── exhaustive.test.ts            # Suite exhaustiva de pruebas unitarias
├── package.json                      # Configuración de extensión y scripts de build
├── vite.config.ts                    # Build pipeline del Webview (IIFE bundle)
└── README.md
```

---

## 📄 Licencia

MIT © [Juan Cuervo](https://github.com/0103juan)
