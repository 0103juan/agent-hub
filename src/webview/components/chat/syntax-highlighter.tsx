import React from 'react';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'class', 'import', 'export', 'from',
  'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'default', 'async', 'await',
  'try', 'catch', 'finally', 'throw', 'new', 'typeof', 'instanceof', 'void', 'this',
  'def', 'self', 'elif', 'lambda', 'with', 'as', 'pass', 'yield',
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'UPDATE', 'DELETE', 'JOIN', 'LEFT', 'RIGHT',
  'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'CREATE', 'TABLE', 'ALTER', 'DROP',
  'true', 'false', 'null', 'undefined', 'None', 'True', 'False'
]);

const TYPES = new Set([
  'string', 'number', 'boolean', 'any', 'void', 'Promise', 'Record', 'Array',
  'int', 'float', 'str', 'bool', 'dict', 'list'
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
  const TOKEN_REGEX = /(\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[a-zA-Z0-9_$]+|[^\s\w])/g;

  return lines.map((line, lineIdx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
      return <span key={lineIdx} className="syn-com block">{line || ' '}</span>;
    }

    const tokens = line.split(TOKEN_REGEX);
    return (
      <span key={lineIdx} className="block">
        {tokens.map((token, tokenIdx) => {
          if (!token) return null;
          if (token.startsWith('//')) return <span key={tokenIdx} className="syn-com">{token}</span>;
          if (
            (token.startsWith('"') && token.endsWith('"')) ||
            (token.startsWith("'") && token.endsWith("'")) ||
            (token.startsWith('`') && token.endsWith('`'))
          ) {
            return <span key={tokenIdx} className="syn-str">{token}</span>;
          }
          if (KEYWORDS.has(token) || KEYWORDS.has(token.toUpperCase())) {
            return <span key={tokenIdx} className="syn-kw">{token}</span>;
          }
          if (TYPES.has(token)) {
            return <span key={tokenIdx} className="syn-type">{token}</span>;
          }
          if (/^\d+(\.\d+)?$/.test(token)) {
            return <span key={tokenIdx} className="syn-num">{token}</span>;
          }
          return token;
        })}
      </span>
    );
  });
}
