import { WebviewMessage } from '../shared/ipc';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const api = typeof acquireVsCodeApi === 'function'
  ? acquireVsCodeApi()
  : { postMessage: (message: unknown) => console.log('postMessage', message) };

export function postToHost(message: WebviewMessage): void {
  api.postMessage(message);
}
