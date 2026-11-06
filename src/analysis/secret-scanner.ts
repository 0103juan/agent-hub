const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
  { name: 'GitHub Personal Token', regex: /ghp_[a-zA-Z0-9]{20,}/ },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{30,40}/ },
  { name: 'Generic Private Key', regex: /BEGIN (?:RSA )?PRIVATE KEY/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ }
];

export function findSecrets(text: string): string[] {
  return SECRET_PATTERNS.filter(({ regex }) => regex.test(text)).map(({ name }) => name);
}
