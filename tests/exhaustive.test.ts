import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { SessionStorage } from '../src/orchestrator/session-storage';
import { PROTOCOL_ROLES } from '../src/orchestrator/protocol-roles';
import { ProtocolRole, ReasoningEffort } from '../src/orchestrator/types';

describe('1. SessionStorage & Persistence Engine', () => {
  const testStorage = new SessionStorage();

  it('debe crear una nueva sesión con metadatos completos y persistir en disco', () => {
    const session = testStorage.createNewSession(
      'Test Suite Alpha',
      'claude-main',
      'Claude 3.7 Sonnet',
      'high',
      'portafolio',
      '/tmp/portafolio',
      'feat-auth-testing',
      'tester'
    );

    assert.ok(session.id.startsWith('session-'));
    assert.strictEqual(session.title, 'Test Suite Alpha');
    assert.strictEqual(session.profileId, 'claude-main');
    assert.strictEqual(session.modelName, 'Claude 3.7 Sonnet');
    assert.strictEqual(session.effort, 'high');
    assert.strictEqual(session.protocolRole, 'tester');

    const sessions = testStorage.getSessions();
    const found = sessions.find((s) => s.id === session.id);
    assert.ok(found, 'La sesión debe estar en la lista de sesiones activas');
  });

  it('debe actualizar configuración de sesión (perfil, modelo, esfuerzo) bidireccionalmente', () => {
    const session = testStorage.createNewSession(
      'Sesión para Update',
      'claude-main',
      'Claude 3.7 Sonnet',
      'medium'
    );

    testStorage.updateSessionSettings(session.id, 'google-workspace', 'gemini-3.8-flash-high', 'high');
    testStorage.setActiveSession(session.id);
    const updated = testStorage.getActiveSession();

    assert.strictEqual(updated.profileId, 'google-workspace');
    assert.strictEqual(updated.modelName, 'gemini-3.8-flash-high');
    assert.strictEqual(updated.effort, 'high');
  });

  it('debe acumular telemetría granular por modelo y cuenta correctamente', () => {
    const tel = testStorage.recordTurnTelemetry('claude-main', 'Claude Pro', 'Claude 3.7 Sonnet', 'claude', {
      inputTokens: 1000,
      outputTokens: 500,
      thinkingTokens: 250,
      costUSD: 0.015,
      durationMs: 1200
    });

    assert.strictEqual(tel.profileId, 'claude-main');
    assert.strictEqual(tel.totalInputTokens >= 1000, true);
    assert.strictEqual(tel.totalOutputTokens >= 500, true);
    assert.strictEqual(tel.totalThinkingTokens >= 250, true);
    assert.strictEqual(tel.cumulativeCostUSD >= 0.015, true);
  });
});

describe('2. Protocol Roles Specification', () => {
  it('todos los 7 roles del protocolo deben estar definidos con system prompts exhaustivos', () => {
    const requiredRoles: ProtocolRole[] = [
      'explorador',
      'arquitecto',
      'tester',
      'desarrollador',
      'revisor',
      'externo',
      'documentador'
    ];

    for (const r of requiredRoles) {
      const config = PROTOCOL_ROLES[r];
      assert.ok(config, `El rol ${r} debe existir en PROTOCOL_ROLES`);
      assert.ok(config.label.length > 0, `El rol ${r} debe tener etiqueta`);
      assert.ok(config.systemPrompt.length > 100, `El rol ${r} debe tener un system prompt detallado`);
      assert.ok(['low', 'medium', 'high', 'max'].includes(config.recommendedEffort), `Esfuerzo recomendado válido para ${r}`);
    }
  });
});

describe('3. Seguridad & Escáner de Secretos', () => {
  const secretPatterns = [
    { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_\-]{20,}/ },
    { name: 'GitHub Personal Token', regex: /ghp_[a-zA-Z0-9]{20,}/ },
    { name: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{30,40}/ },
    { name: 'Generic Private Key', regex: /-----BEGIN PRIVATE KEY-----/ },
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ }
  ];

  it('debe detectar claves de Anthropic, GitHub, Google y AWS en diffs', () => {
    const sampleDirtyDiff = `
+ sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456
+ const ghp_token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";
+ AIzaSyB123456789012345678901234567890
+ AKIAIOSFODNN7EXAMPLE
+ -----BEGIN PRIVATE KEY-----
`;
    for (const sp of secretPatterns) {
      assert.ok(sp.regex.test(sampleDirtyDiff), `Debe detectar patrón ${sp.name}`);
    }
  });

  it('debe permanecer limpio ante código normal sin secretos', () => {
    const sampleCleanDiff = `
+ def calcular_total(items):
+     return sum(i.precio for i in items)
+ const apiKey = process.env.API_KEY;
`;
    for (const sp of secretPatterns) {
      assert.strictEqual(sp.regex.test(sampleCleanDiff), false, `No debe disparar falsos positivos con ${sp.name}`);
    }
  });
});

describe('4. Guardián de BD & Auditoría de Migraciones SQL', () => {
  const dangerousKeywords = [
    'DROP TABLE',
    'DROP COLUMN',
    'TRUNCATE',
    'CASCADE',
    'ALTER COLUMN.*SET NOT NULL'
  ];

  it('debe detectar sentencias destructivas en migraciones SQL', () => {
    const dangerousSql = `
ALTER TABLE usuarios DROP COLUMN email CASCADE;
DROP TABLE auditoria;
TRUNCATE TABLE contratos;
`;
    const found = dangerousKeywords.filter((kw) => new RegExp(kw, 'i').test(dangerousSql));
    assert.strictEqual(found.length >= 4, true, 'Debe detectar las 4 sentencias destructivas');
  });

  it('debe aprobar sentencias DDL seguras (CREATE TABLE, ADD COLUMN nullable)', () => {
    const safeSql = `
CREATE TABLE if not exists contratos (
  id uuid primary key,
  numero varchar(50) not null,
  monto numeric(12, 2)
);
ALTER TABLE contratos ADD COLUMN descripcion text;
`;
    const found = dangerousKeywords.filter((kw) => new RegExp(kw, 'i').test(safeSql));
    assert.strictEqual(found.length, 0, 'No debe detectar palabras destructivas en DDL seguro');
  });
});

describe('5. Profiler SQL & Detección de Cuellos de Botella', () => {
  function profileQuery(query: string): string[] {
    const upper = query.toUpperCase();
    const suggestions: string[] = [];
    if (!upper.includes('WHERE') && (upper.includes('UPDATE') || upper.includes('DELETE'))) {
      suggestions.push('destructive_without_where');
    }
    if (upper.includes('SELECT *')) {
      suggestions.push('avoid_select_star');
    }
    if (upper.includes('LIKE \'%')) {
      suggestions.push('leading_wildcard_index_invalidation');
    }
    if (upper.includes('JOIN') && !upper.includes(' ON ')) {
      suggestions.push('cartesian_product_risk');
    }
    return suggestions;
  }

  it('debe detectar SELECT *, JOIN sin ON, y búsquedas con comodín inicial', () => {
    const badQuery = "SELECT * FROM contratos JOIN empresas WHERE nombre LIKE '%tech%';";
    const issues = profileQuery(badQuery);
    assert.ok(issues.includes('avoid_select_star'));
    assert.ok(issues.includes('cartesian_product_risk'));
    assert.ok(issues.includes('leading_wildcard_index_invalidation'));
  });

  it('debe validar consultas SQL optimizadas', () => {
    const goodQuery = "SELECT id, nombre, monto FROM contratos c JOIN empresas e ON c.empresa_id = e.id WHERE c.estado = 'activo';";
    const issues = profileQuery(goodQuery);
    assert.strictEqual(issues.length, 0, 'No debe haber sugerencias para consultas optimizadas');
  });
});

describe('6. Anonimizador PII (GDPR Sanitizer)', () => {
  function sanitize(text: string): string {
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_ANONIMIZADO]')
      .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, '[TARJETA_CREDITO_PROTEGIDA]')
      .replace(/(\+?\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}/g, '[TELEFONO_REDACTADO]')
      .replace(/(?:Bearer\s+|token\s+)?eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{6,}/g, '[JWT_TOKEN_MASCARADO]');
  }

  it('debe anonimizar emails, tarjetas, teléfonos y JWTs', () => {
    const sample = 'Usuario juan@empresa.com con tarjeta 4532-1234-5678-9010, tel +57 300 123 4567 y token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozS6x8C';
    const result = sanitize(sample);
    assert.ok(!result.includes('juan@empresa.com'), 'Email debe estar ofuscado');
    assert.ok(!result.includes('4532-1234-5678-9010'), 'Tarjeta debe estar ofuscada');
    assert.ok(!result.includes('300 123 4567'), 'Teléfono debe estar ofuscado');
    assert.ok(!result.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWT debe estar ofuscado');
    assert.ok(result.includes('[EMAIL_ANONIMIZADO]'));
    assert.ok(result.includes('[TARJETA_CREDITO_PROTEGIDA]'));
    assert.ok(result.includes('[TELEFONO_REDACTADO]'));
    assert.ok(result.includes('[JWT_TOKEN_MASCARADO]'));
  });
});


import {
  evaluateAutoRollback,
  evaluateQuotaAndSuggestSwitch,
  generateMockDataFromSchema,
  verifyPublicSignatures,
  generateMermaidSequence,
  detectNPlusOneQueries,
  runCommandWithTimeout,
  exportSessionToPRSummary,
  auditAccessibilityWCAG,
  auditEnvSync
} from '../src/orchestrator/vanguard-engine';

describe('7. Smart Load-Balancing & Cuota Switcher', () => {
  const profiles = [
    { id: 'claude-main', provider: 'claude', model: 'Claude 3.7 Sonnet' },
    { id: 'google-antigravity', provider: 'google', model: 'gemini-3.8-flash-high' }
  ];

  it('no debe sugerir cambio si la cuota de la ventana de 5h es menor a 90%', () => {
    const rec = evaluateQuotaAndSuggestSwitch('claude-main', 65, profiles);
    assert.strictEqual(rec.shouldSwitch, false);
  });

  it('debe sugerir conmutar a Gemini cuando Claude supera el 90% de cuota', () => {
    const rec = evaluateQuotaAndSuggestSwitch('claude-main', 92, profiles);
    assert.strictEqual(rec.shouldSwitch, true);
    assert.strictEqual(rec.recommendedProfileId, 'google-antigravity');
    assert.strictEqual(rec.recommendedModel, 'gemini-3.8-flash-high');
    assert.ok(rec.reason.includes('92%'));
  });
});

describe('8. Auto-Rollback Engine', () => {
  it('debe aprobar y no revertir cuando los tests pasan (código 0)', () => {
    const result = evaluateAutoRollback(0, ['src/contracts/views.py']);
    assert.strictEqual(result.rolledBack, false);
    assert.strictEqual(result.filesReverted.length, 0);
  });

  it('debe solicitar rollback cuando los tests fallan (código != 0)', () => {
    const files = ['src/contracts/views.py', 'src/contracts/models.py'];
    const result = evaluateAutoRollback(1, files);
    assert.strictEqual(result.rolledBack, true);
    assert.strictEqual(result.filesReverted.length, 2);
    assert.ok(result.message.includes('Fallo detectado'));
  });
});

describe('9. Generador de Mock Data & Fixtures', () => {
  it('debe detectar campos de modelo Django y generar JSON y FactoryBoy', () => {
    const djangoModel = `
class ContratoPublico(models.Model):
    numero = models.CharField(max_length=50)
    valor = models.DecimalField(max_digits=12, decimal_places=2)
    email_contacto = models.EmailField()
    activo = models.BooleanField(default=True)
`;
    const res = generateMockDataFromSchema(djangoModel);
    assert.strictEqual(res.modelName, 'ContratoPublico');
    assert.ok(res.fieldsDetected.includes('numero'));
    assert.ok(res.fieldsDetected.includes('valor'));
    assert.ok(res.fieldsDetected.includes('email_contacto'));
    assert.strictEqual(res.mockDataJson.email_contacto, 'usuario.test@ejemplo.com');
    assert.strictEqual(res.mockDataJson.activo, true);
    assert.ok(res.factoryPython.includes('ContratoPublicoFactory'));
  });
});

describe('10. Modo Dry-Run & Verificación de Firmas AST', () => {
  it('debe certificar código seguro cuando no se rompen firmas públicas', () => {
    const orig = `export function calcularImpuesto(monto: number) { return monto * 0.19; }`;
    const mod = `export function calcularImpuesto(monto: number) { const factor = 0.19; return monto * factor; }`;
    const check = verifyPublicSignatures(orig, mod);
    assert.strictEqual(check.isSafe, true);
    assert.strictEqual(check.brokenSignatures.length, 0);
    assert.strictEqual(check.preservedCount, 1);
  });

  it('debe alertar cuando se elimina o rompe una firma exportada', () => {
    const orig = `export function funcionAntigua() {}\nexport function otraFuncion() {}`;
    const mod = `export function funcionModificadaNueva() {}`;
    const check = verifyPublicSignatures(orig, mod);
    assert.strictEqual(check.isSafe, false);
    assert.strictEqual(check.brokenSignatures.length, 2);
  });
});

describe('11. Generador de Diagramas de Secuencia Mermaid', () => {
  it('debe generar código Mermaid estructurado con autonumber y participantes', () => {
    const res = generateMermaidSequence('Flujo de Autenticación', [
      { from: 'Cliente', to: 'APIGateway', message: 'POST /auth/login', response: '200 Token' },
      { from: 'APIGateway', to: 'AuthService', message: 'validateCredentials()' }
    ]);
    assert.ok(res.mermaidCode.startsWith('sequenceDiagram'));
    assert.ok(res.mermaidCode.includes('autonumber'));
    assert.ok(res.mermaidCode.includes('Cliente->>APIGateway: POST /auth/login'));
    assert.ok(res.participants.includes('Cliente'));
    assert.ok(res.participants.includes('AuthService'));
  });
});

describe('12. Detector de Consultas N+1 en ORMs', () => {
  it('debe detectar iteración sobre relaciones foráneas sin select_related', () => {
    const badDjangoCode = `
for contrato in contratos:
    empresa_nombre = contrato.empresa.nombre_razon_social
    print(empresa_nombre)
`;
    const analysis = detectNPlusOneQueries(badDjangoCode);
    assert.strictEqual(analysis.hasNPlusOne, true);
    assert.ok(analysis.warnings.length > 0);
    assert.strictEqual(analysis.warnings[0].relation, 'empresa');
    assert.ok(analysis.warnings[0].recommendation.includes('select_related'));
  });

  it('no debe disparar falsos positivos en bucles simples', () => {
    const goodCode = `
for numero in range(10):
    total += numero
`;
    const analysis = detectNPlusOneQueries(goodCode);
    assert.strictEqual(analysis.hasNPlusOne, false);
  });
});

describe('13. Terminal Sandbox con Timeout Estricto', () => {
  it('debe ejecutar comandos rápidos sin timeout', async () => {
    const res = await runCommandWithTimeout('node -e "console.log(42)"', 3000);
    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.timedOut, false);
    assert.strictEqual(res.stdout.trim(), '42');
  });

  it('debe abortar y marcar timedOut en comandos colgados', async () => {
    // node con sleep mayor que el timeout de 300ms
    const res = await runCommandWithTimeout('node -e "setTimeout(() => {}, 2000)"', 300);
    assert.strictEqual(res.timedOut, true);
  });
});

describe('14. Exportador de Sesión a PR Summary Markdown', () => {
  it('debe generar markdown con badges, checklist y telemetría $0.00 API Keys', () => {
    const md = exportSessionToPRSummary({
      taskTitle: 'Integración de Detección de Cuellos de Botella',
      summaryPoints: ['Añadido profiler SQL', 'Añadido sanitizer PII'],
      testResults: '16/16 tests passing in 85ms',
      tokensIn: 3200,
      tokensOut: 1100,
      profileName: 'Claude Pro (Principal)'
    });
    assert.ok(md.includes('# 🚀 Pull Request'));
    assert.ok(md.includes('Añadido profiler SQL'));
    assert.ok(md.includes('$0.00 (Suscripción Directa)'));
    assert.ok(md.includes('16/16 tests passing'));
  });
});

describe('15. Auditor de Accesibilidad Web (WCAG 2.1)', () => {
  it('debe detectar etiquetas <img> sin atributo alt y <button> sin etiqueta accesible', () => {
    const dirtyJsx = `
<img src="/avatar.png" />
<button onClick={handleClick}></button>
<div onClick={doAction}>Haz clic aquí</div>
`;
    const res = auditAccessibilityWCAG(dirtyJsx);
    assert.strictEqual(res.issuesCount >= 3, true);
    assert.ok(res.issues.some(i => i.rule.includes('1.1.1')));
    assert.ok(res.issues.some(i => i.rule.includes('4.1.2')));
    assert.ok(res.issues.some(i => i.rule.includes('2.1.1')));
  });

  it('debe pasar código accesible', () => {
    const cleanJsx = `
<img src="/avatar.png" alt="Avatar del usuario" />
<button aria-label="Cerrar modal" onClick={handleClick}>Cerrar</button>
<input id="email" aria-label="Correo" placeholder="tucorreo@ejemplo.com" />
`;
    const res = auditAccessibilityWCAG(cleanJsx);
    assert.strictEqual(res.issuesCount, 0);
  });
});

describe('16. Inspector de Variables de Entorno (.env.example)', () => {
  it('debe detectar variables referenciadas en código que faltan en .env.example', () => {
    const code = `
const dbUrl = process.env.DATABASE_URL;
const stripeKey = process.env.STRIPE_SECRET_KEY;
const redisHost = os.environ.get("REDIS_HOST");
`;
    const envExample = `
DATABASE_URL=postgres://localhost:5432/db
REDIS_HOST=localhost
`;
    const res = auditEnvSync(code, envExample);
    assert.strictEqual(res.isCompliant, false);
    assert.strictEqual(res.undocumentedVars.length, 1);
    assert.strictEqual(res.undocumentedVars[0], 'STRIPE_SECRET_KEY');
    assert.strictEqual(res.documentedVars.includes('DATABASE_URL'), true);
  });
});
