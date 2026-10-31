import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { MCPServerInfo } from './types';

export class MCPSyncer {
  private homeDir: string;
  private claude1JsonPath: string;
  private agyBinaryPath: string;

  constructor() {
    this.homeDir = os.homedir();
    this.claude1JsonPath = path.join(this.homeDir, '.claude.json');
    this.agyBinaryPath = path.join(this.homeDir, '.gemini', 'bin', 'agy.exe');
  }

  public async getMCPList(): Promise<MCPServerInfo[]> {
    const claudeServers = this.readClaudeMCPServers();
    const agyServers = await this.readAgyMCPServers();
    const portfolioServers = this.detectPortfolioMCPServers();

    const mcpMap = new Map<string, MCPServerInfo>();

    // 1. Servidores Cloud / Configurados en Claude Code
    for (const [name, config] of Object.entries(claudeServers)) {
      mcpMap.set(name, {
        id: `claude-${name}`,
        name,
        type: config.type || (config.url ? 'http' : 'stdio'),
        category: 'cloud',
        command: config.command,
        args: config.args,
        url: config.url,
        status: 'connected',
        syncedToClaude: true,
        syncedToGoogle: agyServers.has(name),
        enabled: true,
        description: `Servidor MCP registrado en Claude (${config.url || config.command})`
      });
    }

    // 2. Servidores detectados en Antigravity
    for (const name of agyServers) {
      if (!mcpMap.has(name)) {
        mcpMap.set(name, {
          id: `agy-${name}`,
          name,
          type: 'stdio',
          category: 'cloud',
          status: 'connected',
          syncedToClaude: false,
          syncedToGoogle: true,
          enabled: true,
          description: 'Servidor MCP registrado en Antigravity'
        });
      }
    }

    // 3. Servidores locales de tu portafolio
    for (const localMcp of portfolioServers) {
      const isConfiguredInClaude = mcpMap.has(localMcp.name);
      mcpMap.set(localMcp.name, {
        ...localMcp,
        syncedToClaude: isConfiguredInClaude,
        syncedToGoogle: agyServers.has(localMcp.name)
      });
    }

    return Array.from(mcpMap.values());
  }

  private detectPortfolioMCPServers(): MCPServerInfo[] {
    const servers: MCPServerInfo[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    
    // Rutas comunes de portafolio
    const candidates = [
      path.join(this.homeDir, 'Documents', 'GitHub', 'portafolio', 'secop-mcp'),
      path.join(this.homeDir, 'Documents', 'GitHub', 'portafolio', 'legacy-db-mcp')
    ];

    for (const ws of workspaceFolders) {
      candidates.push(path.join(ws.uri.fsPath, 'secop-mcp'));
      candidates.push(path.join(ws.uri.fsPath, 'legacy-db-mcp'));
    }

    const uniqueCandidates = Array.from(new Set(candidates));

    for (const dir of uniqueCandidates) {
      if (fs.existsSync(dir)) {
        const serverPy = path.join(dir, 'server.py');
        if (fs.existsSync(serverPy)) {
          const folderName = path.basename(dir);
          if (folderName === 'secop-mcp') {
            servers.push({
              id: 'local-secop-mcp',
              name: 'secop-mcp',
              type: 'stdio',
              category: 'local_portfolio',
              command: 'python',
              args: [serverPy],
              status: 'connected',
              syncedToClaude: false,
              syncedToGoogle: false,
              enabled: true,
              description: 'Servidor MCP de Contratación Estatal SECOP II (Entidades y Licitaciones)'
            });
          } else if (folderName === 'legacy-db-mcp') {
            servers.push({
              id: 'local-legacy-db-mcp',
              name: 'legacy-db-mcp',
              type: 'stdio',
              category: 'local_portfolio',
              command: 'python',
              args: [serverPy],
              status: 'connected',
              syncedToClaude: false,
              syncedToGoogle: false,
              enabled: true,
              description: 'Servidor MCP para Base de Datos SQLite/ERP Legacy'
            });
          }
        }
      }
    }

    return servers;
  }

  private readClaudeMCPServers(): Record<string, any> {
    try {
      if (fs.existsSync(this.claude1JsonPath)) {
        const content = fs.readFileSync(this.claude1JsonPath, 'utf8');
        const parsed = JSON.parse(content);
        return parsed.mcpServers || {};
      }
    } catch (e) {
      console.error('Error leyendo mcpServers de Claude:', e);
    }
    return {};
  }

  private readAgyMCPServers(): Promise<Set<string>> {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.agyBinaryPath)) {
        return resolve(new Set());
      }

      exec(`"${this.agyBinaryPath}" mcp list`, (error, stdout) => {
        const servers = new Set<string>();
        if (error || !stdout) {
          return resolve(servers);
        }

        const lines = stdout.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.toLowerCase().includes('no mcp servers') && !trimmed.startsWith('Name')) {
            const parts = trimmed.split(/\s+/);
            if (parts[0]) {
              servers.add(parts[0]);
            }
          }
        }
        resolve(servers);
      });
    });
  }

  public async togglePortfolioMCP(mcpName: string, enable: boolean): Promise<boolean> {
    const portfolioServers = this.detectPortfolioMCPServers();
    const server = portfolioServers.find((s) => s.name === mcpName);
    if (!server) return false;

    try {
      // 1. Agregar a ~/.claude.json
      if (fs.existsSync(this.claude1JsonPath)) {
        const config = JSON.parse(fs.readFileSync(this.claude1JsonPath, 'utf8'));
        config.mcpServers = config.mcpServers || {};
        if (enable) {
          config.mcpServers[server.name] = {
            command: server.command,
            args: server.args
          };
        } else {
          delete config.mcpServers[server.name];
        }
        fs.writeFileSync(this.claude1JsonPath, JSON.stringify(config, null, 2), 'utf8');
      }

      // 2. Agregar a agy.exe
      if (fs.existsSync(this.agyBinaryPath)) {
        if (enable && server.command && server.args) {
          const argsJoined = server.args.map((a) => `"${a}"`).join(' ');
          await new Promise<void>((res) => {
            exec(`"${this.agyBinaryPath}" mcp add "${server.name}" "${server.command}" ${argsJoined}`, () => res());
          });
        } else if (!enable) {
          await new Promise<void>((res) => {
            exec(`"${this.agyBinaryPath}" mcp remove "${server.name}"`, () => res());
          });
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  public async syncMCPs(): Promise<{ success: boolean; message: string }> {
    try {
      const claudeServers = this.readClaudeMCPServers();
      const serverNames = Object.keys(claudeServers);

      // Sincronizar hacia Google Antigravity
      if (fs.existsSync(this.agyBinaryPath)) {
        for (const [name, config] of Object.entries(claudeServers)) {
          let cmd = '';
          if (config.url) {
            cmd = `"${this.agyBinaryPath}" mcp add "${name}" "${config.url}"`;
          } else if (config.command) {
            const args = (config.args || []).map((a: string) => `"${a}"`).join(' ');
            cmd = `"${this.agyBinaryPath}" mcp add "${name}" "${config.command}" ${args}`;
          }

          if (cmd) {
            await new Promise<void>((res) => {
              exec(cmd, () => res());
            });
          }
        }
      }

      // Sincronizar hacia todas las demás carpetas .claude-* en HOME
      const homeFiles = fs.readdirSync(this.homeDir);
      for (const item of homeFiles) {
        if (item.startsWith('.claude-') && !item.includes('.json')) {
          const subDir = path.join(this.homeDir, item);
          const subConfig = path.join(subDir, 'claude.json');
          let parsed: any = {};
          if (fs.existsSync(subConfig)) {
            try {
              parsed = JSON.parse(fs.readFileSync(subConfig, 'utf8'));
            } catch {}
          }
          parsed.mcpServers = { ...(parsed.mcpServers || {}), ...claudeServers };
          fs.writeFileSync(subConfig, JSON.stringify(parsed, null, 2), 'utf8');
        }
      }

      return {
        success: true,
        message: `Sincronizados ${serverNames.length} servidores MCP entre todos los entornos y cuentas.`
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error en la sincronización.' };
    }
  }
}
