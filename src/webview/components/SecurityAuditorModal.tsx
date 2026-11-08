import React from 'react';
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

  const handleFixWithAgent = () => {
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
    onSendToAgent(report);
    onClose();
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
          className={`p-3 rounded-xl border flex items-center justify-between ${
            totalIssues === 0
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {totalIssues === 0 ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {totalIssues === 0 ? 'Sin riesgos detectados' : `${totalIssues} hallazgo(s) encontrado(s)`}
              </div>
              <div className="text-[11px] text-zinc-400">
                {totalIssues === 0
                  ? 'No se encontraron secretos expuestos, variables huérfanas ni DDL destructivo.'
                  : 'Revisa las advertencias y envía un informe al agente para corregirlas.'}
              </div>
            </div>
          </div>

          {totalIssues > 0 && (
            <button
              type="button"
              onClick={handleFixWithAgent}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition cursor-pointer shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Corregir con Agente</span>
            </button>
          )}
        </div>

        {/* Secretos detectados */}
        {data.secretIssues.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-rose-300 px-1">
              <Key className="w-3.5 h-3.5 text-rose-400" />
              <span>Secretos y Tokens Expuestos ({data.secretIssues.length})</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.secretIssues.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2 hover:bg-zinc-850 transition cursor-pointer"
                  onClick={() => onPreviewFile(item.file, item.line)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-indigo-300 font-semibold">{item.file}:{item.line}</span>
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-400 text-[10px] border border-rose-500/30">
                        {item.type}
                      </span>
                    </div>
                    <div className="font-mono text-[10.5px] text-zinc-400 truncate mt-0.5">
                      {item.snippet}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Variables de entorno no documentadas */}
        {data.undocumentedEnvVars.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300 px-1">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Variables de Entorno no declaradas en .env.example ({data.undocumentedEnvVars.length})</span>
            </div>
            <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-wrap gap-1.5">
              {data.undocumentedEnvVars.map((v) => (
                <span key={v} className="px-2 py-0.5 rounded bg-zinc-800 text-amber-300 font-mono text-[11px] border border-zinc-700">
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Consultas SQL destructivas */}
        {data.sqlIssues.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-purple-300 px-1">
              <Database className="w-3.5 h-3.5 text-purple-400" />
              <span>Riesgos de Consultas y Sentencias SQL ({data.sqlIssues.length})</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.sqlIssues.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2 hover:bg-zinc-850 transition cursor-pointer"
                  onClick={() => onPreviewFile(item.file, item.line)}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-indigo-300 font-semibold">{item.file}:{item.line}</span>
                    <div className="text-zinc-300 text-[11px] mt-0.5">{item.issue}</div>
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
