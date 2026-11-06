import React from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { ProviderType } from '../../shared/types';

const BADGE_STYLES: Record<ProviderType, string> = {
  claude: 'bg-orange-600/20 text-orange-400',
  google: 'bg-blue-600/20 text-blue-400',
  copilot: 'bg-emerald-600/20 text-emerald-400',
  ollama: 'bg-zinc-600/30 text-zinc-300'
};

const BADGE_CONTENT: Record<ProviderType, React.ReactNode> = {
  claude: 'C',
  google: <Sparkles className="w-3 h-3" />,
  copilot: <Bot className="w-3 h-3" />,
  ollama: 'O'
};

export const ProviderBadge: React.FC<{ provider: ProviderType }> = ({ provider }) => (
  <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[11px] shrink-0 ${BADGE_STYLES[provider]}`}>
    {BADGE_CONTENT[provider]}
  </span>
);
