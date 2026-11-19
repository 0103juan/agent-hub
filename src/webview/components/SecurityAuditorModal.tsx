import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Key,
  FileCode,
  Database,
  Sliders,
  Send,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  X
} from 'lucide-react';
import { ModalShell } from './ModalShell';

export interface SecurityAuditData {
  secretIssues: Array<{ file: string; line: number; type: string; snippet: string }>;
  undocumentedEnvVars: string[];
  sqlIssues: Array<{ file: string; line: number; issue: string }>;
}

interface Props {
  data: SecurityAuditData;
  onClose: () => void;
  onSendToAgent: (prompt: string) => void;
  onPreviewFile: (file: string, line?: number) => void;
}

export const SecurityAuditorModal: React.FC<Props> = ({
  data,
  onClose,
  onSendToAgent,
  onPreviewFile
}) => {
  const totalIssues =
    data.secretIssues.length + data.undocumentedEnvVars.length + data.sqlIssues.length;

  const [copied, setCopied] = useState(false);
  const buildReport = () => {
    let report = '[AUDITORÍA DE SEGURIDAD Y CÓDIGO - HALLAZGOS DETECTADOS]\n\n';

    if (data.secretIssues.length > 0) {
      report += '### ⚠️ Secretos y Tokens Expuestos en Código:\n';
      for (const s of data.secretIssues) {
        report += `- **${s.file}:${s.line}**: Tipo "${s.type}" detectado en \`${s.snippet}\`\n`;
      }
      report += '\n';
    }

    if (data.undocumentedEnvVars.length > 0) {
      report += '### 📄 Variables de Entorno no documentadas en .env.example:\n';
      for (const v of data.undocumentedEnvVars) {
        report += `- Variable referenciada en código pero ausente en .env.example: \`${v}\`\n`;
      }
      report += '\n';
    }

    if (data.sqlIssues.length > 0) {
      report += '### 🗄️ Sentencias SQL Destructivas o Riesgosas:\n';
      for (const sql of data.sqlIssues) {
        report += `- **${sql.file}:${sql.line}**: ${sql.issue}\n`;
      }
      report += '\n';
    }

    report += 'Por favor formula un plan y realiza las correcciones necesarias de forma segura.';
    return report;
  };

  const handleFixWithAgent = () => {
    onSendToAgent(buildReport());
    onClose();
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <ModalShell
      title="Auditor de Seguridad, Entorno y SQL"
      icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
      widthClass="max-w-3xl"
      onClose={onClose}
    >
      <div className="p-4 space-y-4 text-xs">
        {/* Banner Resumen */}
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
            totalIssues === 0
              ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300 shadow-sm'
              : 'bg-amber-950/25 border-amber-500/40 text-amber-300 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-3">
            {totalIssues === 0 ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div>
              <div className="font-bold text-sm tracking-wide">
                {totalIssues === 0 ? 'Sin riesgos detectados' : `${totalIssues} hallazgo(s) encontrado(s)`}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                {totalIssues === 0
                  ? 'No se encontraron secretos expuestos, variables huérfanas ni DDL destructivo.'
                  : `${data.secretIssues.length} secretos · ${data.undocumentedEnvVars.length} variables sin documentar · ${data.sqlIssues.length} sentencias SQL de riesgo`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {totalIssues > 0 && (
              <button
                type="button"
                onClick={handleCopyReport}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0c1220] hover:bg-[#162035] text-slate-300 hover:text-white border border-[#202b3f] font-mono text-xs font-medium transition cursor-pointer shadow-xs"
                title="Copiar el informe en Markdown"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar informe'}</span>
              </button>
            )}
            {totalIssues > 0 && (
              <button
                type="button"
                onClick={handleFixWithAgent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-bold transition cursor-pointer shadow-md shadow-cyan-600/30 text-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Corregir con Agente</span>
              </button>
            )}
          </div>
        </div>

        {/* Secretos detectados */}
        {data.secretIssues.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold font-mono text-rose-400 px-1 uppercase tracking-wide">
              <Key className="w-3.5 h-3.5 text-rose-400" />
              <span>Secretos y Tokens Expuestos ({data.secretIssues.length})</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {data.secretIssues.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-[#07090e] border border-[#202b3f] hover:border-rose-500/40 hover:bg-[#0c1220]/80 transition cursor-pointer group"
                  onClick={() => onPreviewFile(item.file, item.line)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-cyan-300 font-bold group-hover:underline text-xs">{item.file}:{item.line}</span>
                    <span className="px-2 py-0.5 rounded-md bg-rose-950/60 text-rose-400 text-[9px] font-mono font-bold border border-rose-500/40 uppercase">
                      {item.type}
                    </span>
                  </div>
                  <div className="font-mono text-[10.5px] text-slate-400 truncate mt-1 bg-[#07090e] p-1.5 rounded-lg border border-[#202b3f]">
                    {item.snippet}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Variables de entorno no documentadas */}
        {data.undocumentedEnvVars.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold font-mono text-amber-400 px-1 uppercase tracking-wide">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Variables de Entorno no declaradas en .env.example ({data.undocumentedEnvVars.length})</span>
            </div>
            <div className="p-3 rounded-xl bg-[#07090e] border border-amber-500/30 flex flex-wrap gap-2">
              {data.undocumentedEnvVars.map((v) => (
                <span key={v} className="px-2.5 py-1 rounded-md bg-amber-950/50 text-amber-300 font-mono text-xs font-bold border border-amber-500/40 shadow-xs">
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Consultas SQL destructivas */}
        {data.sqlIssues.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold font-mono text-violet-400 px-1 uppercase tracking-wide">
              <Database className="w-3.5 h-3.5 text-violet-400" />
              <span>Riesgos de Consultas y Sentencias SQL ({data.sqlIssues.length})</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {data.sqlIssues.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-[#07090e] border border-[#202b3f] hover:border-violet-500/40 hover:bg-[#0c1220]/80 transition cursor-pointer group"
                  onClick={() => onPreviewFile(item.file, item.line)}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-cyan-300 font-bold group-hover:underline text-xs">{item.file}:{item.line}</span>
                    <div className="text-slate-200 text-xs mt-1 font-mono">{item.issue}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
