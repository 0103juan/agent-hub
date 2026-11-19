import React from 'react';

export interface LogoProps {
  className?: string;
  size?: number;
}

export const AgentHubIcon: React.FC<LogoProps> = ({ className = '', size = 20 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-200 ${className}`}
    >
      <defs>
        <linearGradient id="hubBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a0e17" />
          <stop offset="100%" stop-color="#07090e" />
        </linearGradient>
        <linearGradient id="hubBorder" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.8" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.7" />
        </linearGradient>
        <linearGradient id="hubGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="50%" stop-color="#0ea5e9" />
          <stop offset="100%" stop-color="#c084fc" />
        </linearGradient>
        <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#06b6d4" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect x="20" y="20" width="472" height="472" rx="112" fill="url(#hubBg)" stroke="url(#hubBorder)" strokeWidth="10" />
      <circle cx="256" cy="256" r="140" fill="url(#hubGlow)" />

      {/* Nodes */}
      <circle cx="256" cy="116" r="28" fill="#38bdf8" />
      <circle cx="256" cy="116" r="12" fill="#ffffff" />
      <circle cx="132" cy="330" r="28" fill="#06b6d4" />
      <circle cx="132" cy="330" r="12" fill="#ffffff" />
      <circle cx="380" cy="330" r="28" fill="#c084fc" />
      <circle cx="380" cy="330" r="12" fill="#ffffff" />

      {/* Neural Beams */}
      <path d="M 256 128 L 140 326" stroke="#06b6d4" strokeWidth="22" strokeLinecap="round" />
      <path d="M 256 128 L 372 326" stroke="#c084fc" strokeWidth="22" strokeLinecap="round" />
      <path d="M 188 238 L 324 238" stroke="url(#hubGrad)" strokeWidth="20" strokeLinecap="round" />

      {/* Core Singularity */}
      <polygon points="256,204 286,221 286,255 256,272 226,255 226,221" fill="#07090e" stroke="url(#hubGrad)" strokeWidth="8" />
      <circle cx="256" cy="238" r="9" fill="#ffffff" />

      {/* MCP Downlink */}
      <path d="M 256 272 L 256 384" stroke="url(#hubGrad)" strokeWidth="12" strokeLinecap="round" strokeDasharray="1 24" />
      <circle cx="256" cy="392" r="16" fill="#06b6d4" />
      <circle cx="256" cy="392" r="6" fill="#ffffff" />
    </svg>
  );
};

export interface BrandLockupProps {
  compact?: boolean;
  onClick?: () => void;
}

export const AgentHubBrand: React.FC<BrandLockupProps> = ({ compact = false, onClick }) => {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`flex items-center gap-2 select-none group ${onClick ? 'cursor-pointer' : ''}`}
      title="AgentHub — Orquestador Multi-Agente & MCPs"
    >
      <div className="relative flex items-center justify-center">
        <AgentHubIcon size={compact ? 18 : 22} className="group-hover:scale-105 transition-transform" />
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-[#07090e] animate-pulse" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-semibold tracking-tight text-xs md:text-sm text-slate-100">
          Agent<span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-200 bg-clip-text text-transparent">Hub</span>
        </span>
        {!compact && (
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest hidden lg:inline">
            v0.1.0
          </span>
        )}
      </div>
    </div>
  );
};
