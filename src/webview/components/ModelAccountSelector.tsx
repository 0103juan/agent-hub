import React, { useState, useMemo } from 'react';
import { AccountProfile, ProviderType } from '../../orchestrator/types';
import {
  ChevronDown,
  Plus,
  Sparkles,
  Bot,
  LogIn,
  CheckCircle2,
  Cpu,
  Search,
  X,
  Zap,
  Flame,
  BrainCircuit,
  Sliders,
  Check
} from 'lucide-react';

export interface ModelDefinition {
  id: string;
  name: string;
  family: 'argon' | 'flash' | 'opus' | 'sonnet' | 'haiku' | 'oss';
  provider: ProviderType;
  effort: 'high' | 'medium' | 'low';
  badge: string;
  description: string;
}

export const COMPREHENSIVE_MODELS: ModelDefinition[] = [
  // 🚀 DeepMind Argon (Thinking Avanzado)
  {
    id: 'gemini-4-argon-high',
    name: 'Gemini 4 Argon (High)',
    family: 'argon',
    provider: 'google',
    effort: 'high',
    badge: 'DeepMind Thinking',
    description: 'Máximo razonamiento de Google DeepMind para arquitectura y algoritmos complejos'
  },
  {
    id: 'gemini-4-argon-medium',
    name: 'Gemini 4 Argon (Medium)',
    family: 'argon',
    provider: 'google',
    effort: 'medium',
    badge: 'DeepMind Balanced',
    description: 'Equilibrio perfecto entre razonamiento profundo y tiempo de respuesta'
  },
  {
    id: 'gemini-4-argon-low',
    name: 'Gemini 4 Argon (Low)',
    family: 'argon',
    provider: 'google',
    effort: 'low',
    badge: 'DeepMind Fast',
    description: 'Razonamiento ágil para respuestas directas e iteraciones rápidas'
  },

  // ⚡ Gemini 3.8 Flash (Contexto 1M)
  {
    id: 'gemini-3.8-flash-high',
    name: 'Gemini 3.8 Flash (High)',
    family: 'flash',
    provider: 'google',
    effort: 'high',
    badge: 'Flash 3.8 (1M)',
    description: 'Análisis de bases de código masivas con esfuerzo alto de razonamiento'
  },
  {
    id: 'gemini-3.8-flash-medium',
    name: 'Gemini 3.8 Flash (Medium)',
    family: 'flash',
    provider: 'google',
    effort: 'medium',
    badge: 'Flash 3.8 (1M)',
    description: 'Velocidad de generación ultra alta con 1M tokens de ventana de contexto'
  },
  {
    id: 'gemini-3.8-flash-low',
    name: 'Gemini 3.8 Flash (Low)',
    family: 'flash',
    provider: 'google',
    effort: 'low',
    badge: 'Flash 3.8 (1M)',
    description: 'Respuesta instantánea para tareas frecuentes de refactorización y tests'
  },

  // ⏱️ Gemini 3.6 Flash (Ultrarrápido)
  {
    id: 'gemini-3.6-flash-high',
    name: 'Gemini 3.6 Flash (High)',
    family: 'flash',
    provider: 'google',
    effort: 'high',
    badge: 'Flash 3.6',
    description: 'Generación rápida con verificación de razonamiento estructurada'
  },
  {
    id: 'gemini-3.6-flash-medium',
    name: 'Gemini 3.6 Flash (Medium)',
    family: 'flash',
    provider: 'google',
    effort: 'medium',
    badge: 'Flash 3.6',
    description: 'Modelo ágil óptimo para revisiones rápidas y consultas de sintaxis'
  },
  {
    id: 'gemini-3.6-flash-low',
    name: 'Gemini 3.6 Flash (Low)',
    family: 'flash',
    provider: 'google',
    effort: 'low',
    badge: 'Flash 3.6',
    description: 'Mínima latencia de generación para auto-completado y verificaciones'
  },

  // 🧠 Anthropic Claude Opus 5.5
  {
    id: 'claude-opus-5-5-high',
    name: 'Claude Opus 5.5 (High)',
    family: 'opus',
    provider: 'google',
    effort: 'high',
    badge: 'Anthropic Flagship',
    description: 'Máxima potencia analítica y síntesis conceptual en Google Antigravity'
  },
  {
    id: 'claude-opus-5-5-medium',
    name: 'Claude Opus 5.5 (Medium)',
    family: 'opus',
    provider: 'google',
    effort: 'medium',
    badge: 'Anthropic Flagship',
    description: 'Razonamiento profundo de Opus 5.5 con cadencia balanceada'
  },
  {
    id: 'claude-opus-5-5-low',
    name: 'Claude Opus 5.5 (Low)',
    family: 'opus',
    provider: 'google',
    effort: 'low',
    badge: 'Anthropic Flagship',
    description: 'Variante ágil de Opus 5.5 para consultas de alta precisión'
  },
  {
    id: 'Claude Opus 5.5',
    name: 'Claude Opus 5.5 (CLI)',
    family: 'opus',
    provider: 'claude',
    effort: 'high',
    badge: 'Claude Pro',
    description: 'Opus 5.5 ejecutado directamente desde tu suscripción de Claude Code'
  },
  {
    id: 'Claude 3 Opus',
    name: 'Claude 3 Opus',
    family: 'opus',
    provider: 'claude',
    effort: 'high',
    badge: 'Claude Pro',
    description: 'Inteligencia profunda y comprensión exhaustiva de sistemas de software'
  },

  // 💎 Anthropic Claude 3.7 & Sonnet 5.5
  {
    id: 'Claude 3.7 Sonnet',
    name: 'Claude 3.7 Sonnet',
    family: 'sonnet',
    provider: 'claude',
    effort: 'medium',
    badge: 'Hybrid Thinking',
    description: 'Modelo insignia de Anthropic con capacidad de razonamiento híbrido'
  },
  {
    id: 'claude-sonnet-5-5-high',
    name: 'Claude Sonnet 5.5 (High)',
    family: 'sonnet',
    provider: 'google',
    effort: 'high',
    badge: 'Sonnet 5.5',
    description: 'Sonnet 5.5 con razonamiento extendido en Google Antigravity'
  },
  {
    id: 'claude-sonnet-5-5-medium',
    name: 'Claude Sonnet 5.5 (Medium)',
    family: 'sonnet',
    provider: 'google',
    effort: 'medium',
    badge: 'Sonnet 5.5',
    description: 'Sonnet 5.5 balanceado para codificación y revisión técnica'
  },
  {
    id: 'claude-sonnet-5-5-low',
    name: 'Claude Sonnet 5.5 (Low)',
    family: 'sonnet',
    provider: 'google',
    effort: 'low',
    badge: 'Sonnet 5.5',
    description: 'Sonnet 5.5 optimizado para respuestas rápidas de desarrollo'
  },
  {
    id: 'Claude 3.5 Sonnet',
    name: 'Claude 3.5 Sonnet',
    family: 'sonnet',
    provider: 'claude',
    effort: 'medium',
    badge: 'Claude Pro',
    description: 'Referente de la industria en ingeniería de software y refactorizaciones'
  },

  // ⚡ Claude Haiku
  {
    id: 'Claude 3.5 Haiku',
    name: 'Claude 3.5 Haiku',
    family: 'haiku',
    provider: 'claude',
    effort: 'low',
    badge: 'Ultra Fast',
    description: 'Velocidad de generación instantánea para tareas repetitivas'
  },

  // 🌐 Open Source / Local
  {
    id: 'gpt-oss-120b-medium',
    name: 'GPT-OSS 120B (Medium)',
    family: 'oss',
    provider: 'google',
    effort: 'medium',
    badge: 'Open Weights',
    description: 'Modelo libre de pesos abiertos en Antigravity sin límites de cuota'
  }
];

interface Props {
  profiles: AccountProfile[];
  activeProfileId: string;
  selectedModel: string;
  onSelectProfile: (profileId: string) => void;
  onSelectModel: (model: string) => void;
  onAddAccount: (provider: ProviderType, label: string) => void;
  onLogin: (profileId: string) => void;
}

export const ModelAccountSelector: React.FC<Props> = ({
  profiles,
  activeProfileId,
  selectedModel,
  onSelectProfile,
  onSelectModel,
  onAddAccount,
  onLogin
}) => {
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>('claude');
  const [accountLabel, setAccountLabel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string>('all');

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  // Identificar definición del modelo activo
  const currentModelDef = useMemo(() => {
    return (
      COMPREHENSIVE_MODELS.find((m) => m.id === selectedModel) || {
        id: selectedModel,
        name: selectedModel,
        family: 'sonnet' as const,
        provider: activeProfile?.provider || 'claude',
        effort: 'medium' as const,
        badge: 'Personalizado',
        description: 'Modelo seleccionado en sesión'
      }
    );
  }, [selectedModel, activeProfile]);

  // Lista combinada de modelos (catálogo comprehensivo + modelos dinámicos reportados por las cuentas)
  const allAvailableModels = useMemo(() => {
    const map = new Map<string, ModelDefinition>();
    // 1. Agregar modelos predefinidos
    for (const m of COMPREHENSIVE_MODELS) {
      map.set(m.id, m);
    }
    // 2. Agregar cualquier modelo dinámico reportado por los perfiles
    for (const p of profiles) {
      if (p.availableModels) {
        for (const rawId of p.availableModels) {
          if (!map.has(rawId)) {
            map.set(rawId, {
              id: rawId,
              name: rawId,
              family: rawId.includes('argon')
                ? 'argon'
                : rawId.includes('flash')
                ? 'flash'
                : rawId.includes('opus')
                ? 'opus'
                : rawId.includes('haiku')
                ? 'haiku'
                : 'sonnet',
              provider: p.provider,
              effort: rawId.includes('-high') ? 'high' : rawId.includes('-low') ? 'low' : 'medium',
              badge: p.name,
              description: `Disponible vía ${p.name}`
            });
          }
        }
      }
    }
    return Array.from(map.values());
  }, [profiles]);

  // Filtrado de modelos por búsqueda y familia
  const filteredModels = useMemo(() => {
    return allAvailableModels.filter((m) => {
      const matchesSearch =
        searchQuery === '' ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.badge.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFamily = familyFilter === 'all' || m.family === familyFilter;

      return matchesSearch && matchesFamily;
    });
  }, [allAvailableModels, searchQuery, familyFilter]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountLabel.trim()) return;
    onAddAccount(selectedProvider, accountLabel.trim());
    setAccountLabel('');
    setShowAddModal(false);
  };

  return (
    <div className="relative">
      {/* Dual Selector Bar */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
        {/* 1. Account Button */}
        <button
          type="button"
          onClick={() => setShowAccountModal(true)}
          className="flex items-center gap-2 px-2 py-1 rounded bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 transition text-left shrink-0 max-w-[200px]"
          title="Cambiar de cuenta o suscripción"
        >
          {activeProfile?.provider === 'claude' && (
            <span className="w-5 h-5 rounded flex items-center justify-center bg-orange-600/20 text-orange-400 font-bold text-[10px] shrink-0">
              C
            </span>
          )}
          {activeProfile?.provider === 'google' && (
            <span className="w-5 h-5 rounded flex items-center justify-center bg-blue-600/20 text-blue-400 font-bold text-[10px] shrink-0">
              <Sparkles className="w-3 h-3" />
            </span>
          )}
          {activeProfile?.provider === 'openai' && (
            <span className="w-5 h-5 rounded flex items-center justify-center bg-emerald-600/20 text-emerald-400 font-bold text-[10px] shrink-0">
              <Bot className="w-3 h-3" />
            </span>
          )}

          <div className="truncate">
            <div className="font-semibold text-zinc-100 truncate text-[11px] leading-tight">
              {activeProfile?.name}
            </div>
            <div className="text-[9px] text-zinc-400 font-mono truncate leading-tight">
              {activeProfile?.email || activeProfile?.subscriptionType || 'Conectado'}
            </div>
          </div>
          <ChevronDown className="w-3 h-3 text-zinc-400 ml-auto shrink-0" />
        </button>

        {/* 2. Model Selector Pill (Centerpiece) */}
        <button
          type="button"
          onClick={() => setShowModelModal(true)}
          className="flex-1 flex items-center justify-between gap-1.5 px-2.5 py-1 rounded bg-indigo-950/30 hover:bg-indigo-950/50 border border-indigo-700/40 text-left transition group"
          title="Abrir catálogo completo de modelos (Argon, Flash 3.8/3.6, Opus 5.5, Sonnet)"
        >
          <div className="flex items-center gap-2 truncate">
            {currentModelDef.family === 'argon' ? (
              <BrainCircuit className="w-3.5 h-3.5 text-pink-400 shrink-0" />
            ) : currentModelDef.family === 'flash' ? (
              <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            ) : currentModelDef.family === 'opus' ? (
              <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            ) : (
              <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            )}

            <div className="truncate">
              <div className="font-medium text-zinc-100 text-[11px] flex items-center gap-1.5 truncate">
                <span>{currentModelDef.name}</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-indigo-300 font-mono border border-indigo-500/20">
                  {currentModelDef.badge}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span
              className={`text-[9px] font-mono px-1 rounded uppercase font-semibold ${
                currentModelDef.effort === 'high'
                  ? 'bg-purple-900/40 text-purple-300 border border-purple-700/40'
                  : currentModelDef.effort === 'low'
                  ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
                  : 'bg-blue-900/40 text-blue-300 border border-blue-700/40'
              }`}
            >
              {currentModelDef.effort}
            </span>
            <ChevronDown className="w-3 h-3 text-zinc-400 group-hover:text-indigo-300 transition" />
          </div>
        </button>

        {/* 3. Link Account Action */}
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition shrink-0"
          title="Vincular otra cuenta (Claude, Google o OpenAI)"
        >
          <Plus className="w-3 h-3 text-indigo-400" />
          <span className="hidden sm:inline">Vincular</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: CATÁLOGO COMPLETO DE MODELOS                    */}
      {/* ======================================================== */}
      {showModelModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 z-50 animate-in fade-in duration-100">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-zinc-700">
            {/* Modal Header */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-zinc-100">Catálogo de Modelos Inteligentes</h3>
                  <p className="text-[10px] text-zinc-400">
                    Selecciona cualquier variante de Gemini, Argon, Flash, Opus o Sonnet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModelModal(false)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="p-2.5 border-b border-zinc-800/80 bg-zinc-900 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar modelo (argon, 3.8, 3.6, flash, opus, 5.5, sonnet)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-750 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-indigo-500"
                  autoFocus
                />
              </div>

              {/* Family Filter Chips */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px]">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'argon', label: '🚀 DeepMind Argon' },
                  { id: 'flash', label: '⚡ Flash (3.8 & 3.6)' },
                  { id: 'opus', label: '🧠 Opus (5.5 & 3)' },
                  { id: 'sonnet', label: '💎 Sonnet (3.7 & 5.5)' },
                  { id: 'haiku', label: '⚡ Haiku' },
                  { id: 'oss', label: '🌐 Open Source' }
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFamilyFilter(chip.id)}
                    className={`px-2 py-0.5 rounded-full border transition shrink-0 ${
                      familyFilter === chip.id
                        ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-medium'
                        : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-zinc-800/50">
              {filteredModels.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs">
                  No se encontraron modelos con el término "{searchQuery}".
                </div>
              ) : (
                filteredModels.map((m) => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        onSelectModel(m.id);
                        setShowModelModal(false);
                      }}
                      className={`p-2 rounded-lg cursor-pointer transition flex items-start justify-between gap-3 ${
                        isSelected
                          ? 'bg-indigo-950/40 border border-indigo-500/50 text-zinc-100'
                          : 'hover:bg-zinc-800/60 text-zinc-300 border border-transparent'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-zinc-100">{m.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono border border-zinc-700">
                            {m.badge}
                          </span>
                          <span
                            className={`text-[9px] px-1 rounded uppercase font-semibold font-mono ${
                              m.effort === 'high'
                                ? 'bg-purple-900/30 text-purple-300'
                                : m.effort === 'low'
                                ? 'bg-emerald-900/30 text-emerald-300'
                                : 'bg-blue-900/30 text-blue-300'
                            }`}
                          >
                            {m.effort}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-relaxed">{m.description}</p>
                        <div className="text-[9px] text-zinc-500 font-mono">
                          ID: <code className="text-zinc-400">{m.id}</code> • Vía{' '}
                          <span className="text-zinc-300">
                            {m.provider === 'google' ? 'Google Antigravity' : 'Claude CLI'}
                          </span>
                        </div>
                      </div>

                      {isSelected ? (
                        <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400 mt-1 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-500 shrink-0 mt-1 font-mono hover:text-indigo-300">
                          Elegir →
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-2 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-[10px] text-zinc-400 px-3">
              <span>
                Total de modelos listados: <strong>{filteredModels.length}</strong>
              </span>
              <span className="text-zinc-500">Cero API Keys • Suscripción Directa</span>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: GESTIÓN DE CUENTAS & PERFILES                   */}
      {/* ======================================================== */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 z-50 animate-in fade-in duration-100">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden ring-1 ring-zinc-700">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
              <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-indigo-400" />
                <span>Cuentas y Suscripciones (CLI)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  onClick={() => {
                    if (profile.status === 'connected') {
                      onSelectProfile(profile.id);
                      setShowAccountModal(false);
                    }
                  }}
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition border ${
                    profile.id === activeProfileId
                      ? 'bg-zinc-800 text-white font-medium border-indigo-500/40 shadow-xs'
                      : 'hover:bg-zinc-800/50 text-zinc-300 border-zinc-800/60'
                  }`}
                >
                  <div className="flex flex-col truncate">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium truncate">{profile.name}</span>
                      {profile.subscriptionType && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-emerald-400 border border-zinc-700 uppercase font-mono">
                          {profile.subscriptionType}
                        </span>
                      )}
                    </div>
                    {profile.email && (
                      <span className="text-[10px] text-zinc-400 font-mono truncate">{profile.email}</span>
                    )}
                  </div>

                  {profile.status === 'connected' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLogin(profile.id);
                      }}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700"
                    >
                      <LogIn className="w-2.5 h-2.5" />
                      <span>Login</span>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="p-2.5 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setShowAccountModal(false);
                  setShowAddModal(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Vincular Nueva Cuenta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: VINCULAR NUEVA CUENTA                           */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 z-50 animate-in fade-in duration-100">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-full max-w-sm space-y-3 shadow-2xl">
            <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Vincular Nueva Cuenta / Suscripción</span>
            </h3>

            {/* Provider Selector */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setSelectedProvider('claude')}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition ${
                  selectedProvider === 'claude'
                    ? 'bg-orange-600/20 text-orange-300 border-orange-500/50'
                    : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                }`}
              >
                <span>Anthropic Claude</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedProvider('google')}
                className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition ${
                  selectedProvider === 'google'
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                    : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border-zinc-700/60'
                }`}
              >
                <span>Google Antigravity</span>
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3 pt-1">
              <div>
                <label className="block text-[10px] text-zinc-400 font-medium mb-1">
                  Etiqueta identificadora (ej: Trabajo, Personal 2, Cliente):
                </label>
                <input
                  type="text"
                  placeholder="ej. Claude Trabajo o Google Personal"
                  value={accountLabel}
                  onChange={(e) => setAccountLabel(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-750 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs rounded-lg hover:bg-zinc-800 text-zinc-400 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!accountLabel.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50 shadow"
                >
                  Iniciar Login
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
