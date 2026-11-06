import { TurnUsage } from '../../shared/types';
import { AgentEvent } from '../agent-provider';
import { StreamParser } from '../cli-process';
import { describeToolCall } from '../tool-activity';

/** Interpreta `agy --output-format stream-json`. */
export class AntigravityStreamParser implements StreamParser {
  private hasText = false;
  private lastTextStep?: number;
  private conversationId?: string;
  // result.usage acumula toda la conversación; el turno es la suma de sus pasos.
  private turnUsage: Required<Pick<TurnUsage, 'inputTokens' | 'outputTokens' | 'thinkingTokens' | 'cacheReadTokens'>> = {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheReadTokens: 0
  };

  public parseLine(line: string): AgentEvent[] {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return [];
    let json: any;
    try {
      json = JSON.parse(trimmed);
    } catch {
      return [];
    }

    const events: AgentEvent[] = [];
    const conversationId = json.conversation_id ?? json.step_update?.conversation_id ?? json.result?.conversation_id;
    if (conversationId && conversationId !== this.conversationId) {
      this.conversationId = conversationId;
      events.push({ kind: 'resumeId', id: conversationId });
    }

    if (json.event === 'step_update' && json.step_update) {
      events.push(...this.parseStep(json.step_update));
    } else if (json.event === 'result' && json.result) {
      events.push(...this.parseResult(json.result));
    }
    return events;
  }

  private parseStep(step: any): AgentEvent[] {
    const events: AgentEvent[] = [];
    if (step.step_type === 'tool' && step.state === 'ACTIVE') {
      events.push({ kind: 'activity', label: describeToolCall(step.tool_name, step.tool_info?.parameters) });
      if (step.tool_name === 'ask_question' && step.tool_info?.parameters?.questions) {
        const first = step.tool_info.parameters.questions[0];
        if (first && Array.isArray(first.options) && first.options.length > 0) {
          events.push({
            kind: 'question',
            question: first.question ?? 'Selecciona una opción:',
            options: first.options.slice(0, 5)
          });
        }
      }
    }
    if (step.text_delta) {
      if (this.hasText && this.lastTextStep !== step.step_index) {
        events.push({ kind: 'text', text: '\n\n' });
      }
      this.hasText = true;
      this.lastTextStep = step.step_index;
      events.push({ kind: 'text', text: step.text_delta });
    }
    if (step.usage) {
      this.turnUsage.inputTokens += step.usage.input_tokens ?? 0;
      this.turnUsage.outputTokens += step.usage.output_tokens ?? 0;
      this.turnUsage.thinkingTokens += step.usage.thinking_tokens ?? 0;
      this.turnUsage.cacheReadTokens += step.usage.cache_read_tokens ?? 0;
    }
    return events;
  }

  private parseResult(result: any): AgentEvent[] {
    const events: AgentEvent[] = [{ kind: 'usage', usage: { ...this.turnUsage } }];
    if (result.response && !this.hasText) {
      this.hasText = true;
      events.push({ kind: 'text', text: result.response });
    }
    const denied: any[] = result.denied_actions ?? [];
    if (denied.length > 0) {
      const names = denied.map((d) => d.display_name ?? d.action).join(', ');
      events.push({ kind: 'error', message: `El agente necesitó permisos que no se concedieron: ${names}.` });
    } else if (result.status && result.status !== 'SUCCESS') {
      events.push({ kind: 'error', message: `Antigravity terminó con estado ${result.status}.` });
    }
    events.push({ kind: 'turnEnd' });
    return events;
  }
}
