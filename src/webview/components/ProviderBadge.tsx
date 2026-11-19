import React from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { ProviderType } from '../../shared/types';

const BADGE_STYLES: Record<ProviderType, string> = {
  claude: 'bg-orange-950/40 text-orange-400 border border-orange-500/50 shadow-xs shadow-orange-500/20',
  google: 'bg-blue-950/40 text-blue-400 border border-blue-500/50 shadow-xs shadow-blue-500/20',
  copilot: 'bg-violet-950/40 text-violet-400 border border-violet-500/50 shadow-xs shadow-violet-500/20',
  ollama: 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/50 shadow-xs shadow-emerald-500/20'
};

const BADGE_CONTENT: Record<ProviderType, React.ReactNode> = {
  claude: 'C',
  google: <Sparkles className="w-3 h-3 text-cyan-400" />,
  copilot: <Bot className="w-3 h-3 text-violet-400" />,
  ollama: 'O'
};

export const ProviderBadge: React.FC<{ provider: ProviderType }> = ({ provider }) => (
  <span className={`w-5 h-5 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 ${BADGE_STYLES[provider]}`}>
    {BADGE_CONTENT[provider]}
  </span>
);
