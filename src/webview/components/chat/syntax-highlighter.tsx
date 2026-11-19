import React from 'react';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'class', 'import', 'export', 'from', 'default',
  'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'async', 'await', 'continue',
  'try', 'catch', 'finally', 'throw', 'new', 'typeof', 'instanceof', 'void', 'this', 'yield',
  'interface', 'type', 'enum', 'implements', 'extends', 'as', 'in', 'of', 'debugger',
  'def', 'self', 'elif', 'lambda', 'with', 'pass', 'raise', 'except',
  'fn', 'pub', 'mut', 'impl', 'trait', 'match', 'struct', 'package', 'func', 'go', 'defer',
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'JOIN', 'LEFT', 'RIGHT',
  'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'CREATE', 'TABLE', 'ALTER', 'DROP',
  'HAVING', 'UNION', 'ALL', 'DISTINCT', 'SET', 'VALUES',
  'true', 'false', 'null', 'undefined', 'None', 'True', 'False'
]);

const TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'void', 'never', 'unknown', 'Promise', 'Record', 'Array',
  'Map', 'Set', 'Partial', 'Pick', 'Omit', 'Readonly',
  'int', 'float', 'str', 'bool', 'dict', 'list', 'tuple', 'bytes',
  'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'usize', 'isize', 'f32', 'f64'
]);

const OPERATORS = new Set([
  '=>', '===', '!==', '==', '!=', '&&', '||', '??', '<=', '>=', '+=', '-=', '*=', '/=',
  '++', '--', '...', '->', '::', '<<', '>>'
]);

export function renderSyntaxCode(code: string, language: string): React.ReactNode {
  const lang = (language || '').toLowerCase();

  // Para diffs: colorear líneas completas añadidas o eliminadas
  if (lang === 'diff') {
    const lines = code.split('\n');
    return lines.map((line, idx) => {
      let className = '';
      if (line.startsWith('+') && !line.startsWith('+++')) className = 'syn-diff-add px-1 rounded-sm';
      else if (line.startsWith('-') && !line.startsWith('---')) className = 'syn-diff-del px-1 rounded-sm';
      else if (line.startsWith('@@')) className = 'text-cyan-400 font-semibold';
      return (
        <span key={idx} className={className ? `${className} block` : 'block'}>
          {line || ' '}
        </span>
      );
    });
  }

  const lines = code.split('\n');
  const TOKEN_REGEX = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[a-zA-Z0-9_$]+|===|!==|==|!=|=>|&&|\|\||\?\?|<=|>=|\+=|-=|\*=|\/=|--|\+\+|\.\.\.|->|::|[^\s\w])/g;

  return lines.map((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || (trimmed.startsWith('#') && !trimmed.startsWith('#include')) || trimmed.startsWith('/*')) {
      return <span key={lineIdx} className="syn-com block">{line || ' '}</span>;
    }

    const rawTokens = line.split(TOKEN_REGEX);
    // Filtrar índices para lookahead eficiente
    const tokens: string[] = [];
    for (let i = 0; i < rawTokens.length; i++) {
      if (rawTokens[i] !== undefined && rawTokens[i] !== '') {
        tokens.push(rawTokens[i]);
      }
    }

    return (
      <span key={lineIdx} className="block">
        {tokens.map((token, tokenIdx) => {
          // Comentarios inline
          if (token.startsWith('//') || token.startsWith('/*') || (token.startsWith('#') && (lang === 'py' || lang === 'python' || lang === 'bash' || lang === 'sh' || lang === 'yaml' || lang === 'yml'))) {
            return <span key={tokenIdx} className="syn-com">{token}</span>;
          }

          // Cadenas literales
          if (
            (token.startsWith('"') && token.endsWith('"') && token.length > 1) ||
            (token.startsWith("'") && token.endsWith("'") && token.length > 1) ||
            (token.startsWith('`') && token.endsWith('`') && token.length > 1)
          ) {
            return <span key={tokenIdx} className="syn-str">{token}</span>;
          }

          // Decoradores / Anotaciones (@Component, @decorator)
          if (token.startsWith('@') && token.length > 1) {
            return <span key={tokenIdx} className="syn-const">{token}</span>;
          }

          // Palabras clave
          if (KEYWORDS.has(token) || KEYWORDS.has(token.toUpperCase())) {
            return <span key={tokenIdx} className="syn-kw">{token}</span>;
          }

          // Tipos conocidos
          if (TYPES.has(token)) {
            return <span key={tokenIdx} className="syn-type">{token}</span>;
          }

          // Operadores multicarácter
          if (OPERATORS.has(token)) {
            return <span key={tokenIdx} className="syn-op">{token}</span>;
          }

          // Números literales
          if (/^\d+(\.\d+)?([eE][+-]?\d+)?(px|rem|em|%|ms|s)?$/.test(token)) {
            return <span key={tokenIdx} className="syn-num">{token}</span>;
          }

          // Constantes en mayúsculas (ej: MAX_BUFFER_SIZE, PORT, API_URL)
          if (/^[A-Z_][A-Z0-9_]{1,}$/.test(token) && token.length > 1) {
            return <span key={tokenIdx} className="syn-const">{token}</span>;
          }

          // Llamadas o definiciones de funciones: identificador seguido de '('
          if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(token)) {
            // Buscar siguiente token no espacio
            let nextToken = '';
            for (let j = tokenIdx + 1; j < tokens.length; j++) {
              if (tokens[j].trim() !== '') {
                nextToken = tokens[j];
                break;
              }
            }
            if (nextToken === '(') {
              return <span key={tokenIdx} className="syn-fn">{token}</span>;
            }
          }

          return token;
        })}
      </span>
    );
  });
}
