export interface QuestionOptions {
  question: string;
  options: string[];
  selected?: string;
}

export function isQuestionPrompt(text?: string): boolean {
  if (!text) return false;
  const clean = text.trim();
  // Descartar listas, viñetas, reportes o encabezados que no sean preguntas
  if (/^[-*+>]/.test(clean)) return false;
  if (/^(build|compilaci[oó]n|verificaci[oó]n|resumen|status|error|test|prueba)\b/i.test(clean)) return false;

  // Debe tener signo de interrogación explícito O empezar con palabra interrogativa directa
  const hasQuestionMark = clean.includes('?') || clean.includes('¿');
  const hasQuestionKeyword = /\b(elige|selecciona|cu[aá]l|cu[aá]les|qu[eé]\s+(opci[oó]n|deseas|prefieres)|c[oó]mo\s+(deseas|prefieres)|prefieres|deseas|choose|select|which\s+one|pick)\b/i.test(clean);

  return hasQuestionMark || hasQuestionKeyword;
}

/**
 * Detecta si el texto del asistente termina proponiendo una lista de entre 2 y 5 opciones numeradas
 * para que el usuario pueda aprobar una de ellas directamente o ingresar una opción personalizada.
 * Excluye listas informativas, listas de archivos, tutoriales o listas con más de 5 elementos.
 */
export function extractQuestionOptions(content?: string): QuestionOptions | undefined {
  if (!content) return undefined;
  const lines = content.split('\n');
  const optionRegex = /^\s*(?:(\d+)[\.\)]|\((\d+)\))\s+(.+)$/;
  let bestQuestion = '';
  let bestItems: string[] = [];
  let currentItems: string[] = [];
  let currentQuestion = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(optionRegex);
    if (match) {
      const num = parseInt(match[1] || match[2], 10);
      const text = match[3].trim().replace(/\*+/g, '');
      if (num === 1) {
        currentQuestion = '';
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j].trim();
          if (prev) {
            // Si la línea anterior es una viñeta (- item), NO es una pregunta introductoria
            if (/^[-*+>]/.test(prev)) break;
            currentQuestion = prev.replace(/^#{1,4}\s*/, '').replace(/\*+/g, '').trim();
            break;
          }
        }
        if (isQuestionPrompt(currentQuestion)) {
          currentItems = [text];
        } else {
          currentItems = [];
        }
      } else if (currentItems.length > 0 && num === currentItems.length + 1) {
        if (num <= 5) {
          currentItems.push(text);
          if (currentItems.length >= 2) {
            bestItems = [...currentItems];
            bestQuestion = currentQuestion;
          }
        } else {
          // Si la lista supera las 5 opciones, es una lista informativa y no una pregunta
          currentItems = [];
          if (bestQuestion === currentQuestion) {
            bestItems = [];
            bestQuestion = '';
          }
        }
      } else {
        currentItems = [];
      }
    }
  }

  if (bestItems.length >= 2 && bestItems.length <= 5 && isQuestionPrompt(bestQuestion)) {
    // Descartar si los ítems son rutas de archivos o logs
    const isFileList = bestItems.some((item) => /`?dist[\\/]|\.js`?|\.ts`?|\.json`?/i.test(item));
    if (isFileList) return undefined;

    return {
      question: bestQuestion,
      options: bestItems
    };
  }
  return undefined;
}
