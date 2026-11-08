import {
  BookOpen, Box, Container, Database, Eye, EyeOff, FileCheck, FileCode2, FileSpreadsheet, Gauge, Ghost,
  GitBranch, GitCommit, GitCompare, GitFork, GitPullRequest, HeartPulse, History, KeyRound, Lock, LucideIcon, Network, Play, Radio, RotateCcw,
  Scale, Shield, ShieldCheck, Smartphone, Trash2, Zap
} from 'lucide-react';

export const ACTION_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  'tests': { icon: Play, color: 'text-emerald-400' },
  'impacted-tests': { icon: Zap, color: 'text-yellow-400' },
  'dependency-audit': { icon: Shield, color: 'text-yellow-400' },
  'docker-up': { icon: Box, color: 'text-blue-400' },
  'flutter-test': { icon: Smartphone, color: 'text-teal-400' },
  'dev-sandbox': { icon: Container, color: 'text-sky-400' },
  'local-tunnel': { icon: Radio, color: 'text-indigo-400' },
  'worktree': { icon: GitBranch, color: 'text-amber-400' },
  'pull-request': { icon: GitPullRequest, color: 'text-purple-400' },
  'pre-push-hook': { icon: ShieldCheck, color: 'text-emerald-400' },
  'semantic-commit': { icon: GitCommit, color: 'text-blue-400' },
  'audit-branch': { icon: GitCompare, color: 'text-amber-400' },
  'rollback': { icon: RotateCcw, color: 'text-rose-400' },
  'scan-secrets': { icon: Lock, color: 'text-rose-400' },
  'review-sql': { icon: Database, color: 'text-cyan-400' },
  'detect-n-plus-one': { icon: Database, color: 'text-amber-400' },
  'audit-accessibility': { icon: Eye, color: 'text-sky-400' },
  'audit-env': { icon: KeyRound, color: 'text-yellow-400' },
  'sanitize-pii': { icon: EyeOff, color: 'text-teal-400' },
  'auto-heal': { icon: HeartPulse, color: 'text-rose-400' },
  'review-diff': { icon: Ghost, color: 'text-indigo-400' },
  'pr-summary': { icon: FileCheck, color: 'text-indigo-400' },
  'changelog': { icon: History, color: 'text-cyan-400' },
  'dead-code': { icon: Trash2, color: 'text-rose-400' },
  'licenses': { icon: Scale, color: 'text-violet-400' },
  'c4-diagram': { icon: Network, color: 'text-indigo-400' },
  'sequence-diagram': { icon: GitFork, color: 'text-pink-400' },
  'openapi': { icon: FileCode2, color: 'text-cyan-400' },
  'mock-data': { icon: FileSpreadsheet, color: 'text-emerald-400' },
  'load-test': { icon: Gauge, color: 'text-orange-400' },
  'runbook': { icon: BookOpen, color: 'text-blue-400' }
};
