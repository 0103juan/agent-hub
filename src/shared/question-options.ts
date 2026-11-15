export interface QuestionOptions {
  question: string;
  options: string[];
  selected?: string;
}

export function isQuestionPrompt(text?: string, isHeading?: boolean): boolean {
  if (!text) return false;
  const clean = text.trim();
  // Encabezados markdown (# o ###) o viñetas nunca son preguntas interactivas
  if (isHeading || /^#{1,6}\s/.test(text) || /^[-*+>]/.test(clean)) return false;
  if (/^(build|compilaci[oó]n|verificaci[oó]n|resumen|status|error|test|prueba|archivos|cambios|pasos)\b/i.test(clean)) return false;

  // Preguntas explicativas o retóricas que son títulos/secciones y NO piden interacción
  if (/^¿?\s*(c[oó]mo\s+(funciona|usar|probar|instalar|verificar|trabaja|opera)|por\s*qu[eé]|en\s+qu[eé]\s+consiste|qu[eé]\s+(es|cambi[oó]|se\s+hizo|incluye))\b/i.test(clean)) {
    return false;
  }

  // Palabras clave de elección, decisión o petición de indicación dirigida al usuario
  const hasChoiceKeyword =
    /\b(elige|selecciona|cu[aá]l|cu[aá]les|prefieres|deseas|choose|select|which|pick)\b/i.test(clean) ||
    /\b(necesito\s+(saber|confirmar|tu\s+confirmaci[oó]n|una\s+decisi[oó]n|que\s+(me\s+confirmes|elijas|selecciones|indiques|me\s+digas|decidas)))\b/i.test(clean) ||
    /\b(indica|ind[ií]came|dime|confirma)\s+(cu[aá]l|qu[eé]|c[oó]mo|si)\b/i.test(clean) ||
    /\bqu[eé]\s+([a-záéíóúñ]+|\"[^\"]+\")\s+(manda|envía|usa|utiliza|opci[oó]n|deseas|prefieres|camino|hacemos|ruta|id|valor|enfoque|decisi[oó]n|procedimiento)\b/i.test(clean) ||
    /\bc[oó]mo\s+(deseas|prefieres|procedemos|continuamos|hacemos|avanzamos)\b/i.test(clean) ||
    /\bseg[uú]n\s+(eso|esto)\s*:\s*$/i.test(clean) ||
    /\b(opciones|alternativas|decisi[oó]n)\s*:\s*$/i.test(clean);

  const hasQuestionMark = clean.includes('?') || clean.includes('¿');

  return hasChoiceKeyword || (hasQuestionMark && !/funciona|interacci[oó]n|arquitectura\s+del\s+sistema/i.test(clean));
}

/**
 * Detecta si el texto del asistente termina proponiendo una lista de entre 2 y 5 opciones
 * (numeradas o con viñetas) para que el usuario pueda interactuar aprobando una directamente.
 * Excluye listas informativas, listas de archivos, tutoriales, listas con más de 5 elementos,
 * o listas intermedias seguidas de otras secciones.
 */
export function extractQuestionOptions(content?: string): QuestionOptions | undefined {
  if (!content) return undefined;
  const lines = content.split('\n');
  const numberedRegex = /^\s*(?:(\d+)[\.\)]|\((\d+)\))\s+(.+)$/;
  const bulletRegex = /^\s*[-*•]\s+(.+)$/;

  let bestQuestion = '';
  let bestItems: string[] = [];
  let lastOptionLineIndex = -1;

  let currentNumItems: string[] = [];
  let currentNumQuestion = '';
  let lastNumLineIndex = -1;

  let currentBulletItems: string[] = [];
  let currentBulletQuestion = '';
  let lastBulletLineIndex = -1;

  const findPromptBefore = (lineIdx: number): { prompt: string; isHeading: boolean } => {
    let questionLines: string[] = [];
    let isHeading = false;
    for (let j = lineIdx - 1; j >= 0; j--) {
      const prev = lines[j].trim();
      if (!prev) {
        if (questionLines.length > 0) break;
        continue;
      }
      if (/^[-*+>]/.test(prev)) break;
      if (/^#{1,6}\s/.test(prev)) {
        isHeading = true;
        break;
      }
      questionLines.unshift(prev.replace(/^#{1,4}\s*/, '').replace(/\*+/g, '').trim());
      if (questionLines.length >= 2) break;
    }
    const full = questionLines.join(' ');
    const last = questionLines[questionLines.length - 1] || '';
    if (!isHeading) {
      if (isQuestionPrompt(full)) return { prompt: full, isHeading: false };
      if (isQuestionPrompt(last)) return { prompt: last, isHeading: false };
    }
    return { prompt: full || last, isHeading };
  };

  const commitBullet = () => {
    if (currentBulletItems.length >= 2 && currentBulletItems.length <= 5 && isQuestionPrompt(currentBulletQuestion)) {
      bestItems = [...currentBulletItems];
      bestQuestion = currentBulletQuestion;
      lastOptionLineIndex = lastBulletLineIndex;
    }
    currentBulletItems = [];
    currentBulletQuestion = '';
  };

  const commitNum = () => {
    if (currentNumItems.length >= 2 && currentNumItems.length <= 5 && isQuestionPrompt(currentNumQuestion)) {
      bestItems = [...currentNumItems];
      bestQuestion = currentNumQuestion;
      lastOptionLineIndex = lastNumLineIndex;
    }
    currentNumItems = [];
    currentNumQuestion = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const numMatch = line.match(numberedRegex);
    const bulletMatch = line.match(bulletRegex);

    if (numMatch) {
      commitBullet();

      const num = parseInt(numMatch[1] || numMatch[2], 10);
      const text = numMatch[3].trim().replace(/\*+/g, '');

      if (text.endsWith(':')) {
        currentNumItems = [];
        continue;
      }

      if (num === 1) {
        const { prompt, isHeading } = findPromptBefore(i);
        if (!isHeading && isQuestionPrompt(prompt)) {
          currentNumItems = [text];
          currentNumQuestion = prompt;
          lastNumLineIndex = i;
        } else {
          currentNumItems = [];
        }
      } else if (currentNumItems.length > 0 && num === currentNumItems.length + 1) {
        if (num <= 5) {
          currentNumItems.push(text);
          lastNumLineIndex = i;
          if (currentNumItems.length >= 2) {
            bestItems = [...currentNumItems];
            bestQuestion = currentNumQuestion;
            lastOptionLineIndex = i;
          }
        } else {
          currentNumItems = [];
          if (bestQuestion === currentNumQuestion) {
            bestItems = [];
            bestQuestion = '';
          }
        }
      } else {
        currentNumItems = [];
      }
    } else if (bulletMatch) {
      commitNum();

      const text = bulletMatch[1].trim().replace(/\*+/g, '');
      if (text.endsWith(':')) {
        currentBulletItems = [];
        continue;
      }

      if (currentBulletItems.length === 0) {
        const { prompt, isHeading } = findPromptBefore(i);
        if (!isHeading && isQuestionPrompt(prompt)) {
          currentBulletItems = [text];
          currentBulletQuestion = prompt;
          lastBulletLineIndex = i;
        }
      } else {
        if (currentBulletItems.length < 5) {
          currentBulletItems.push(text);
          lastBulletLineIndex = i;
          if (currentBulletItems.length >= 2) {
            bestItems = [...currentBulletItems];
            bestQuestion = currentBulletQuestion;
            lastOptionLineIndex = i;
          }
        } else {
          currentBulletItems = [];
          if (bestQuestion === currentBulletQuestion) {
            bestItems = [];
            bestQuestion = '';
          }
        }
      }
    } else {
      commitBullet();
      commitNum();
    }
  }

  commitBullet();
  commitNum();

  if (bestItems.length >= 2 && bestItems.length <= 5 && isQuestionPrompt(bestQuestion)) {
    // Si después de la lista hay encabezados markdown o mucho contenido adicional, la lista no era la conclusión
    if (lastOptionLineIndex >= 0) {
      const remainingLines = lines.slice(lastOptionLineIndex + 1);
      const hasSubsequentHeadings = remainingLines.some((l) => /^#{1,6}\s/.test(l.trim()));
      const substantiveRemaining = remainingLines.filter((l) => {
        const t = l.trim();
        return t.length > 0 && !/^[-*+>]/.test(t);
      });
      if (hasSubsequentHeadings || substantiveRemaining.length > 4) {
        return undefined;
      }
    }

    // Descartar si los ítems son rutas de archivos, código o logs
    const isFileList = bestItems.some((item) => /`?dist[\\/]|\.js`?|\.ts`?|\.json`?/i.test(item) || item.endsWith(':'));
    if (isFileList) return undefined;

    return {
      question: bestQuestion,
      options: bestItems
    };
  }

  return undefined;
}
