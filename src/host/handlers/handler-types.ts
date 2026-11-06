import { WebviewCommand, WebviewMessage } from '../../shared/ipc';

export type HandlerMap<C extends WebviewCommand = WebviewCommand> = {
  [K in C]: (message: Extract<WebviewMessage, { command: K }>) => void | Promise<void>;
};
