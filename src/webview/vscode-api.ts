import { HostMessage, WebviewMessage } from '../shared/ipc';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const hasVsCodeApi = typeof acquireVsCodeApi === 'function';

/**
 * El host habla desde esta ventana (SSE) o desde un marco ancestro (VS Code anida el panel en varios iframes).
 * Un iframe de vista previa ejecuta HTML del modelo y no debe poder fingir mensajes del host (adjuntos, texto,
 * estado), así que se rechaza todo remitente que sea descendiente de esta ventana, a cualquier profundidad.
 */
export function isFromHost(source: unknown, win: { parent: unknown }): boolean {
  let frame = source as { parent?: unknown } | null | undefined;
  for (let depth = 0; frame && depth < 32; depth++) {
    if (frame === win) return depth === 0; // la propia ventana (SSE); un descendiente llega aquí con depth > 0
    if (frame.parent === frame) break; // ventana superior: no desciende de esta
    frame = frame.parent as { parent?: unknown } | undefined;
  }
  return true;
}

const vsCodeApi = hasVsCodeApi ? acquireVsCodeApi() : null;

// En modo navegador externo / PWA: nos conectamos al servidor SSE y enviamos mensajes vía HTTP POST
if (!hasVsCodeApi && typeof window !== 'undefined') {
  let eventSource: EventSource | null = null;

  const connectSSE = () => {
    try {
      eventSource = new EventSource('/events');

      eventSource.onopen = () => {
        window.dispatchEvent(new CustomEvent('agenthub:connection', { detail: true }));
        postToHost({ command: 'ready' });
      };

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as HostMessage;
          window.postMessage(message, '*');
        } catch (err) {
          console.error('[AgentHub SSE] Error parsing message', err);
        }
      };

      eventSource.onerror = () => {
        window.dispatchEvent(new CustomEvent('agenthub:connection', { detail: false }));
        eventSource?.close();
        setTimeout(connectSSE, 2000);
      };
    } catch {
      setTimeout(connectSSE, 3000);
    }
  };

  connectSSE();
}

export function isElectron(): boolean {
  return typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
}

export function isStandaloneBrowser(): boolean {
  return !hasVsCodeApi;
}

export function openInVsCode(filePath?: string, line?: number): void {
  const cleanPath = (filePath || '').replace(/\\/g, '/');
  const uri = cleanPath
    ? `vscode://file/${encodeURI(cleanPath)}${line ? `:${line}` : ''}`
    : 'vscode://';
  window.open(uri, '_blank');
}

export function postToHost(message: WebviewMessage): void {
  if (vsCodeApi) {
    vsCodeApi.postMessage(message);
  } else if (typeof fetch === 'function') {
    fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    }).catch((err) => {
      console.warn('[AgentHub Web] Fallo al enviar mensaje al host local:', err);
    });
  }
}
