export interface QuestionOptions {
  question: string;
  options: string[];
  selected?: string;
}

/**
 * Detecta si el texto del asistente termina proponiendo una lista de entre 2 y 5 opciones numeradas
 * para que el usuario pueda aprobar una de ellas directamente o ingresar una opción personalizada.
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
        currentItems = [text];
        currentQuestion = '';
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j].trim();
          if (prev) {
            currentQuestion = prev.replace(/^#{1,4}\s*/, '').replace(/\*+/g, '');
            break;
          }
        }
      } else if (num === currentItems.length + 1 && num <= 5) {
        currentItems.push(text);
      }
      if (currentItems.length >= 2 && currentItems.length <= 5) {
        bestItems = [...currentItems];
        bestQuestion = currentQuestion;
      }
    }
  }

  if (bestItems.length >= 2 && bestItems.length <= 5) {
    return {
      question: bestQuestion || 'Selecciona una opción para continuar:',
      options: bestItems
    };
  }
  return undefined;
}
