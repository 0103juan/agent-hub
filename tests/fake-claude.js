// CLI simulada de Claude para las pruebas de punta a punta: habla stream-json por stdin/stdout.
// Palabras clave en el mensaje: COLGAR (no responde), CUOTA (error de cuota), ESCRIBIR <archivo> (crea un archivo).
const fs = require('fs');
const path = require('path');

if (process.env.FAKE_CLAUDE_LOG) {
  fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(process.argv.slice(2)) + '\n');
}

const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n');
const SESSION = 'fake-session';

function handle(message) {
  const content = message.message && message.message.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  if (text.includes('COLGAR')) return;
  const write = /ESCRIBIR (\S+)/.exec(text);
  if (write) fs.writeFileSync(path.join(process.cwd(), write[1]), 'escrito por la CLI simulada');
  if (text.includes('CUOTA')) {
    emit({ type: 'result', session_id: SESSION, is_error: true, result: 'Claude usage limit reached' });
    return;
  }
  emit({
    type: 'stream_event',
    session_id: SESSION,
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hola desde la CLI simulada.' } }
  });
  emit({ type: 'result', session_id: SESSION, total_cost_usd: 0.01, usage: { input_tokens: 5, output_tokens: 7 } });
}

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
});
process.stdin.on('end', () => process.exit(0));
