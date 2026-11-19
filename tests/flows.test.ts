// CA1, CA5, CA6 (orden) y CA8 sobre `src/shared/flows.ts`, que aún no existe.
// Va aparte de agent-hub.test.ts: importar un módulo inexistente rompería el bundle de todas las demás pruebas.
import { describe, it } from 'node:test';
import * as assert from 'node:assert';

import { agentLabel, flowNameFrom, groupByFlow, sessionTitle } from '../src/shared/flows';
import { agentName } from '../src/shared/agent-name';
import { ConversationSession, ProtocolRole } from '../src/shared/types';

let tick = 0;
function member(role: ProtocolRole | undefined, squad: string | undefined, extra: Partial<ConversationSession> = {}): ConversationSession {
  tick += 1;
  const slug = role ? `${role}-1` : undefined;
  return {
    id: `s${tick}`, title: slug ?? 'Nueva conversación', taskSlug: slug, protocolRole: role, squad,
    profileId: 'p', modelId: 'm', effort: 'low', messages: [], createdAt: tick, updatedAt: tick, ...extra
  };
}

describe('flowNameFrom (CA1)', () => {
  const REQ = 'Quiero mejorar la creación de chats y de agentes, que se organicen mejor por flujo';

  it('quita el prefijo de cortesía, corta en límite de palabra a ≤ 40 y capitaliza', () => {
    const name = flowNameFrom(REQ, 'Feature completa');
    assert.ok(name.length <= 40, name);
    assert.ok(!/^quiero/i.test(name), name);
    assert.ok(/^[A-ZÁÉÍÓÚÑ]/.test(name), name);
    assert.ok(name.startsWith('Mejorar la creación de chats'), name);
    // límite de palabra: lo que queda es un prefijo del requerimiento terminado en palabra completa
    const body = REQ.replace(/^Quiero /, '').toLowerCase();
    const bare = name.replace(/…$/, '').trim().toLowerCase();
    assert.ok(body.startsWith(bare) && (body[bare.length] === undefined || /[\s,.]/.test(body[bare.length])), name);
  });

  it('vacío o sólo espacios devuelve el valor de respaldo', () => {
    assert.strictEqual(flowNameFrom('', 'Feature completa'), 'Feature completa');
    assert.strictEqual(flowNameFrom('   \n ', 'Feature completa'), 'Feature completa');
  });

  it('no deja `#123` en el nombre', () => {
    const name = flowNameFrom('#123 corrige login', 'X');
    assert.ok(!name.includes('#123'), name);
    assert.ok(name.toLowerCase().includes('corrige login'), name);
  });

  it('toma la primera frase y quita otros prefijos de cortesía', () => {
    assert.strictEqual(flowNameFrom('Necesito agregar el login. Además el logout', 'X'), 'Agregar el login');
    assert.ok(flowNameFrom('Por favor revisa el pago', 'X').startsWith('Revisa el pago'));
  });
});

describe('sessionTitle', () => {
  it('une la etiqueta del rol y el flujo', () => {
    assert.strictEqual(sessionTitle('arquitecto', 'Chats por flujo'), 'Arquitecto · Chats por flujo');
    assert.strictEqual(sessionTitle(undefined, 'Chats por flujo'), 'Agente · Chats por flujo');
  });
});

describe('agentLabel (CA5)', () => {
  it('sin número cuando el rol no se repite en el equipo', () => {
    const team = [member('desarrollador', 'S'), member('revisor', 'S')];
    assert.deepStrictEqual(team.map((s) => agentLabel(s, team)), ['Desarrollador', 'Revisor']);
  });

  it('con número, en orden de creación, cuando el rol se repite', () => {
    const team = [member('desarrollador', 'S', { taskSlug: 'desarrollador-1' }), member('desarrollador', 'S', { taskSlug: 'desarrollador-2' })];
    assert.deepStrictEqual(team.map((s) => agentLabel(s, team)), ['Desarrollador 1', 'Desarrollador 2']);
  });

  it('sin rol dice Agente; sin squad devuelve el título', () => {
    const team = [member(undefined, 'S')];
    assert.strictEqual(agentLabel(team[0], team), 'Agente');
    const suelto = member('tester', undefined, { title: 'Mi chat' });
    assert.strictEqual(agentLabel(suelto, [suelto]), 'Mi chat');
  });
});

describe('groupByFlow (CA6 orden, CA8)', () => {
  const roles: ProtocolRole[] = ['arquitecto', 'tester', 'desarrollador'];
  const team = (squad: string, name: string | undefined, project: string, at: number) =>
    // creados al revés para comprobar el orden de la plantilla
    [...roles].reverse().map((r, i) => member(r, squad, { squadName: name, projectName: project, createdAt: at + i, updatedAt: at }));

  it('agrupa por squad, ordena miembros por plantilla y flujos por actividad y recencia', () => {
    const viejo = team('A', 'Flujo viejo', 'P', 100);
    const nuevo = team('B', 'Flujo nuevo', 'P', 200);
    const corriendo = team('C', 'Flujo activo', 'Q', 50);
    const sueltos = [member(undefined, undefined, { title: 'Suelto 1' }), member(undefined, undefined, { title: 'Suelto 2' })];
    const all = [...viejo, ...nuevo, ...corriendo, ...sueltos];

    const { flows, loose } = groupByFlow(all, [corriendo[0].id]);
    assert.deepStrictEqual(flows.map((f) => f.squad), ['C', 'B', 'A']);
    assert.deepStrictEqual(flows.map((f) => [f.name, f.project]), [['Flujo activo', 'Q'], ['Flujo nuevo', 'P'], ['Flujo viejo', 'P']]);
    assert.deepStrictEqual(flows[1].members.map((s) => s.protocolRole), roles);
    assert.deepStrictEqual(loose.map((s) => s.title).sort(), ['Suelto 1', 'Suelto 2']);
  });

  it('CA8: sesiones con squad pero sin squadName reciben un nombre por defecto y no se caen', () => {
    const heredado = team('H', undefined, 'AgentHub', 10);
    const { flows, loose } = groupByFlow(heredado, []);
    assert.strictEqual(loose.length, 0);
    assert.strictEqual(flows.length, 1);
    assert.match(flows[0].name, /^Equipo/);
    assert.deepStrictEqual(heredado.map((s) => agentName(s)), roles.slice().reverse().map((r) => `${r}-1`));
  });

  it('sin squadName ni projectName toma el flujo del título y el proyecto de la carpeta', () => {
    const viejos = [
      member('arquitecto', 'T', { title: 'Arquitecto · Migrar pagos', projectPath: 'C:\\repos\\finesa\\' }),
      member('tester', 'T', { title: 'Tester · Migrar pagos', projectPath: 'C:\\repos\\finesa\\' })
    ];
    const [flow] = groupByFlow(viejos, []).flows;
    assert.strictEqual(flow.name, 'Migrar pagos');
    assert.strictEqual(flow.project, 'finesa');
    assert.strictEqual(flow.createdAt, Math.min(...viejos.map((s) => s.createdAt)));
  });

  it('un flujo de un solo miembro se muestra como chat suelto', () => {
    const solo = member('tester', 'Z', { squadName: 'Solo' });
    const { flows, loose } = groupByFlow([solo], []);
    assert.strictEqual(flows.length, 0);
    assert.deepStrictEqual(loose.map((s) => s.id), [solo.id]);
  });
});

describe('isSystemOrAppDir (Protección de workspace)', () => {
  const { isSystemOrAppDir } = require('../src/host/safe-path');

  it('detecta System32 y rutas de Windows como rutas de sistema inválidas', () => {
    assert.strictEqual(isSystemOrAppDir('C:\\Windows\\System32'), true);
    assert.strictEqual(isSystemOrAppDir('C:/Windows/system32/cmd.exe'), true);
    assert.strictEqual(isSystemOrAppDir('C:\\Windows'), true);
    assert.strictEqual(isSystemOrAppDir('C:\\'), true);
    assert.strictEqual(isSystemOrAppDir('/'), true);
    assert.strictEqual(isSystemOrAppDir(''), true);
    assert.strictEqual(isSystemOrAppDir(undefined), true);
    assert.strictEqual(isSystemOrAppDir(null), true);
  });

  it('detecta carpeta de instalación de AgentHub como ruta de aplicación inválida', () => {
    assert.strictEqual(isSystemOrAppDir('C:\\Users\\juan0\\AppData\\Local\\Programs\\AgentHub'), true);
    assert.strictEqual(isSystemOrAppDir('C:/Users/juan0/AppData/Local/Programs/AgentHub'), true);
  });

  it('permite directorios de proyectos de usuario legítimos', () => {
    assert.strictEqual(isSystemOrAppDir('C:\\Users\\juan0\\Documents\\GitHub\\portafolio\\agent-hub'), false);
    assert.strictEqual(isSystemOrAppDir('C:\\Users\\juan0\\Documents\\GitHub\\portafolio'), false);
    assert.strictEqual(isSystemOrAppDir('/home/user/my-project'), false);
  });
});
