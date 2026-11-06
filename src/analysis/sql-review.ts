const DESTRUCTIVE_PATTERNS = ['DROP TABLE', 'DROP COLUMN', 'TRUNCATE', 'CASCADE', 'ALTER COLUMN.*SET NOT NULL'];

export function findDestructiveStatements(sql: string): string[] {
  return DESTRUCTIVE_PATTERNS.filter((pattern) => new RegExp(pattern, 'i').test(sql));
}

export function findQueryIssues(query: string): string[] {
  const upper = query.toUpperCase();
  const issues: string[] = [];
  if (!upper.includes('WHERE') && (upper.includes('UPDATE') || upper.includes('DELETE'))) {
    issues.push('UPDATE o DELETE sin cláusula WHERE.');
  }
  if (upper.includes('SELECT *')) {
    issues.push('`SELECT *`: proyecta solo las columnas necesarias.');
  }
  if (upper.includes("LIKE '%")) {
    issues.push("`LIKE '%...'` no aprovecha índices B-Tree; considera `pg_trgm` o GIN.");
  }
  if (upper.includes('JOIN') && !upper.includes(' ON ')) {
    issues.push('JOIN sin condición ON: posible producto cartesiano.');
  }
  return issues;
}
