import { exec } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { AccountProfile, ProviderType } from './types';

export class SessionManager {
  private homeDir: string;
  private agyBinaryPath: string;
  private cachedGcloudAccounts: string[] | null = null;
  private lastGcloudScan: number = 0;

  constructor() {
    this.homeDir = os.homedir();
    this.agyBinaryPath = path.join(this.homeDir, '.gemini', 'bin', 'agy.exe');
  }

  public async getProfilesStatus(forceRefresh = false): Promise<AccountProfile[]> {
    if (forceRefresh) {
      this.cachedGcloudAccounts = null;
    }

    const [claudeProfiles, geminiProfiles, gptProfiles, copilotProfile] = await Promise.all([
      this.discoverClaudeProfiles(),
      this.discoverGeminiProfiles(),
      this.discoverGptProfiles(),
      this.checkCopilotStatus()
    ]);

    const profiles: AccountProfile[] = [
      ...claudeProfiles,
      ...geminiProfiles,
      ...gptProfiles
    ];

    if (copilotProfile) {
      profiles.push(copilotProfile);
    }

    return profiles;
  }

  private async discoverClaudeProfiles(): Promise<AccountProfile[]> {
    const profiles: AccountProfile[] = [];
    
    // Cuenta principal (.claude)
    const mainDir = path.join(this.homeDir, '.claude');
    const mainProfile = await this.checkClaudeStatus('claude-main', 'Claude Pro (Principal)', mainDir);
    profiles.push(mainProfile);

    // Cuentas adicionales (.claude-*)
    try {
      const items = fs.readdirSync(this.homeDir);
      for (const item of items) {
        if (item.startsWith('.claude-') && !item.includes('.json')) {
          const configDir = path.join(this.homeDir, item);
          const stat = fs.statSync(configDir);
          if (stat.isDirectory()) {
            const cleanName = item.replace('.claude-', '');
            const displayName = `Claude Pro (${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)})`;
            const profile = await this.checkClaudeStatus(`claude-${cleanName}`, displayName, configDir);
            profiles.push(profile);
          }
        }
      }
    } catch {}

    // Si solo hay una, preparar slot para cuenta 2
    if (profiles.length === 1) {
      const p2Dir = path.join(this.homeDir, '.claude-profile-2');
      const p2 = await this.checkClaudeStatus('claude-profile-2', 'Claude Pro (Cuenta 2)', p2Dir);
      profiles.push(p2);
    }

    return profiles;
  }

  private async discoverGeminiProfiles(): Promise<AccountProfile[]> {
    const profiles: AccountProfile[] = [];

    // 1. Gemini / Antigravity Principal (~/.gemini)
    const mainProfile = await this.checkGoogleStatus('google-main', 'Google Gemini (Principal)', path.join(this.homeDir, '.gemini'));
    profiles.push(mainProfile);

    // 2. Cuentas detectadas desde gcloud auth list (deskopus@gmail.com, etc.)
    try {
      const gcloudAccounts = await this.getGcloudAccounts();
      for (const acc of gcloudAccounts) {
        // Ignorar cuentas de servicio de prueba y la cuenta principal
        if (acc.includes('gserviceaccount.com') || acc === mainProfile.email) continue;

        const slug = acc.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
        const profileId = `google-${slug}`;
        const configDir = path.join(this.homeDir, `.gemini-${slug}`);

        // Asegurar que exista su directorio de aislamiento con google_accounts.json
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(path.join(configDir, 'antigravity'), { recursive: true });
        }
        const accFile = path.join(configDir, 'google_accounts.json');
        if (!fs.existsSync(accFile)) {
          fs.writeFileSync(accFile, JSON.stringify({ active: acc, old: [] }, null, 2), 'utf8');
        }

        const displayName = `Google Gemini (${acc.split('@')[0]})`;
        const profile = await this.checkGoogleStatus(profileId, displayName, configDir);
        profile.email = acc;
        profiles.push(profile);
      }
    } catch {}

    // 3. Otras cuentas creadas manualmente en el filesystem (.gemini-*)
    try {
      const items = fs.readdirSync(this.homeDir);
      for (const item of items) {
        if (item.startsWith('.gemini-') && !item.includes('.json')) {
          const configDir = path.join(this.homeDir, item);
          const stat = fs.statSync(configDir);
          if (stat.isDirectory()) {
            const cleanName = item.replace('.gemini-', '');
            const profileId = `google-${cleanName}`;
            if (!profiles.some((p) => p.id === profileId)) {
              const displayName = `Google Gemini (${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)})`;
              const profile = await this.checkGoogleStatus(profileId, displayName, configDir);
              profiles.push(profile);
            }
          }
        }
      }
    } catch {}

    return profiles;
  }

  private getGcloudAccounts(): Promise<string[]> {
    // Si se escaneó hace menos de 5 minutos, devolver cache de inmediato (0 ms)
    const now = Date.now();
    if (this.cachedGcloudAccounts && (now - this.lastGcloudScan) < 300000) {
      return Promise.resolve(this.cachedGcloudAccounts);
    }

    return new Promise((resolve) => {
      exec('gcloud auth list --format="value(account)"', { timeout: 3000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve(this.cachedGcloudAccounts || ['0103juan@gmail.com', 'deskopus@gmail.com']);
        }
        const accounts = stdout
          .split(/\r?\n/)
          .map((a) => a.trim())
          .filter(Boolean);
        this.cachedGcloudAccounts = accounts;
        this.lastGcloudScan = Date.now();
        resolve(accounts);
      });
    });
  }

  private async discoverGptProfiles(): Promise<AccountProfile[]> {
    return [
      {
        id: 'chatgpt-free',
        name: 'ChatGPT / GPT-OSS 120B',
        provider: 'openai',
        status: fs.existsSync(this.agyBinaryPath) ? 'connected' : 'disconnected',
        subscriptionType: 'Open Source / Free',
        activeModel: 'gpt-oss-120b-medium',
        availableModels: ['gpt-oss-120b-medium']
      },
      {
        id: 'chatgpt-plus-web',
        name: 'ChatGPT Plus (Suscripción Web)',
        provider: 'openai',
        status: 'connected',
        subscriptionType: 'ChatGPT Plus / Pro',
        activeModel: 'GPT-4o (Web / Plus)',
        availableModels: ['GPT-4o', 'o1', 'o3-mini']
      }
    ];
  }

  private checkClaudeStatus(id: string, name: string, configDir: string): Promise<AccountProfile> {
    return new Promise((resolve) => {
      // Si es la cuenta principal (~/.claude), no forzar CLAUDE_CONFIG_DIR para que la CLI lea su contexto nativo completo con email
      const isDefaultMain = id === 'claude-main' || configDir === path.join(this.homeDir, '.claude');
      const env = isDefaultMain
        ? { ...process.env, CLAUDE_CONFIG_DIR: undefined }
        : { ...process.env, CLAUDE_CONFIG_DIR: configDir };

      // Helper para extraer email desde .credentials.json en caso de que la CLI devuelva email: null
      const extractFallbackEmail = (dir: string): string | undefined => {
        try {
          const credsPath = path.join(dir, '.credentials.json');
          if (fs.existsSync(credsPath)) {
            const raw = fs.readFileSync(credsPath, 'utf8');
            const data = JSON.parse(raw);
            if (data.mcpOAuth) {
              for (const k of Object.keys(data.mcpOAuth)) {
                const entry = data.mcpOAuth[k];
                if (entry && entry.accessToken && typeof entry.accessToken === 'string' && entry.accessToken.startsWith('eyJ')) {
                  const parts = entry.accessToken.split('.');
                  if (parts.length >= 2) {
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                    if (payload && payload.email) return payload.email;
                  }
                }
              }
            }
          }
        } catch {}
        return undefined;
      };

      exec('claude auth status', { env }, (error, stdout) => {
        const fallbackEmail = extractFallbackEmail(configDir);

        if (error) {
          try {
            const parsed = JSON.parse(stdout);
            return resolve({
              id,
              name,
              provider: 'claude',
              status: parsed.loggedIn ? 'connected' : 'disconnected',
              email: parsed.email || fallbackEmail || undefined,
              subscriptionType: parsed.subscriptionType || undefined,
              configDir,
              activeModel: 'Claude 3.7 Sonnet',
              availableModels: [
                'Claude 3.7 Sonnet',
                'Claude Opus 5.5',
                'Claude 3.5 Sonnet',
                'Claude 3.5 Haiku',
                'Claude 3 Opus'
              ]
            });
          } catch {
            return resolve({
              id,
              name,
              provider: 'claude',
              status: 'disconnected',
              configDir,
              activeModel: 'Claude 3.7 Sonnet',
              availableModels: [
                'Claude 3.7 Sonnet',
                'Claude Opus 5.5',
                'Claude 3.5 Sonnet',
                'Claude 3.5 Haiku',
                'Claude 3 Opus'
              ]
            });
          }
        }

        try {
          const parsed = JSON.parse(stdout);
          resolve({
            id,
            name,
            provider: 'claude',
            status: parsed.loggedIn ? 'connected' : 'disconnected',
            email: parsed.email || fallbackEmail || undefined,
            subscriptionType: parsed.subscriptionType || 'pro',
            configDir,
            activeModel: 'Claude 3.7 Sonnet',
            availableModels: [
              'Claude 3.7 Sonnet',
              'Claude Opus 5.5',
              'Claude 3.5 Sonnet',
              'Claude 3.5 Haiku',
              'Claude 3 Opus'
            ]
          });
        } catch {
          resolve({
            id,
            name,
            provider: 'claude',
            status: 'connected',
            email: fallbackEmail || undefined,
            configDir,
            activeModel: 'Claude 3.7 Sonnet',
            availableModels: [
              'Claude 3.7 Sonnet',
              'Claude Opus 5.5',
              'Claude 3.5 Sonnet',
              'Claude 3.5 Haiku',
              'Claude 3 Opus'
            ]
          });
        }
      });
    });
  }

  private checkGoogleStatus(id: string, name: string, configDir: string): Promise<AccountProfile> {
    return new Promise(async (resolve) => {
      // Verificar archivo google_accounts.json en el directorio
      const accFile = path.join(configDir, 'google_accounts.json');
      let email: string | undefined;
      let isConnected = fs.existsSync(this.agyBinaryPath);

      if (fs.existsSync(accFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(accFile, 'utf8'));
          if (parsed.active) {
            email = parsed.active;
            isConnected = true;
          }
        } catch {}
      }

      const defaultGoogleModels = [
        'gemini-4-argon-high',
        'gemini-4-argon-medium',
        'gemini-4-argon-low',
        'gemini-3.8-flash-high',
        'gemini-3.8-flash-medium',
        'gemini-3.8-flash-low',
        'gemini-3.6-flash-high',
        'gemini-3.6-flash-medium',
        'gemini-3.6-flash-low',
        'claude-opus-5-5-high',
        'claude-opus-5-5-medium',
        'claude-opus-5-5-low',
        'claude-sonnet-5-5-high',
        'claude-sonnet-5-5-medium',
        'claude-sonnet-5-5-low',
        'gpt-oss-120b-medium'
      ];

      let dynamicModels = defaultGoogleModels;
      try {
        if (isConnected) {
          const agyModels = await this.fetchAgyModels();
          if (agyModels && agyModels.length > 0) {
            dynamicModels = agyModels;
          }
        }
      } catch {}

      resolve({
        id,
        name,
        provider: 'google',
        status: isConnected ? 'connected' : 'disconnected',
        email,
        subscriptionType: 'Workspace / Personal',
        configDir,
        activeModel: dynamicModels[0] || 'gemini-4-argon-high',
        availableModels: dynamicModels
      });
    });
  }

  private fetchAgyModels(): Promise<string[]> {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.agyBinaryPath)) {
        return resolve([]);
      }
      exec(`"${this.agyBinaryPath}" models`, { timeout: 3500 }, (error, stdout) => {
        if (error || !stdout) {
          return resolve([]);
        }
        const models: string[] = [];
        for (const line of stdout.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.toLowerCase().includes('fetching')) continue;
          const parts = trimmed.split(/\s+/);
          if (parts[0] && !parts[0].includes('...')) {
            models.push(parts[0]);
          }
        }
        resolve(models.length > 0 ? models : []);
      });
    });
  }

  private async checkCopilotStatus(): Promise<AccountProfile | null> {
    try {
      if (typeof vscode.lm?.selectChatModels === 'function') {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (models && models.length > 0) {
          return {
            id: 'github-copilot',
            name: 'GitHub Copilot Chat',
            provider: 'copilot',
            status: 'connected',
            subscriptionType: 'Copilot Subscription',
            activeModel: models[0].name || 'GPT-4o',
            availableModels: models.map((m) => m.name || m.family || m.id)
          };
        }
      }
    } catch {}
    return null;
  }

  public createCustomAccount(provider: ProviderType, accountLabel: string): string {
    const slug = accountLabel.toLowerCase().replace(/[^a-z0-9]/g, '-');

    if (provider === 'claude') {
      const targetDir = path.join(this.homeDir, `.claude-${slug}`);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const terminal = vscode.window.createTerminal({
        name: `AgentHub: Login Claude (${accountLabel})`,
        env: { CLAUDE_CONFIG_DIR: targetDir }
      });
      terminal.show();
      terminal.sendText('claude auth login');
      return targetDir;
    } else if (provider === 'google') {
      const targetDir = path.join(this.homeDir, `.gemini-${slug}`);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(path.join(targetDir, 'antigravity'), { recursive: true });
      }

      // Si el label parece un correo o tiene @, guardarlo directamente
      const email = accountLabel.includes('@') ? accountLabel : undefined;
      const accFile = path.join(targetDir, 'google_accounts.json');
      if (email && !fs.existsSync(accFile)) {
        fs.writeFileSync(accFile, JSON.stringify({ active: email, old: [] }, null, 2), 'utf8');
      }

      const terminal = vscode.window.createTerminal({
        name: `AgentHub: Login Google (${accountLabel})`,
        env: {
          ANTIGRAVITY_GEMINI_DIR: targetDir,
          ANTIGRAVITY_APP_DATA_DIR: path.join(targetDir, 'antigravity')
        }
      });
      terminal.show();
      terminal.sendText('gcloud auth login');
      return targetDir;
    }

    return '';
  }

  public launchLoginTerminal(profileId: string): void {
    if (profileId.startsWith('claude')) {
      let targetDir = path.join(this.homeDir, '.claude');
      if (profileId.includes('profile-2')) {
        targetDir = path.join(this.homeDir, '.claude-profile-2');
      } else if (profileId.startsWith('claude-') && profileId !== 'claude-main') {
        const folderName = profileId.replace('claude-', '.claude-');
        targetDir = path.join(this.homeDir, folderName);
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const terminal = vscode.window.createTerminal({
        name: `AgentHub: Login ${profileId}`,
        env: { CLAUDE_CONFIG_DIR: targetDir }
      });
      terminal.show();
      terminal.sendText('claude auth login');
    } else if (profileId.startsWith('google')) {
      const terminal = vscode.window.createTerminal({
        name: `AgentHub: Login Google (${profileId})`
      });
      terminal.show();
      terminal.sendText('gcloud auth login');
    } else if (profileId === 'chatgpt-plus-web') {
      vscode.env.openExternal(vscode.Uri.parse('https://chatgpt.com'));
    }
  }
}
