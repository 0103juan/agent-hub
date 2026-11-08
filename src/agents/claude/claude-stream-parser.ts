import { AgentEvent } from '../agent-provider';
import { StreamParser } from '../cli-process';
import { describeToolCall } from '../tool-activity';

/** Interpreta `claude -p --output-format=stream-json --include-partial-messages`. */
export class ClaudeStreamParser implements StreamParser {
  private hasText = false;
  private streamedCurrentMessage = false;
  private streamedThinking = false;
  private sessionId?: string;

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
    if (json.session_id && json.session_id !== this.sessionId) {
      this.sessionId = json.session_id;
      events.push({ kind: 'resumeId', id: json.session_id });
    }

    switch (json.type) {
      case 'stream_event':
        events.push(...this.parseStreamEvent(json.event));
        break;
      case 'assistant':
        events.push(...this.parseAssistantMessage(json.message));
        break;
      case 'rate_limit_event':
        events.push(...this.parseRateLimit(json.rate_limit_info));
        break;
      case 'result':
        events.push(...this.parseResult(json));
        break;
    }
    return events;
  }

  private parseStreamEvent(event: any): AgentEvent[] {
    if (event?.type === 'content_block_start' && event.content_block?.type === 'text' && this.hasText) {
      return [{ kind: 'text', text: '\n\n' }];
    }
    if (event?.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
      this.streamedThinking = true;
      return [{ kind: 'thinking', text: event.delta.thinking ?? '' }];
    }
    if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      this.hasText = true;
      this.streamedCurrentMessage = true;
      return [{ kind: 'text', text: event.delta.text }];
    }
    return [];
  }

  private parseAssistantMessage(message: any): AgentEvent[] {
    const events: AgentEvent[] = [];
    for (const block of message?.content ?? []) {
      if (block.type === 'tool_use') {
        events.push({ kind: 'activity', label: describeToolCall(block.name, block.input) });
        const isQuestionTool = block.name === 'ask_question' || block.name === 'AskUserQuestion' || block.name === 'AskFollowupQuestion' || block.name === 'ask_followup_question';
        if (isQuestionTool && block.input) {
          const first = block.input.questions?.[0] ?? block.input;
          const questionText = first.question || block.input.question || 'Selecciona una opción:';
          const rawOptions = first.options || block.input.options;
          if (Array.isArray(rawOptions) && rawOptions.length > 0) {
            events.push({
              kind: 'question',
              question: questionText,
              options: rawOptions.slice(0, 5).map((opt: any) => (typeof opt === 'string' ? opt : opt.label || JSON.stringify(opt)))
            });
          }
        }
      } else if (block.type === 'thinking' && block.thinking && !this.streamedThinking) {
        events.push({ kind: 'thinking', text: block.thinking });
      } else if (block.type === 'text' && block.text && !this.streamedCurrentMessage) {
        // Los mensajes sintéticos de la CLI no pasan por stream_event.
        this.hasText = true;
        events.push({ kind: 'text', text: block.text });
      }
    }
    this.streamedCurrentMessage = false;
    this.streamedThinking = false;
    return events;
  }

  private parseRateLimit(info: any): AgentEvent[] {
    if (!info) return [];
    const windows = info.unifiedWindows ?? {};
    return [
      {
        kind: 'quota',
        quota: {
          weeklyUtilization: windows.seven_day?.utilization,
          fiveHourUtilization: windows.five_hour?.utilization,
          weeklyResetsAt: windows.seven_day?.resetsAt,
          fiveHourResetsAt: windows.five_hour?.resetsAt
        }
      }
    ];
  }

  private parseResult(json: any): AgentEvent[] {
    const events: AgentEvent[] = [
      {
        kind: 'usage',
        usage: {
          inputTokens: json.usage?.input_tokens,
          outputTokens: json.usage?.output_tokens,
          thinkingTokens: json.usage?.output_tokens_details?.thinking_tokens,
          cacheReadTokens: json.usage?.cache_read_input_tokens,
          cacheCreationTokens: json.usage?.cache_creation_input_tokens,
          costUSD: json.total_cost_usd
        }
      }
    ];
    if (json.is_error) {
      events.push({ kind: 'error', message: json.result || json.errors?.[0] || `Claude terminó con error (${json.subtype ?? 'desconocido'}).` });
    } else if (json.result && !this.hasText) {
      this.hasText = true;
      events.push({ kind: 'text', text: json.result });
    }
    events.push({ kind: 'turnEnd' });
    return events;
  }
}
