import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { FileContextAttachment, ReasoningEffort, SessionTelemetry, ProtocolRole } from './types';
import { PROTOCOL_ROLES } from './protocol-roles';

export interface RunCallbacks {
  onChunk: (text: string) => void;
  onSessionId?: (sessionId: string) => void;
  onTelemetry?: (telemetry: SessionTelemetry) => void;
  onDone: (fullText: string, telemetry?: SessionTelemetry, sessionId?: string) => void;
  onError: (err: string) => void;
  onFallback?: (fromProfile: string, toProfile: string, reason: string) => void;
}

export class CLIRunner {
  private currentProcess: ChildProcess | null = null;
  private homeDir: string;
  private agyBinaryPath: string;

  constructor() {
    this.homeDir = os.homedir();
    this.agyBinaryPath = path.join(this.homeDir, '.gemini', 'bin', 'agy.exe');
  }

  public abort(): void {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGTERM');
      } catch {}
      this.currentProcess = null;
    }
  }

  public runPrompt(
    profileId: string,
    prompt: string,
    workspaceDir: string,
    cliSessionId: string | undefined,
    attachments: FileContextAttachment[] | undefined,
    effort: ReasoningEffort,
    modelName: string | undefined,
    protocolRole: ProtocolRole | undefined,
    callbacks: RunCallbacks
  ): void {
    this.abort();

    let enrichedPrompt = prompt;

    // Inyectar el rol del protocolo de desarrollo si está activo
    if (protocolRole && PROTOCOL_ROLES[protocolRole]) {
      const roleConfig = PROTOCOL_ROLES[protocolRole];
      enrichedPrompt = `[INSTRUCCIÓN DEL ROL: ${roleConfig.label.toUpperCase()}]\n${roleConfig.systemPrompt}\n\n${enrichedPrompt}`;
    }

    if (attachments && attachments.length > 0) {
      const contextBlocks = attachments.map((att) => {
        if (att.mediaType === 'image') {
          return `\n---\n[IMAGEN ADJUNTA]: "${att.file}"\nRuta local: ${att.fsPath || att.file}\n(Por favor inspecciona y analiza esta imagen como parte de la instrucción)\n---`;
        }
        if (att.mediaType === 'audio') {
          return `\n---\n[AUDIO ADJUNTO]: "${att.file}"\nRuta local: ${att.fsPath || att.file}\n(Por favor analiza el contenido de este archivo de audio/voz)\n---`;
        }
        if (att.mediaType === 'video') {
          return `\n---\n[VIDEO ADJUNTO]: "${att.file}"\nRuta local: ${att.fsPath || att.file}\n(Por favor analiza el contenido de este archivo de video/grabación)\n---`;
        }
        const header = att.lines ? `Archivo: \`${att.file}#${att.lines}\`` : `Archivo: \`${att.file}\``;
        const lang = att.language || '';
        return `\n---\n${header}\n\`\`\`${lang}\n${att.content}\n\`\`\`\n---`;
      }).join('\n');

      enrichedPrompt = `Contexto del workspace y archivos multimedia adjuntos:\n${contextBlocks}\n\nInstrucción:\n${prompt}`;
    }

    if (profileId.startsWith('google') || profileId === 'chatgpt-free') {
      const model = profileId === 'chatgpt-free' ? 'gpt-oss-120b-medium' : (modelName || 'gemini-3.8-flash-high');
      
      let configDir = path.join(this.homeDir, '.gemini');
      if (profileId.startsWith('google-') && profileId !== 'google-main') {
        const slug = profileId.replace('google-', '');
        configDir = path.join(this.homeDir, `.gemini-${slug}`);
      }
      this.runAgy(enrichedPrompt, workspaceDir, model, cliSessionId, effort, configDir, callbacks);
    } else {
      let configDir = path.join(this.homeDir, '.claude');
      if (profileId.includes('profile-2')) {
        configDir = path.join(this.homeDir, '.claude-profile-2');
      } else if (profileId.startsWith('claude-') && profileId !== 'claude-main') {
        const folderName = profileId.replace('claude-', '.claude-');
        configDir = path.join(this.homeDir, folderName);
      }
      this.runClaude(enrichedPrompt, configDir, workspaceDir, profileId, cliSessionId, effort, callbacks, modelName);
    }
  }

  private runClaude(
    prompt: string,
    configDir: string,
    workspaceDir: string,
    profileId: string,
    cliSessionId: string | undefined,
    effort: ReasoningEffort,
    callbacks: RunCallbacks,
    modelName?: string
  ): void {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
    const args = [
      '-p', '-',
      '--output-format=stream-json',
      '--verbose',
      '--dangerously-skip-permissions'
    ];

    if (modelName) {
      args.push('--model', modelName);
    }

    if (cliSessionId) {
      args.push('--resume', cliSessionId);
    }

    const child = spawn('claude', args, {
      cwd: workspaceDir,
      env,
      shell: true
    });
    this.currentProcess = child;

    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    let fullText = '';
    let buffer = '';
    let rateLimitExceeded = false;
    let latestTelemetry: SessionTelemetry = {};
    let activeSessionId = cliSessionId;

    child.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('{')) continue;

        try {
          const json = JSON.parse(trimmed);

          // Capturar session_id para continuidad
          if (json.session_id) {
            activeSessionId = json.session_id;
            if (callbacks.onSessionId) {
              callbacks.onSessionId(json.session_id);
            }
          }

          // 1. Chunks de respuesta del modelo
          if (json.type === 'assistant' && json.message?.content) {
            for (const item of json.message.content) {
              if (item.type === 'text' && item.text) {
                fullText += item.text;
                callbacks.onChunk(item.text);
              }
            }
          }

          // 2. Telemetría de Rate Limit en tiempo real (Ventana 5h y Semanal)
          if (json.type === 'rate_limit_event' && json.rate_limit_info) {
            const info = json.rate_limit_info;
            const windows = info.unifiedWindows || {};
            
            latestTelemetry = {
              ...latestTelemetry,
              weeklyUtilization: windows.seven_day?.utilization ?? info.utilization ?? 0,
              fiveHourUtilization: windows.five_hour?.utilization ?? 0,
              weeklyResetsAt: windows.seven_day?.resetsAt ?? info.resetsAt,
              fiveHourResetsAt: windows.five_hour?.resetsAt
            };

            if (latestTelemetry.weeklyUtilization && latestTelemetry.weeklyUtilization >= 1.0) {
              rateLimitExceeded = true;
            }

            if (callbacks.onTelemetry) {
              callbacks.onTelemetry(latestTelemetry);
            }
          }

          // 3. Resultados finales con tokens y costo en USD
          if (json.type === 'result') {
            if (json.result && !fullText) {
              fullText = json.result;
              callbacks.onChunk(json.result);
            }

            latestTelemetry = {
              ...latestTelemetry,
              lastCostUSD: json.total_cost_usd,
              inputTokens: json.usage?.input_tokens,
              outputTokens: json.usage?.output_tokens,
              thinkingTokens: json.usage?.output_tokens_details?.thinking_tokens ?? 0,
              cacheReadTokens: json.usage?.cache_read_input_tokens ?? 0,
              cacheCreationTokens: json.usage?.cache_creation_input_tokens ?? 0
            };

            if (callbacks.onTelemetry) {
              callbacks.onTelemetry(latestTelemetry);
            }
          }
        } catch {}
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('overage')) {
        rateLimitExceeded = true;
      }
    });

    child.on('close', () => {
      this.currentProcess = null;

      if (rateLimitExceeded && profileId === 'claude-main') {
        if (callbacks.onFallback) {
          callbacks.onFallback('claude-main', 'google-main', 'Límite semanal alcanzado en Claude');
        }
      }

      callbacks.onDone(fullText, latestTelemetry, activeSessionId);
    });

    child.on('error', (err) => {
      this.currentProcess = null;
      callbacks.onError(err.message);
    });
  }

  private runAgy(
    prompt: string,
    workspaceDir: string,
    modelName: string,
    cliSessionId: string | undefined,
    effort: ReasoningEffort,
    configDir: string,
    callbacks: RunCallbacks
  ): void {
    const args = [
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions'
    ];

    // Evitar conflicto: si el modelName ya contiene sufijo de esfuerzo (-high, -medium, -low, -xhigh, -max),
    // no pasar el flag --effort porque agy.exe genera error fatal de conflicto de modelo
    const hasEffortSuffix =
      modelName &&
      (modelName.endsWith('-high') ||
        modelName.endsWith('-medium') ||
        modelName.endsWith('-low') ||
        modelName.endsWith('-xhigh') ||
        modelName.endsWith('-max'));

    if (!hasEffortSuffix && effort) {
      args.push('--effort', effort);
    }

    if (cliSessionId) {
      args.push('--conversation', cliSessionId);
    }

    if (modelName) {
      args.push('--model', modelName);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ANTIGRAVITY_GEMINI_DIR: configDir,
      ANTIGRAVITY_APP_DATA_DIR: path.join(configDir, 'antigravity')
    };

    // Usar shell: false para que los argumentos no sean alterados por cmd.exe y pasar el prompt por stdin
    const child = spawn(this.agyBinaryPath, args, {
      cwd: workspaceDir,
      shell: false,
      env
    });
    this.currentProcess = child;

    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    let fullText = '';
    let buffer = '';
    let stderrData = '';
    let latestTelemetry: SessionTelemetry = {};
    let activeSessionId = cliSessionId;

    child.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('{')) continue;

        try {
          const json = JSON.parse(trimmed);

          if (json.event === 'init' && json.conversation_id) {
            activeSessionId = json.conversation_id;
            if (callbacks.onSessionId) {
              callbacks.onSessionId(json.conversation_id);
            }
          }

          if (json.event === 'step_update' && json.step_update) {
            const step = json.step_update;
            if (step.text_delta) {
              fullText += step.text_delta;
              callbacks.onChunk(step.text_delta);
            }
            if (step.usage) {
              latestTelemetry = {
                ...latestTelemetry,
                inputTokens: step.usage.input_tokens,
                outputTokens: step.usage.output_tokens,
                thinkingTokens: step.usage.thinking_tokens ?? 0,
                cacheReadTokens: step.usage.cache_read_tokens ?? 0
              };
              if (callbacks.onTelemetry) {
                callbacks.onTelemetry(latestTelemetry);
              }
            }
          }

          if (json.event === 'result' && json.result) {
            const res = json.result;
            if (res.conversation_id) {
              activeSessionId = res.conversation_id;
              if (callbacks.onSessionId) {
                callbacks.onSessionId(res.conversation_id);
              }
            }
            if (res.response && !fullText) {
              fullText = res.response;
              callbacks.onChunk(res.response);
            }
            if (res.usage) {
              latestTelemetry = {
                ...latestTelemetry,
                inputTokens: res.usage.input_tokens,
                outputTokens: res.usage.output_tokens,
                thinkingTokens: res.usage.thinking_tokens ?? 0,
                cacheReadTokens: res.usage.cache_read_tokens ?? 0
              };
              if (callbacks.onTelemetry) {
                callbacks.onTelemetry(latestTelemetry);
              }
            }
          }
        } catch {}
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      stderrData += data.toString();
    });

    child.on('close', (code: number | null) => {
      this.currentProcess = null;

      if (!fullText && code !== 0 && stderrData) {
        const errorMsg = stderrData.trim();
        callbacks.onError(errorMsg);
        return;
      }

      callbacks.onDone(fullText, latestTelemetry, activeSessionId);
    });

    child.on('error', (err) => {
      this.currentProcess = null;
      callbacks.onError(err.message);
    });
  }
}
