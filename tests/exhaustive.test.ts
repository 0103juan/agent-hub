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
