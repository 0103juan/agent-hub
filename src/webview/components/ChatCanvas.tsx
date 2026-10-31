import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, Terminal, ShieldAlert, Paperclip, X, FileCode, CornerDownLeft, GitCompare, Play, FileText, Check, GitBranch, GitPullRequest, ShieldCheck, History, Lock, Box, Smartphone, Shield, Radio, GitFork, Wrench, ChevronDown, Sparkles, SlidersHorizontal, Ghost, Zap, Database, FileCode2, Trash2, Gauge, BookOpen, Scale, Network, EyeOff, RotateCcw, Container, HeartPulse, FileSpreadsheet, Eye, KeyRound, FileCheck, ArrowRightLeft } from 'lucide-react';
import { ChatMessage, AccountProfile, FileContextAttachment } from '../../orchestrator/types';
import { vscode } from '../vscode-api';

interface Props {
  messages: ChatMessage[];
  activeProfile: AccountProfile | undefined;
  availableProfiles?: AccountProfile[];
  isGenerating: boolean;
  rateLimitInfo: { utilization: number; resetsAt?: number } | null;
  attachments: FileContextAttachment[];
  workspaceFiles: string[];
  onAddAttachment: (attachment: FileContextAttachment) => void;
  onRemoveAttachment: (index: number) => void;
  onRequestActiveContext: () => void;
  onSearchFiles: (query: string) => void;
  onSendMessage: (prompt: string) => void;
  onStop: () => void;
  onSwitchProfile?: (profileId: string) => void;
}

export const ChatCanvas: React.FC<Props> = ({
  messages,
  activeProfile,
  availableProfiles = [],
  isGenerating,
  rateLimitInfo,
  attachments,
  workspaceFiles,
  onAddAttachment,
  onRemoveAttachment,
  onRequestActiveContext,
  onSearchFiles,
  onSendMessage,
  onStop,
  onSwitchProfile
}) => {
  const [prompt, setPrompt] = useState('');
  const [showFileSearch, setShowFileSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close tools popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
    };
    if (showToolsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showToolsMenu]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onSendMessage(prompt.trim());
    setPrompt('');
    setShowFileSearch(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPrompt(val);

    const lastWord = val.split(/\s+/).pop() || '';
    if (lastWord.startsWith('@')) {
      const q = lastWord.slice(1);
      setSearchQuery(q);
      setShowFileSearch(true);
      onSearchFiles(q);
    } else {
      setShowFileSearch(false);
    }
  };

  const handleSelectFile = (file: string) => {
    vscode.postMessage({ command: 'readFileContent', file });
    // Remove the trailing @query
    const parts = prompt.split(/\s+/);
    parts.pop();
    setPrompt(parts.join(' ') + (parts.length > 0 ? ' ' : ''));
    setShowFileSearch(false);
  };

  const handleInsertCode = (text: string) => {
    vscode.postMessage({ command: 'applyCodeDirectly', newCode: text });
  };

  const handleOpenDiff = (text: string) => {
    vscode.postMessage({ command: 'openDiffPreview', newCode: text });
  };

  const handleSaveSpec = (content: string) => {
    vscode.postMessage({ command: 'saveSpecFile', content, taskSlug: 'nueva-especificacion' });
  };

  const handleRunVerification = () => {
    vscode.postMessage({ command: 'runStackVerification' });
  };

  const handleCreateWorktree = () => {
    vscode.postMessage({ command: 'createGitWorktree', taskSlug: 'feature-aislada' });
  };

  const handleCreatePR = () => {
    vscode.postMessage({ command: 'createPullRequestDirect', title: 'feat: cambios con AgentHub', body: 'Implementado con las herramientas del protocolo de desarrollo.' });
  };

  const handleValidateMigration = (code: string) => {
    vscode.postMessage({ command: 'validateMigrationSafety', content: code });
  };

  const handleGenerateChangelog = () => {
    vscode.postMessage({ command: 'generateChangelog' });
  };

  const handleScanSecrets = () => {
    vscode.postMessage({ command: 'scanSecretsInWorkspace' });
  };

  const handleDockerUp = () => {
    vscode.postMessage({ command: 'manageDockerCompose', action: 'up' });
  };

  const handleFlutterTest = () => {
    vscode.postMessage({ command: 'flutterAction', subAction: 'test' });
  };

  const handleAuditDeps = () => {
    vscode.postMessage({ command: 'auditDependencies' });
  };

  const handleOpenTunnel = () => {
    vscode.postMessage({ command: 'exposeLocalTunnel', port: 8000 });
  };

  const handleGenerateMermaid = () => {
    vscode.postMessage({ command: 'generateMermaidSequence' });
  };

  const handleInstallPrePushHook = () => {
    vscode.postMessage({ command: 'installGitPrePushHook' });
  };

  const handleListWorktrees = () => {
    vscode.postMessage({ command: 'listGitWorktrees' });
  };

  const handleGetFeatureFlags = () => {
    vscode.postMessage({ command: 'getFeatureFlags' });
  };

  const handleRunImpactedTests = () => {
    vscode.postMessage({ command: 'runImpactedTests' });
  };

  const handleRunGhostReview = () => {
    vscode.postMessage({ command: 'runGhostReview' });
  };

  const handleSyncOpenApi = () => {
    vscode.postMessage({ command: 'syncOpenApiSpec' });
  };

  const handleGenerateDbFixtures = () => {
    vscode.postMessage({ command: 'generateDbFixtures' });
  };

  const handleAuditDeadCode = () => {
    vscode.postMessage({ command: 'auditDeadCode' });
  };

  const handleGenerateLoadTest = () => {
    vscode.postMessage({ command: 'generateLoadTest' });
  };

  const handleGenerateRunbook = () => {
    vscode.postMessage({ command: 'generateRunbook' });
  };

  const handleAuditLicenses = () => {
    vscode.postMessage({ command: 'auditLicenses' });
  };

  const handleGenerateC4 = () => {
    vscode.postMessage({ command: 'generateC4Diagram' });
  };

  const handleSanitizePii = () => {
    vscode.postMessage({ command: 'sanitizePiiData', text: prompt });
  };

  const handleGenerateSavepoint = () => {
    vscode.postMessage({ command: 'generateSavepointWrapper', sql: prompt });
  };

  const handleCreateSandbox = () => {
    vscode.postMessage({ command: 'createDevSandbox' });
  };

  const handleAutoHeal = () => {
    vscode.postMessage({ command: 'autoHealFromTerminalError' });
  };

  const handleAuditAccessibility = () => {
    vscode.postMessage({ command: 'auditAccessibility' });
  };

  const handleDetectNPlusOne = () => {
    vscode.postMessage({ command: 'detectNPlusOne' });
  };

  const handleGenerateMockData = () => {
    vscode.postMessage({ command: 'generateMockData', schema: prompt });
  };

  const handleAuditEnvSync = () => {
    vscode.postMessage({ command: 'auditEnvSync', code: prompt });
  };

  const handleExportPRSummary = () => {
    vscode.postMessage({ command: 'exportPRSummary' });
  };

  const handleAutoRollback = () => {
    vscode.postMessage({ command: 'executeAutoRollback' });
  };

  const quickSkills = [
    'Explicar arquitectura del proyecto',
    'Revisar vulnerabilidades y seguridad',
    'Generar tests unitarios para cambios'
  ];

  const devopsTools = [
    {
      id: 'test',
      label: '⚡ Test Stack',
      shortLabel: '⚡ Test',
      icon: Play,
      category: 'Ejecución',
      color: 'text-emerald-400',
      description: 'Correr tests (verificar.sh / gradle / npm / pytest)',
      action: handleRunVerification
    },
    {
      id: 'tia-tests',
      label: '⚡ Tests de Impacto (TIA)',
      shortLabel: 'TIA Tests',
      icon: Zap,
      category: 'Ejecución',
      color: 'text-yellow-400',
      description: 'Correr sólo tests afectados por el git diff actual',
      action: handleRunImpactedTests
    },
    {
      id: 'load-test',
      label: '🛡️ Pruebas de Carga (Locust)',
      shortLabel: 'Carga',
      icon: Gauge,
      category: 'Ejecución',
      color: 'text-orange-400',
      description: 'Generar arnés de estrés en docs/load-tests/locustfile.py',
      action: handleGenerateLoadTest
    },
    {
      id: 'auto-heal',
      label: '🤖 Auto-Heal (Workspace)',
      shortLabel: 'Auto-Heal',
      icon: HeartPulse,
      category: 'Ejecución',
      color: 'text-rose-400',
      description: 'Diagnosticar y reparar errores activos en el proyecto',
      action: handleAutoHeal
    },
    {
      id: 'n-plus-one',
      label: '🔍 Profiler ORM (N+1)',
      shortLabel: 'N+1 Profiler',
      icon: Database,
      category: 'Ejecución',
      color: 'text-amber-400',
      description: 'Detectar bucles con consultas repetitivas a la base de datos',
      action: handleDetectNPlusOne
    },
    {
      id: 'auto-rollback',
      label: '🔄 Auto-Rollback Git',
      shortLabel: 'Rollback',
      icon: RotateCcw,
      category: 'Ejecución',
      color: 'text-rose-400',
      description: 'Revertir archivos sucios ante fallos de tests o compilación',
      action: handleAutoRollback
    },
    {
      id: 'list-worktrees',
      label: '🌳 Árbol de Worktrees',
      shortLabel: 'Árbol Git',
      icon: GitBranch,
      category: 'Git & Ramas',
      color: 'text-amber-400',
      description: 'Visualizar ramas y worktrees activos en el repo',
      action: handleListWorktrees
    },
    {
      id: 'worktree',
      label: 'Crear Worktree',
      shortLabel: 'Worktree',
      icon: GitBranch,
      category: 'Git & Ramas',
      color: 'text-amber-400',
      description: 'Directorio y rama aislada para esta tarea',
      action: handleCreateWorktree
    },
    {
      id: 'pr',
      label: 'Abrir Pull Request',
      shortLabel: 'PR',
      icon: GitPullRequest,
      category: 'Git & Ramas',
      color: 'text-purple-400',
      description: 'Crear Pull Request en GitHub con la CLI',
      action: handleCreatePR
    },
    {
      id: 'changelog',
      label: 'Generar Changelog',
      shortLabel: 'Changelog',
      icon: History,
      category: 'Git & Ramas',
      color: 'text-cyan-400',
      description: 'Historial de git reciente formateado',
      action: handleGenerateChangelog
    },
    {
      id: 'pre-push',
      label: '🛡️ Hook Git Pre-Push',
      shortLabel: 'Pre-Push',
      icon: ShieldCheck,
      category: 'Seguridad',
      color: 'text-emerald-400',
      description: 'Instalar guardián automático anti-fugas de tokens',
      action: handleInstallPrePushHook
    },
    {
      id: 'ghost-review',
      label: '👻 Ghost Reviewer (Pre-Commit)',
      shortLabel: 'Ghost Review',
      icon: Ghost,
      category: 'Seguridad',
      color: 'text-indigo-400',
      description: 'Auditar antipatrones, N+1 queries e inyecciones en el diff',
      action: handleRunGhostReview
    },
    {
      id: 'secrets',
      label: 'Escanear Secretos',
      shortLabel: 'Secretos',
      icon: Lock,
      category: 'Seguridad',
      color: 'text-rose-400',
      description: 'Detectar API keys o tokens en tu diff actual',
      action: handleScanSecrets
    },
    {
      id: 'cves',
      label: 'Auditoría CVEs',
      shortLabel: 'CVEs',
      icon: Shield,
      category: 'Seguridad',
      color: 'text-yellow-400',
      description: 'Auditar vulnerabilidades de dependencias',
      action: handleAuditDeps
    },
    {
      id: 'license-audit',
      label: '🔒 Auditoría de Licencias',
      shortLabel: 'Licencias',
      icon: Scale,
      category: 'Seguridad',
      color: 'text-violet-400',
      description: 'Verificar compatibilidad comercial y copyleft (GPL/MIT)',
      action: handleAuditLicenses
    },
    {
      id: 'pii-sanitizer',
      label: '🛡️ Anonimizador PII (GDPR)',
      shortLabel: 'Anonimizar PII',
      icon: EyeOff,
      category: 'Seguridad',
      color: 'text-teal-400',
      description: 'Ocultar emails, teléfonos, JWT y tarjetas en el prompt',
      action: handleSanitizePii
    },
    {
      id: 'wcag-audit',
      label: '♿ Accesibilidad Web (WCAG 2.1)',
      shortLabel: 'WCAG 2.1',
      icon: Eye,
      category: 'Seguridad',
      color: 'text-sky-400',
      description: 'Auditar etiquetas alt, roles accesibles y navegación por teclado',
      action: handleAuditAccessibility
    },
    {
      id: 'env-sync',
      label: '🔑 Sincronizar .env.example',
      shortLabel: '.env Sync',
      icon: KeyRound,
      category: 'Seguridad',
      color: 'text-yellow-400',
      description: 'Detectar variables en código no documentadas en .env.example',
      action: handleAuditEnvSync
    },
    {
      id: 'flags',
      label: '🏷️ Feature Flags',
      shortLabel: 'Flags',
      icon: SlidersHorizontal,
      category: 'Infraestructura',
      color: 'text-indigo-400',
      description: 'Gestionar feature flags locales (.agenthub/flags.json)',
      action: handleGetFeatureFlags
    },
    {
      id: 'db-fixtures',
      label: '🧱 Fixtures de Base de Datos',
      shortLabel: 'Fixtures DB',
      icon: Database,
      category: 'Infraestructura',
      color: 'text-emerald-400',
      description: 'Generar inserts SQL con claves foráneas consistentes',
      action: handleGenerateDbFixtures
    },
    {
      id: 'openapi-sync',
      label: '📑 Sincronizar OpenAPI',
      shortLabel: 'OpenAPI',
      icon: FileCode2,
      category: 'Infraestructura',
      color: 'text-cyan-400',
      description: 'Generar o actualizar docs/openapi.yaml',
      action: handleSyncOpenApi
    },
    {
      id: 'docker',
      label: 'Docker Compose Up',
      shortLabel: 'Docker',
      icon: Box,
      category: 'Infraestructura',
      color: 'text-blue-400',
      description: 'Levantar contenedores en background (-d)',
      action: handleDockerUp
    },
    {
      id: 'flutter',
      label: 'Flutter Test',
      shortLabel: 'Flutter',
      icon: Smartphone,
      category: 'Infraestructura',
      color: 'text-teal-400',
      description: 'Ejecutar suite de pruebas de Flutter',
      action: handleFlutterTest
    },
    {
      id: 'tunnel',
      label: 'Túnel Localhost',
      shortLabel: 'Túnel',
      icon: Radio,
      category: 'Infraestructura',
      color: 'text-indigo-400',
      description: 'Exponer puerto local con localtunnel',
      action: handleOpenTunnel
    },
    {
      id: 'savepoint',
      label: '⚡ Savepoint Rollback (BD)',
      shortLabel: 'Savepoint',
      icon: RotateCcw,
      category: 'Infraestructura',
      color: 'text-amber-400',
      description: 'Envoltorio transaccional seguro con rollback automático',
      action: handleGenerateSavepoint
    },
    {
      id: 'dev-sandbox',
      label: '🧱 DevSandbox Efímero (Docker)',
      shortLabel: 'DevSandbox',
      icon: Container,
      category: 'Infraestructura',
      color: 'text-sky-400',
      description: 'Contenedor desechable para pruebas aisladas sin riesgo',
      action: handleCreateSandbox
    },
    {
      id: 'mock-data',
      label: '🌱 Generador Mock Data & Fixtures',
      shortLabel: 'Mock Data',
      icon: FileSpreadsheet,
      category: 'Infraestructura',
      color: 'text-emerald-400',
      description: 'Generar fixtures JSON y fábricas FactoryBoy desde esquemas',
      action: handleGenerateMockData
    },
    {
      id: 'mermaid',
      label: 'Diagrama Mermaid',
      shortLabel: 'Mermaid',
      icon: GitFork,
      category: 'Diseño',
      color: 'text-pink-400',
      description: 'Generar diagrama de secuencia de arquitectura',
      action: handleGenerateMermaid
    },
    {
      id: 'c4-diagram',
      label: '📜 Diagrama C4 Arquitectura',
      shortLabel: 'Diagrama C4',
      icon: Network,
      category: 'Diseño',
      color: 'text-indigo-400',
      description: 'Visualizar contenedores, APIs, DBs y colas en Mermaid',
      action: handleGenerateC4
    },
    {
      id: 'dead-code',
      label: '🧬 Dead Code Reaper',
      shortLabel: 'Limpieza',
      icon: Trash2,
      category: 'Diseño',
      color: 'text-rose-400',
      description: 'Auditar funciones huérfanas, logs y deuda técnica',
      action: handleAuditDeadCode
    },
    {
      id: 'runbook',
      label: '📜 Runbook de Incidentes',
      shortLabel: 'Runbook',
      icon: BookOpen,
      category: 'Diseño',
      color: 'text-blue-400',
      description: 'Generar docs/runbooks/INCIDENT_RUNBOOK.md para prod',
      action: handleGenerateRunbook
    },
    {
      id: 'pr-summary',
      label: '📋 Resumen PR Markdown',
      shortLabel: 'Resumen PR',
      icon: FileCheck,
      category: 'Diseño',
      color: 'text-indigo-400',
      description: 'Exportar historial de la tarea a PULL_REQUEST.md con badges',
      action: handleExportPRSummary
    }
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Smart Load-Balancing & Quota Alert */}
      {rateLimitInfo && rateLimitInfo.utilization >= 90 ? (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-950/50 border border-amber-600/60 text-amber-200 text-xs shadow-md">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Alerta de Cuota ({rateLimitInfo.utilization}%):</strong> Ventana saturada. Conmuta a Google Antigravity (Gemini 3.8 Flash) para continuar.
            </span>
          </div>
          {onSwitchProfile && (
            <button
              onClick={() => {
                const alt = availableProfiles.find(p => p.id !== activeProfile?.id && p.provider === 'google');
                if (alt) onSwitchProfile(alt.id);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded text-[11px] transition shrink-0 ml-2 shadow"
            >
              <ArrowRightLeft className="w-3 h-3" />
              <span>Conmutar a Gemini</span>
            </button>
          )}
        </div>
      ) : rateLimitInfo && rateLimitInfo.utilization > 0 ? (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[11px]">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
            <span>Utilización de cuota de ventana:</span>
          </div>
          <span className="font-mono font-bold text-zinc-200">
            {rateLimitInfo.utilization}%
          </span>
        </div>
      ) : null}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-3 p-1 min-h-[160px] max-h-[340px]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500 space-y-2">
            <Terminal className="w-6 h-6 text-zinc-600" />
            <p className="text-xs">
              Ejecuta instrucciones en{' '}
              <span className="text-zinc-300 font-medium">
                {activeProfile?.name || 'el modelo seleccionado'}
              </span>{' '}
              utilizando tu suscripción directa.
            </p>
            <div className="flex flex-wrap gap-1 justify-center pt-2">
              {quickSkills.map((skill) => (
                <button
                  key={skill}
                  onClick={() => onSendMessage(skill)}
                  className="text-[10px] px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-zinc-800/90 text-zinc-100 ml-4 border border-zinc-700'
                  : 'bg-zinc-900/90 text-zinc-200 mr-2 border border-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1 font-mono">
                <span>{msg.role === 'user' ? 'Tú' : msg.modelName}</span>
                {msg.role === 'assistant' && !msg.isStreaming && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenDiff(msg.content)}
                      className="flex items-center gap-1 hover:text-indigo-300 text-zinc-400 transition bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60"
                      title="Comparar propuesta con el archivo activo en el editor"
                    >
                      <GitCompare className="w-3 h-3 text-indigo-400" />
                      <span>Ver Diff</span>
                    </button>

                    <button
                      onClick={() => handleInsertCode(msg.content)}
                      className="flex items-center gap-1 hover:text-emerald-300 text-zinc-400 transition bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60"
                      title="Aplicar código propuesto directamente en el archivo abierto"
                    >
                      <CornerDownLeft className="w-3 h-3 text-emerald-400" />
                      <span>Aplicar</span>
                    </button>

                    {msg.content.includes('# ') && msg.content.includes('Criterios') && (
                      <button
                        onClick={() => handleSaveSpec(msg.content)}
                        className="flex items-center gap-1 hover:text-purple-300 text-zinc-400 transition bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60"
                        title="Guardar en docs/specs/<slug>.md"
                      >
                        <FileText className="w-3 h-3 text-purple-400" />
                        <span>Guardar Spec</span>
                      </button>
                    )}

                    {(msg.content.includes('CREATE TABLE') || msg.content.includes('ALTER TABLE') || msg.content.includes('migration')) && (
                      <button
                        onClick={() => handleValidateMigration(msg.content)}
                        className="flex items-center gap-1 hover:text-cyan-300 text-zinc-400 transition bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60"
                        title="Guardián de BD: Validar que no contenga sentencias destructivas"
                      >
                        <ShieldCheck className="w-3 h-3 text-cyan-400" />
                        <span>Validar Migración</span>
                      </button>
                    )}

                    {(msg.content.toUpperCase().includes('SELECT ') && msg.content.toUpperCase().includes('FROM ')) && (
                      <button
                        onClick={() => vscode.postMessage({ command: 'analyzeSqlQuery', query: msg.content })}
                        className="flex items-center gap-1 hover:text-emerald-300 text-zinc-400 transition bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60"
                        title="Profiler SQL: Analizar rendimiento, índices faltantes y producto cartesiano"
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>Profiler SQL</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="whitespace-pre-wrap font-sans select-text">
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachments Pills Bar */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-1 bg-zinc-900/60 rounded border border-zinc-800">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30"
            >
              <FileCode className="w-3 h-3 text-indigo-400" />
              <span className="font-mono">
                {att.file}
                {att.lines ? `#${att.lines}` : ''}
              </span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(idx)}
                className="hover:text-red-400 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File Search Autocomplete Popup */}
      {showFileSearch && workspaceFiles.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-1 max-h-36 overflow-y-auto space-y-0.5 z-20">
          <div className="text-[10px] text-zinc-500 px-2 py-1">Archivos del proyecto (clic para adjuntar):</div>
          {workspaceFiles.map((file) => (
            <div
              key={file}
              onClick={() => handleSelectFile(file)}
              className="px-2 py-1 text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 rounded cursor-pointer truncate"
            >
              {file}
            </div>
          ))}
        </div>
      )}

      {/* Input & Context Action Buttons */}
      <div className="relative space-y-2">
        {/* Superior Action Bar: Context + Quick Pills + Categorized Tools Popover */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          {/* Left: Quick Actions Group */}
          <div className="flex items-center gap-1.5 overflow-hidden">
            {/* Context attachment button */}
            <button
              type="button"
              onClick={onRequestActiveContext}
              className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300 hover:text-indigo-300 bg-zinc-800/80 hover:bg-zinc-700/80 px-2.5 py-1 rounded-md border border-zinc-700/60 transition shrink-0"
              title="Adjuntar selección o archivo actual del editor"
            >
              <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
              <span>Adjuntar contexto</span>
            </button>

            {/* Quick Test Pill (Primary frequent action) */}
            <button
              type="button"
              onClick={handleRunVerification}
              className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition shrink-0"
              title="Ejecutar suite de verificación del stack (verificar.sh / gradle / npm / pytest)"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>⚡ Test</span>
            </button>

            {/* Herramientas Dropdown Toggle */}
            <div className="relative" ref={toolsMenuRef}>
              <button
                type="button"
                onClick={() => setShowToolsMenu(!showToolsMenu)}
                className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md transition shrink-0 border ${
                  showToolsMenu
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border-zinc-700/60'
                }`}
                title="Abrir menú de herramientas del protocolo y DevOps"
              >
                <Wrench className="w-3 h-3 text-indigo-400" />
                <span>Acciones</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showToolsMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Categorized Tools Popover */}
              {showToolsMenu && (
                <div className="absolute left-0 bottom-full mb-2 w-72 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                    <span>Herramientas DevOps & Protocolo</span>
                    <span>10 Acciones</span>
                  </div>

                  <div className="max-h-72 overflow-y-auto py-1 divide-y divide-zinc-800/60 space-y-1">
                    {['Git & Ramas', 'Seguridad', 'Infraestructura', 'Diseño'].map((cat) => {
                      const toolsInCat = devopsTools.filter((t) => t.category === cat);
                      if (toolsInCat.length === 0) return null;
                      return (
                        <div key={cat} className="pt-1.5 first:pt-0">
                          <div className="text-[10px] font-semibold text-zinc-400 px-2 py-0.5">
                            {cat}
                          </div>
                          <div className="space-y-0.5">
                            {toolsInCat.map((tool) => {
                              const IconComponent = tool.icon;
                              return (
                                <button
                                  key={tool.id}
                                  type="button"
                                  onClick={() => {
                                    tool.action();
                                    setShowToolsMenu(false);
                                  }}
                                  className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-left transition group"
                                >
                                  <div className="p-1 rounded bg-zinc-800/80 group-hover:bg-zinc-700 border border-zinc-700/50 mt-0.5 shrink-0">
                                    <IconComponent className={`w-3.5 h-3.5 ${tool.color}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-medium text-zinc-200 group-hover:text-white">
                                      {tool.label}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 group-hover:text-zinc-400 truncate">
                                      {tool.description}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Scrollable Quick Pills Strip (Muted & cohesive, no layout breakage) */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth">
              {devopsTools.slice(1, 5).map((tool) => {
                const IconComponent = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={tool.action}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-zinc-800/50 hover:bg-zinc-700/80 text-zinc-300 hover:text-zinc-100 border border-zinc-700/50 hover:border-zinc-600 transition shrink-0"
                    title={tool.description}
                  >
                    <IconComponent className={`w-3 h-3 ${tool.color}`} />
                    <span>{tool.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right helper text */}
          <span className="text-[10px] text-zinc-500 font-mono shrink-0 hidden md:inline-block">
            @ para archivos
          </span>
        </div>

        {/* Integrated Textarea Box */}
        <form onSubmit={handleSubmit} className="relative rounded-xl border border-zinc-700/80 bg-zinc-900/90 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition shadow-sm overflow-hidden">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={`Pregunta a ${activeProfile?.name || 'el agente'} o escribe @ para archivos...`}
            rows={2}
            className="w-full bg-transparent text-zinc-100 text-xs p-3 pr-12 focus:outline-none resize-none placeholder-zinc-500 leading-relaxed font-sans"
          />

          {/* Bottom Bar inside Input Box */}
          <div className="flex items-center justify-between px-3 pb-2 pt-0.5 text-[10px] text-zinc-500">
            <span className="hidden sm:inline-block">
              <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[9px] text-zinc-400">⏎ Enviar</kbd>
              <span className="mx-1">·</span>
              <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[9px] text-zinc-400">⇧⏎ Salto</kbd>
            </span>
            <span className="sm:hidden font-mono text-[9px]">@ archivos</span>

            <div className="flex items-center gap-2">
              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition shadow-sm"
                  title="Detener generación"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span className="text-[11px]">Detener</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!prompt.trim()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white font-medium transition shadow-sm"
                  title="Enviar prompt"
                >
                  <span className="text-[11px]">Enviar</span>
                  <Send className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
