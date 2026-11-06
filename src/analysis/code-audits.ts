export interface NPlusOneWarning {
  line: number;
  snippet: string;
  relation: string;
  recommendation: string;
}

export function detectNPlusOneQueries(code: string): { hasNPlusOne: boolean; warnings: NPlusOneWarning[] } {
  const warnings: NPlusOneWarning[] = [];
  const lines = code.split('\n');

  let inLoop = false;
  let loopVar = '';
  let loopLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detección de bucle: for item in queryset: or items.forEach(item => ...)
    const pythonFor = trimmed.match(/for\s+([A-Za-z0-9_]+)\s+in\s+([A-Za-z0-9_.]+):/);
    if (pythonFor) {
      inLoop = true;
      loopVar = pythonFor[1];
      loopLine = i + 1;
      continue;
    }

    if (inLoop) {
      // Si la indentación se reduce a 0, termina el bucle
      if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
        inLoop = false;
        loopVar = '';
        continue;
      }

      // Buscar accesos navegacionales de relaciones: item.foreign_key.attr
      const relAccess = new RegExp(`${loopVar}\\.([A-Za-z0-9_]+)\\.([A-Za-z0-9_]+)`);
      const match = trimmed.match(relAccess);

      if (match) {
        const relation = match[1];
        // Ignorar propiedades comunes que no son relaciones ORM
        if (!['id', 'pk', 'length', 'status', 'value'].includes(relation)) {
          warnings.push({
            line: i + 1,
            snippet: trimmed,
            relation,
            recommendation: `Posible consulta N+1 al acceder a '${match[0]}'. Agrega '.select_related("${relation}")' o '.prefetch_related("${relation}")' a tu consulta inicial (bucle en línea ${loopLine}).`
          });
        }
      }
    }
  }

  return {
    hasNPlusOne: warnings.length > 0,
    warnings
  };
}

export interface WCAGIssue {
  rule: string;
  element: string;
  message: string;
  severity: 'warning' | 'error';
}

export function auditAccessibilityWCAG(code: string): { issuesCount: number; issues: WCAGIssue[] } {
  const issues: WCAGIssue[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Imagen sin alt
    if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(line)) {
      issues.push({
        rule: 'WCAG 1.1.1 (Non-text Content)',
        element: `<img ...>`,
        message: `Línea ${i + 1}: Etiqueta <img /> sin atributo 'alt'. Debe incluir una descripción alternativa o alt="" si es decorativa.`,
        severity: 'error'
      });
    }

    // 2. Botón sin aria-label o contenido de texto aparente
    if (/<button\b[^>]*>\s*<\/[a-z]+>/i.test(line) && !line.includes('aria-label') && !line.includes('title')) {
      issues.push({
        rule: 'WCAG 4.1.2 (Name, Role, Value)',
        element: `<button ...>`,
        message: `Línea ${i + 1}: Botón interactivo sin etiqueta accesible ('aria-label' o texto interno).`,
        severity: 'error'
      });
    }

    // 3. Div interactivo sin role="button" ni tabIndex
    if (/<div\b[^>]*\bonClick=[^>]*>/i.test(line) && !line.includes('role=') && !line.includes('tabIndex=')) {
      issues.push({
        rule: 'WCAG 2.1.1 (Keyboard Accessible)',
        element: `<div onClick ...>`,
        message: `Línea ${i + 1}: Elemento <div> con evento onClick sin 'role="button"' ni 'tabIndex="0"'. No es accesible por teclado.`,
        severity: 'warning'
      });
    }

    // 4. Input sin id/label/aria-label
    if (/<input\b(?![^>]*\b(aria-label|id|placeholder)=)[^>]*>/i.test(line)) {
      issues.push({
        rule: 'WCAG 3.3.2 (Labels or Instructions)',
        element: `<input ...>`,
        message: `Línea ${i + 1}: Campo <input /> sin identificador accesible ni aria-label.`,
        severity: 'warning'
      });
    }
  }

  return {
    issuesCount: issues.length,
    issues
  };
}

export interface EnvSyncResult {
  undocumentedVars: string[];
  documentedVars: string[];
  isCompliant: boolean;
}

export function auditEnvSync(code: string, envExampleContent: string): EnvSyncResult {
  const referencedVars = new Set<string>();

  // Regex para process.env.VAR_NAME
  const jsEnvMatches = code.matchAll(/process\.env\.([A-Z0-9_]+)/g);
  for (const m of jsEnvMatches) {
    referencedVars.add(m[1]);
  }

  // Regex para os.environ.get("VAR_NAME") o os.getenv("VAR_NAME")
  const pyEnvMatches = code.matchAll(/os\.(?:environ\.get|getenv)\s*\(\s*["']([A-Z0-9_]+)["']/g);
  for (const m of pyEnvMatches) {
    referencedVars.add(m[1]);
  }

  // Extraer variables presentes en el archivo .env.example
  const documentedVars = new Set<string>();
  for (const line of envExampleContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      const varName = eqIdx > -1 ? trimmed.substring(0, eqIdx).trim() : trimmed;
      if (varName) {
        documentedVars.add(varName);
      }
    }
  }

  const undocumentedVars: string[] = [];
  for (const v of referencedVars) {
    if (!documentedVars.has(v)) {
      undocumentedVars.push(v);
    }
  }

  return {
    undocumentedVars,
    documentedVars: Array.from(documentedVars),
    isCompliant: undocumentedVars.length === 0
  };
}
