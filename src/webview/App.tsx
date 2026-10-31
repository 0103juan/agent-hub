import React, { useState, useEffect } from 'react';
import { vscode } from './vscode-api';
import { AccountProfile, MCPServerInfo, ChatMessage, FileContextAttachment, ReasoningEffort, ConversationSession, ProviderType, TelemetryRegistry, ProtocolRole } from '../orchestrator/types';
import { ModelAccountSelector } from './components/ModelAccountSelector';
import { EffortSelector } from './components/EffortSelector';
import { ProtocolRoleSelector } from './components/ProtocolRoleSelector';
import { TelemetryBar } from './components/TelemetryBar';
import { TelemetryDashboard } from './components/TelemetryDashboard';
import { MCPManagerView } from './components/MCPManagerView';
import { ChatCanvas } from './components/ChatCanvas';
import { ProfileCard } from './components/ProfileCard';
import { SessionDrawer } from './components/SessionDrawer';
import { MessageSquare, Wrench, BarChart3, Users, SplitSquareVertical, RefreshCw, History, Plus, FolderGit2, Layers, ChevronDown } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'sessions' | 'mcps' | 'telemetry' | 'accounts'>('chat');
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('claude-main');
  const [selectedModel, setSelectedModel] = useState<string>('Claude 3.7 Sonnet');
  const [effort, setEffort] = useState<ReasoningEffort>('medium');
  const [mcps, setMcps] = useState<MCPServerInfo[]>([]);
  
  // Sessions & Persistence
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [showSessionDrawer, setShowSessionDrawer] = useState<boolean>(false);
  const [activeProtocolRole, setActiveProtocolRole] = useState<ProtocolRole | undefined>(undefined);
  
  // Messages & Granular Telemetry Registry
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [telemetryRegistry, setTelemetryRegistry] = useState<TelemetryRegistry>({});

  // Context attachments & workspace files
  const [attachments, setAttachments] = useState<FileContextAttachment[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);

  // Add Account Modal in Accounts Tab
  const [showGlobalAddModal, setShowGlobalAddModal] = useState<boolean>(false);
  const [modalProvider, setModalProvider] = useState<ProviderType>('claude');
  const [modalLabel, setModalLabel] = useState<string>('');

  const sanitizeSessionProfileAndModel = (profileId?: string, modelName?: string, profs: AccountProfile[] = profiles) => {
    let pId = profileId || (profs[0] ? profs[0].id : 'claude-main');
    let mName = modelName || 'Claude 3.7 Sonnet';

    const isGoogleModel =
      mName.startsWith('gemini-') ||
      mName.startsWith('claude-opus-5') ||
      mName.startsWith('claude-sonnet-5') ||
      mName === 'gpt-oss-120b-medium';
    const isClaudeNative =
      mName.startsWith('Claude 3') ||
      mName === 'Claude Opus 5.5';

    const p = profs.find((x) => x.id === pId);
    if (p) {
      if (p.provider === 'claude' && isGoogleModel) {
        const gProf = profs.find((x) => x.provider === 'google');
        if (gProf) {
          pId = gProf.id;
        } else {
          mName = 'Claude 3.7 Sonnet';
        }
      } else if (p.provider === 'google' && isClaudeNative) {
        const cProf = profs.find((x) => x.provider === 'claude');
        if (cProf) {
          pId = cProf.id;
        } else {
          mName = 'gemini-3.8-flash-high';
        }
      }
    }
    return { profileId: pId, modelName: mName };
  };


  useEffect(() => {
    vscode.postMessage({ command: 'init' });

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case 'stateUpdate':
          if (msg.data.profiles) {
            setProfiles(msg.data.profiles);
            if (!activeProfileId && msg.data.profiles[0]) {
              setActiveProfileId(msg.data.profiles[0].id);
            }
          }
          if (msg.data.mcps) setMcps(msg.data.mcps);
          if (msg.data.sessions) setSessions(msg.data.sessions);
          if (msg.data.telemetryRegistry) setTelemetryRegistry(msg.data.telemetryRegistry);
          if (msg.data.activeSession) {
            const s = msg.data.activeSession as ConversationSession;
            setActiveSessionId(s.id);
            setMessages(s.messages || []);
            const curProfs = msg.data.profiles || profiles;
            const sanitized = sanitizeSessionProfileAndModel(s.profileId, s.modelName, curProfs);
            setActiveProfileId(sanitized.profileId);
            setSelectedModel(sanitized.modelName);
            setEffort(s.effort || 'medium');
            setActiveProtocolRole(s.protocolRole);
          }
          break;

        case 'sessionChanged':
          if (msg.data.session) {
            const s = msg.data.session as ConversationSession;
            setActiveSessionId(s.id);
            setMessages(s.messages || []);
            const sanitized = sanitizeSessionProfileAndModel(s.profileId, s.modelName, profiles);
            setActiveProfileId(sanitized.profileId);
            setSelectedModel(sanitized.modelName);
            setEffort(s.effort || 'medium');
            setActiveProtocolRole(s.protocolRole);
          }
          if (msg.data.sessions) setSessions(msg.data.sessions);
          break;

        case 'triggerRolePrompt':
          if (msg.data) {
            const { role, file, lines, content, instruction } = msg.data;
            setActiveProtocolRole(role as ProtocolRole);
            if (file && content) {
              setAttachments([
                {
                  file,
                  lines,
                  content
                }
              ]);
            }
            handleSendMessage(instruction);
          }
          break;

        case 'activeEditorContext':
          if (msg.data) {
            setAttachments((prev) => {
              const exists = prev.some((a) => a.file === msg.data.file && a.lines === msg.data.lines);
              if (exists) return prev;
              return [...prev, msg.data];
            });
          }
          break;

        case 'mediaAttached':
          if (msg.data) {
            setAttachments((prev) => [...prev, msg.data]);
          }
          break;

        case 'workspaceFilesResult':
          if (msg.data.files) {
            setWorkspaceFiles(msg.data.files);
          }
          break;

        case 'fileContentResult':
          if (msg.data) {
            setAttachments((prev) => [
              ...prev,
              { file: msg.data.file, content: msg.data.content }
            ]);
          }
          break;

        case 'chatChunk':
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + msg.data.chunk }
              ];
            } else {
              return [
                ...prev,
                {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: msg.data.chunk,
                  profileId: activeProfileId,
                  modelName: selectedModel || 'Agente',
                  timestamp: Date.now(),
                  isStreaming: true
                }
              ];
            }
          });
          break;

        case 'telemetryUpdate':
          if (msg.data?.registry) {
            setTelemetryRegistry(msg.data.registry);
          }
          break;

        case 'chatDone':
          setIsGenerating(false);
          setMessages((prev) => {
            let finalized = prev;
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              finalized = [
                ...prev.slice(0, -1),
                { ...last, content: msg.data.fullResponse || last.content, isStreaming: false }
              ];
            }
            
            // Persistir la conversación automáticamente en disco
            if (activeSessionId) {
              vscode.postMessage({
                command: 'saveSessionMessages',
                sessionId: activeSessionId,
                messages: finalized,
                cliSessionId: msg.data.cliSessionId
              });
            }

            return finalized;
          });
          break;

        case 'chatError':
          setIsGenerating(false);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              content: `Error al ejecutar: ${msg.data.error}`,
              profileId: activeProfileId,
              modelName: 'Sistema',
              timestamp: Date.now()
            }
          ]);
          break;

        case 'fallbackAlert':
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              content: `⚠️ Fallback automático: ${msg.data.reason}. Conmutado a ${msg.data.to}.`,
              profileId: msg.data.to,
              modelName: 'Smart Router',
              timestamp: Date.now()
            }
          ]);
          setActiveProfileId(msg.data.to);
          break;

        case 'mcpSyncResult':
          setIsSyncing(false);
          if (msg.data.mcps) setMcps(msg.data.mcps);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeProfileId, selectedModel, activeSessionId]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const activeTelemetryKey = `${activeProfileId}::${selectedModel}`;
  const activeTelemetry = telemetryRegistry[activeTelemetryKey];

  const handleRefresh = () => {
    vscode.postMessage({ command: 'refreshProfiles' });
  };

  const handleOpenBeside = () => {
    vscode.postMessage({ command: 'openBeside' });
  };

  const handleLogin = (profileId: string) => {
    vscode.postMessage({ command: 'loginProfile', profileId });
  };

  const handleAddAccount = (provider: ProviderType, label: string) => {
    vscode.postMessage({ command: 'requestNativeAddAccount', provider, label });
  };

  const handleClearTelemetry = () => {
    vscode.postMessage({ command: 'clearTelemetry' });
  };

  const handleCreateNewSession = (projectName?: string, taskSlug?: string, role?: ProtocolRole) => {
    vscode.postMessage({
      command: 'createSession',
      title: taskSlug ? `Tarea: ${taskSlug}` : (projectName ? `${projectName} - Chat` : 'Nueva Conversación'),
      profileId: activeProfileId,
      modelName: selectedModel,
      effort,
      projectName,
      taskSlug,
      protocolRole: role || activeProtocolRole
    });
  };

  const handleSelectProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    const target = profiles.find((p) => p.id === profileId);
    const defaultModel = target?.activeModel || (target?.availableModels && target.availableModels[0]) || 'Claude 3.7 Sonnet';
    handleSelectModel(defaultModel, profileId);
  };

  const handleSelectModel = (modelName: string, overrideProfileId?: string) => {
    let profId = overrideProfileId || activeProfileId;

    // Conmutación inteligente de cuenta si el modelo pertenece a otro proveedor
    const isGoogleModel =
      modelName.startsWith('gemini-') ||
      modelName.startsWith('claude-opus-5') ||
      modelName.startsWith('claude-sonnet-5') ||
      modelName === 'gpt-oss-120b-medium';

    const isClaudeNativeModel =
      modelName.startsWith('Claude 3') ||
      modelName === 'Claude Opus 5.5';

    const currentProfile = profiles.find((p) => p.id === profId);
    if (isGoogleModel && currentProfile?.provider !== 'google') {
      const gProf = profiles.find((p) => p.provider === 'google');
      if (gProf) {
        profId = gProf.id;
        setActiveProfileId(profId);
      }
    } else if (isClaudeNativeModel && currentProfile?.provider !== 'claude') {
      const cProf = profiles.find((p) => p.provider === 'claude');
      if (cProf) {
        profId = cProf.id;
        setActiveProfileId(profId);
      }
    }

    setSelectedModel(modelName);

    // Adaptación dinámica de esfuerzo según variante de modelo:
    let newEffort: ReasoningEffort = effort;
    if (modelName.includes('-high') || modelName.includes('o3') || modelName.includes('o1') || modelName.includes('Max')) {
      newEffort = 'high';
    } else if (modelName.includes('-low') || modelName.includes('Haiku') || modelName.includes('Flash') || modelName.includes('mini')) {
      newEffort = 'low';
    } else if (modelName.includes('3.7') || modelName.includes('Sonnet') || modelName.includes('-medium') || modelName.includes('argon')) {
      newEffort = 'medium';
    }
    setEffort(newEffort);

    if (activeSessionId) {
      vscode.postMessage({
        command: 'updateSessionSettings',
        sessionId: activeSessionId,
        profileId: profId,
        modelName,
        effort: newEffort
      });
    }
  };

  const handleSelectEffort = (newEffort: ReasoningEffort) => {
    setEffort(newEffort);

    // Si el modelo activo contiene sufijo de esfuerzo (-high, -medium, -low), conmutar a la variante del modelo
    if (selectedModel.includes('-high') || selectedModel.includes('-medium') || selectedModel.includes('-low')) {
      const baseName = selectedModel.replace(/-high|-medium|-low/, '');
      const matchingVariant = `${baseName}-${newEffort === 'max' || newEffort === 'xhigh' ? 'high' : newEffort}`;
      setSelectedModel(matchingVariant);

      if (activeSessionId) {
        vscode.postMessage({
          command: 'updateSessionSettings',
          sessionId: activeSessionId,
          profileId: activeProfileId,
          modelName: matchingVariant,
          effort: newEffort
        });
      }
      return;
    }

    if (activeSessionId) {
      vscode.postMessage({
        command: 'updateSessionSettings',
        sessionId: activeSessionId,
        profileId: activeProfileId,
        modelName: selectedModel,
        effort: newEffort
      });
    }
  };

  const handleSelectProtocolRole = (role: ProtocolRole | undefined) => {
    setActiveProtocolRole(role);
    if (activeSessionId) {
      vscode.postMessage({
        command: 'updateSessionMeta',
        sessionId: activeSessionId,
        protocolRole: role
      });
    }
  };

  const handleSwitchSession = (sessionId: string) => {
    vscode.postMessage({ command: 'switchSession', sessionId });
  };

  const handleDeleteSession = (sessionId: string) => {
    vscode.postMessage({ command: 'deleteSession', sessionId });
  };

  const handleSyncMCPs = () => {
    setIsSyncing(true);
    vscode.postMessage({ command: 'syncMCPs' });
  };

  const handleTogglePortfolio = (mcpName: string, enable: boolean) => {
    vscode.postMessage({ command: 'togglePortfolioMCP', mcpName, enable });
  };

  const handleRequestActiveContext = () => {
    vscode.postMessage({ command: 'getActiveEditorContext' });
  };

  const handleSearchFiles = (query: string) => {
    vscode.postMessage({ command: 'searchWorkspaceFiles', query });
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSendMessage = (prompt: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      profileId: activeProfileId,
      modelName: 'Usuario',
      timestamp: Date.now(),
      attachments: [...attachments]
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsGenerating(true);

    if (activeSessionId) {
      vscode.postMessage({
        command: 'saveSessionMessages',
        sessionId: activeSessionId,
        messages: updatedMessages
      });
    }

    vscode.postMessage({
      command: 'sendMessage',
      profileId: activeProfileId,
      modelName: selectedModel,
      prompt,
      effort,
      attachments,
      protocolRole: activeProtocolRole
    });

    setAttachments([]);
  };

  const handleStop = () => {
    setIsGenerating(false);
    vscode.postMessage({ command: 'stopGeneration' });
  };

  const currentSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 select-none overflow-hidden relative">
      {/* Top Navbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'chat' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'sessions' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Ver y organizar historial por proyectos y carpetas"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Historial ({sessions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mcps')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'mcps' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>MCPs ({mcps.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('telemetry')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'telemetry' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Métricas</span>
          </button>

          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'accounts' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Cuentas ({profiles.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenBeside}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-indigo-300 transition"
            title="Abrir como pestaña dividida a la derecha (Beside)"
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            title="Refrescar estado"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'sessions' && (
          <div className="h-full flex flex-col min-h-0">
            <SessionDrawer
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={(id) => {
                handleSwitchSession(id);
                setActiveTab('chat');
              }}
              onCreateSession={(proj, task, role) => {
                handleCreateNewSession(proj, task, role);
                setActiveTab('chat');
              }}
              onDeleteSession={handleDeleteSession}
              onClose={() => setActiveTab('chat')}
              isInline={true}
            />
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex flex-col h-full space-y-2.5">
            {/* Session Switcher Bar */}
            <div className="flex items-center justify-between px-1 text-xs">
              <button
                type="button"
                onClick={() => setShowSessionDrawer(true)}
                className="flex items-center gap-1.5 text-zinc-300 hover:text-indigo-300 transition font-medium truncate max-w-[260px] p-1 rounded hover:bg-zinc-850"
                title="Abrir organizador de proyectos y tareas"
              >
                <FolderGit2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-zinc-500 font-mono text-[10px]">
                  {currentSession?.projectName || 'General'} /
                </span>
                <span className="truncate font-semibold text-zinc-200">
                  {currentSession?.title || 'Sesión Actual'}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('sessions')}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/60 transition"
                  title="Ver todas las sesiones organizadas por carpetas de proyectos"
                >
                  <Layers className="w-3 h-3 text-indigo-400" />
                  <span>Historial ({sessions.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSessionDrawer(true)}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow"
                  title="Crear nueva tarea en un proyecto"
                >
                  <Plus className="w-3 h-3" />
                  <span>Nueva Tarea</span>
                </button>
              </div>
            </div>

            {/* Account & Model Selector Bar */}
            <ModelAccountSelector
              profiles={profiles}
              activeProfileId={activeProfileId}
              selectedModel={selectedModel}
              onSelectProfile={handleSelectProfile}
              onSelectModel={handleSelectModel}
              onAddAccount={handleAddAccount}
              onLogin={handleLogin}
            />

            {/* Effort & Protocol Role Bar */}
            <div className="flex flex-col gap-1.5 px-1">
              <div className="flex items-center justify-between">
                <EffortSelector effort={effort} onChange={handleSelectEffort} />
              </div>
              <ProtocolRoleSelector
                selectedRole={activeProtocolRole}
                onSelectRole={handleSelectProtocolRole}
              />
            </div>

            <TelemetryBar
              activeTelemetry={activeTelemetry}
              accountName={activeProfile?.name || activeProfileId}
              modelName={selectedModel}
            />

            {/* Chat & Context Canvas */}
            <div className="flex-1 min-h-0">
              <ChatCanvas
                messages={messages}
                activeProfile={activeProfile}
                availableProfiles={profiles}
                isGenerating={isGenerating}
                rateLimitInfo={
                  activeTelemetry?.fiveHourUtilization !== undefined
                    ? { utilization: Math.min(100, Math.round(activeTelemetry.fiveHourUtilization * 100)) }
                    : null
                }
                attachments={attachments}
                workspaceFiles={workspaceFiles}
                onAddAttachment={(att) => setAttachments((prev) => [...prev, att])}
                onRemoveAttachment={handleRemoveAttachment}
                onRequestActiveContext={handleRequestActiveContext}
                onRequestAttachMedia={() => vscode.postMessage({ command: 'requestAttachMedia' })}
                onSaveClipboardMedia={(dataUri, fileName, mediaType) =>
                  vscode.postMessage({ command: 'saveClipboardMedia', dataUri, fileName, mediaType })
                }
                onSearchFiles={handleSearchFiles}
                onSendMessage={handleSendMessage}
                onStop={handleStop}
                onSwitchProfile={handleSelectProfile}
              />
            </div>
          </div>
        )}

        {activeTab === 'mcps' && (
          <MCPManagerView
            mcps={mcps}
            isSyncing={isSyncing}
            onSync={handleSyncMCPs}
            onTogglePortfolio={handleTogglePortfolio}
          />
        )}

        {activeTab === 'telemetry' && (
          <TelemetryDashboard
            telemetryRegistry={telemetryRegistry}
            onClearTelemetry={handleClearTelemetry}
          />
        )}

        {activeTab === 'accounts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold text-zinc-200">
                  Gestión de Cuentas Conectadas ({profiles.length})
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Suscripciones web activas sin cobro por tokens
                </p>
              </div>
              <button
                onClick={() => setShowGlobalAddModal(true)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Vincular Cuenta</span>
              </button>
            </div>

            <div className="space-y-2">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  isActive={profile.id === activeProfileId}
                  onSelect={() => setActiveProfileId(profile.id)}
                  onLogin={() => handleLogin(profile.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Session Drawer Modal */}
      {showSessionDrawer && (
        <SessionDrawer
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSwitchSession}
          onCreateSession={handleCreateNewSession}
          onDeleteSession={handleDeleteSession}
          onClose={() => setShowSessionDrawer(false)}
        />
      )}

      {/* Global Add Account Modal (Para Tab Cuentas) */}
      {showGlobalAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-full max-w-sm space-y-3 shadow-2xl">
            <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Vincular Nueva Cuenta / Suscripción</span>
            </h3>

            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setModalProvider('claude')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border transition ${
                  modalProvider === 'claude'
                    ? 'bg-orange-600/20 text-orange-300 border-orange-500/50'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                Claude Pro
              </button>
              <button
                type="button"
                onClick={() => setModalProvider('google')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border transition ${
                  modalProvider === 'google'
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                Google Gemini
              </button>
              <button
                type="button"
                onClick={() => setModalProvider('openai')}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border transition ${
                  modalProvider === 'openai'
                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                ChatGPT Plus
              </button>
            </div>

            {modalProvider === 'openai' ? (
              <div className="space-y-2 pt-1 text-[11px] text-zinc-300">
                <p>
                  Abre tu sesión de <strong>ChatGPT Plus / Pro</strong> directamente:
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleLogin('chatgpt-plus-web');
                    setShowGlobalAddModal(false);
                  }}
                  className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition"
                >
                  Abrir Sesión Web de ChatGPT
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <p className="text-[11px] text-zinc-400">
                  Etiqueta para aislar esta cuenta (ej: Trabajo, Personal, Cliente):
                </p>
                <input
                  type="text"
                  value={modalLabel}
                  onChange={(e) => setModalLabel(e.target.value)}
                  placeholder="Etiqueta (ej. Trabajo)"
                  className="w-full bg-zinc-800 text-zinc-100 text-xs rounded p-2 border border-zinc-700 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowGlobalAddModal(false)}
                    className="px-2.5 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!modalLabel.trim()}
                    onClick={() => {
                      handleAddAccount(modalProvider, modalLabel.trim());
                      setModalLabel('');
                      setShowGlobalAddModal(false);
                    }}
                    className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium shadow"
                  >
                    Crear y Autenticar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
