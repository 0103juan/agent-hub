const PII_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_ANONIMIZADO]' },
  { pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, replacement: '[TARJETA_CREDITO_PROTEGIDA]' },
  { pattern: /(\+?\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}/g, replacement: '[TELEFONO_REDACTADO]' },
  { pattern: /(?:Bearer\s+|token\s+)?eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{6,}/g, replacement: '[JWT_TOKEN_MASCARADO]' }
];

export function sanitizePii(text: string): string {
  return PII_RULES.reduce((result, rule) => result.replace(rule.pattern, rule.replacement), text);
}
