import { AccountProfile, ModelOption, ProviderType } from '../../shared/types';
import { AgentEvent, AgentProvider, AgentRun, AgentTurnRequest, TurnOutcome } from '../agent-provider';

const OLLAMA_HOST = 'http://localhost:11434';

export class OllamaProvider implements AgentProvider {
  public readonly type: ProviderType = 'ollama';

  public async discoverAccounts(): Promise<AccountProfile[]> {
    try {
      const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
        signal: AbortSignal.timeout(1500)
      });
      if (!res.ok) return [];
      const json: any = await res.json();
      const models: ModelOption[] = (json.models || []).map((m: any) => ({
        id: m.name,
        label: `${m.name} (${Math.round((m.size || 0) / (1024 * 1024 * 1024))}GB)`,
        efforts: []
      }));

      if (models.length === 0) return [];

      return [
        {
          id: 'ollama-local',
          name: 'Ollama (Local / Sin API key)',
          provider: 'ollama',
          status: 'connected',
          models
        }
      ];
    } catch {
      return [];
    }
  }

  public startTurn(request: AgentTurnRequest, onEvent: (event: AgentEvent) => void): AgentRun {
    const controller = new AbortController();

    const outcome = (async (): Promise<TurnOutcome> => {
      try {
        const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: request.modelId,
            messages: [{ role: 'user', content: request.prompt }],
            stream: true
          }),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          return { status: 'failed', error: `Ollama respondió con error HTTP ${response.status}.` };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf8');
        let buffer = '';
        let totalOutputTokens = 0;
        let totalInputTokens = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const chunk = JSON.parse(trimmed);
              if (chunk.message?.content) {
                onEvent({ kind: 'text', text: chunk.message.content });
              }
              if (chunk.prompt_eval_count) totalInputTokens = chunk.prompt_eval_count;
              if (chunk.eval_count) totalOutputTokens = chunk.eval_count;
            } catch {}
          }
        }

        onEvent({
          kind: 'usage',
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
        });

        return { status: 'completed' };
      } catch (err: any) {
        if (controller.signal.aborted) {
          return { status: 'cancelled' };
        }
        return { status: 'failed', error: err?.message || 'Error comunicando con Ollama.' };
      }
    })();

    return {
      outcome,
      cancel: () => controller.abort()
    };
  }

  public openLogin(): void {}
  public describeLogout(): undefined { return undefined; }
  public async logout(): Promise<void> {}
  public addAccount(): void {}
}
