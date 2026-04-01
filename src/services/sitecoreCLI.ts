import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

export interface ValidateResult {
    success: boolean;
    output: string;
    error?: string;
    issues: ValidationIssue[];
    errorCount: number;
    warningCount: number;
}

export interface ValidationIssue {
    severity: 'Error' | 'Warning' | 'Info';
    itemPath: string;
    message: string;
}

export interface WhatIfResult {
    success: boolean;
    output: string;
    error?: string;
    changes: WhatIfChange[];
}

export interface WhatIfChange {
    action: 'Create' | 'Update' | 'Delete' | 'Skip';
    itemPath: string;
    itemId?: string;
    fields?: FieldChange[];
}

export interface FieldChange {
    name: string;
    oldValue?: string;
    newValue?: string;
}

export interface XmCloudEnvironment {
    name: string;
    host: string;
    isDefault: boolean;
}

export class SitecoreCLI {
    private workspaceRoot: string;  // git root (for file discovery)
    private cliRoot: string;        // directory containing sitecore.json (for CLI commands)

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.cliRoot = this._findCliRoot(workspaceRoot);
    }

    private _findCliRoot(searchRoot: string): string {
        const queue: string[] = [searchRoot];
        const visited = new Set<string>();
        let depth = 0;

        while (queue.length > 0 && depth <= 4) {
            const nextLevel: string[] = [];
            for (const dir of queue) {
                if (visited.has(dir)) { continue; }
                visited.add(dir);

                const candidate = path.join(dir, 'sitecore.json');
                if (fs.existsSync(candidate)) {
                    return dir;
                }

                try {
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (entry.isDirectory() &&
                            !entry.name.startsWith('.') &&
                            entry.name !== 'node_modules' &&
                            entry.name !== 'dist' &&
                            entry.name !== 'bin' &&
                            entry.name !== 'obj') {
                            nextLevel.push(path.join(dir, entry.name));
                        }
                    }
                } catch { /* permission denied etc. – skip */ }
            }
            queue.length = 0;
            queue.push(...nextLevel);
            depth++;
        }

        return searchRoot;
    }

    public getCliRoot(): string { return this.cliRoot; }

    public getXmCloudConnectedHost(): string | null {
        const userJsonPaths = [
            path.join(this.cliRoot, '.sitecore', 'user.json'),
            path.join(this.workspaceRoot, '.sitecore', 'user.json'),
        ];

        for (const filePath of userJsonPaths) {
            try {
                const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const endpoints = json?.endpoints;
                if (!endpoints || typeof endpoints !== 'object') { continue; }

                const defaultKey: string = json.defaultEndpoint || 'default';
                const activeEndpoint = endpoints[defaultKey] || endpoints['default'];
                if (!activeEndpoint) { continue; }

                const host: string | undefined = activeEndpoint.host;
                if (host && typeof host === 'string' && host.trim()) {
                    return host.trim().replace(/\/$/, '');
                }
            } catch { /* file missing or invalid JSON – skip */ }
        }

        return null;
    }

    public getXmCloudEnvironments(): XmCloudEnvironment[] {
        const userJsonPaths = [
            path.join(this.cliRoot, '.sitecore', 'user.json'),
            path.join(this.workspaceRoot, '.sitecore', 'user.json'),
        ];

        for (const filePath of userJsonPaths) {
            try {
                const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const endpoints = json?.endpoints;
                if (!endpoints || typeof endpoints !== 'object') { continue; }

                const defaultKey: string = (json.defaultEndpoint || 'default').toLowerCase();
                const envs: XmCloudEnvironment[] = [];

                for (const [name, ep] of Object.entries(endpoints)) {
                    const endpoint = ep as Record<string, unknown>;
                    if (!endpoint.ref) { continue; }
                    const host = typeof endpoint.host === 'string' ? endpoint.host.trim().replace(/\/$/, '') : '';
                    envs.push({ name, host, isDefault: name.toLowerCase() === defaultKey });
                }

                if (envs.length > 0) { return envs; }
            } catch { /* file missing or invalid JSON – skip */ }
        }

        return [];
    }

    public async connectToEnvironment(environmentId: string): Promise<{ success: boolean; error?: string }> {
        const command = `dotnet sitecore cloud environment connect --environment-id ${environmentId} --allow-write true`;
        try {
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Connecting to XM Cloud Environment',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: `Connecting to environment ${environmentId}...` });
                await execAsync(command, { cwd: this.cliRoot, timeout: 120000 });
                vscode.window.showInformationMessage('Connected to XM Cloud environment!');
                return { success: true };
            });
        } catch (error: any) {
            const msg = (error.stdout || '') + (error.stderr || '') + (error.message || '');
            return { success: false, error: msg.trim() || error.message || 'Unknown error' };
        }
    }

    public async setDefaultEnvironment(environmentName: string): Promise<{ success: boolean; error?: string }> {
        const command = `dotnet sitecore environment set-default -n ${environmentName}`;
        try {
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Setting Default Environment',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: `Setting "${environmentName}" as default...` });
                await execAsync(command, { cwd: this.cliRoot, timeout: 30000 });
                vscode.window.showInformationMessage(`"${environmentName}" is now the default environment.`);
                return { success: true };
            });
        } catch (error: any) {
            const msg = (error.stdout || '') + (error.stderr || '') + (error.message || '');
            return { success: false, error: msg.trim() || error.message || 'Unknown error' };
        }
    }

    public async checkAuthentication(): Promise<{ authenticated: boolean; error?: string }> {
        try {
            await execAsync('dotnet sitecore cloud environment info', { cwd: this.cliRoot, timeout: 5000 });
            return { authenticated: true };
        } catch (error: any) {
            const output = (error.stdout || '') + (error.stderr || '');
            if (output.includes('not logged in') ||
                output.includes('authentication') ||
                output.includes('login required') ||
                output.includes('token') ||
                output.includes('unauthorized')) {
                return { authenticated: false, error: 'Authentication required' };
            }
            return { authenticated: true };
        }
    }

    public detectHost(): string | null {
        const candidates = [
            path.join(this.workspaceRoot, '.sitecore', 'user.json'),
            path.join(this.workspaceRoot, 'sitecore.json'),
        ];

        for (const filePath of candidates) {
            try {
                const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const url = this._findUrlInObject(json);
                if (url) { return url; }
            } catch { /* file missing or invalid JSON – skip */ }
        }

        try {
            const sitecoreDir = path.join(this.workspaceRoot, '.sitecore');
            for (const file of fs.readdirSync(sitecoreDir)) {
                if (!file.endsWith('.json')) { continue; }
                const filePath = path.join(sitecoreDir, file);
                try {
                    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    const url = this._findUrlInObject(json);
                    if (url) { return url; }
                } catch { /* skip */ }
            }
        } catch { /* .sitecore dir doesn't exist – skip */ }

        return null;
    }

    /** Recursively walk a parsed JSON object and return the first http(s) URL found. */
    private _findUrlInObject(obj: unknown, depth = 0): string | null {
        if (depth > 6) { return null; }
        if (typeof obj === 'string') {
            const trimmed = obj.trim();
            if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
                return trimmed.replace(/\/$/, '');
            }
        }
        if (obj && typeof obj === 'object') {
            for (const val of Object.values(obj)) {
                const found = this._findUrlInObject(val, depth + 1);
                if (found) { return found; }
            }
        }
        return null;
    }

    public async connectToHost(cmHost: string, authority?: string): Promise<{ success: boolean; error?: string }> {
        const authorityUrl = (authority && authority.trim()) ? authority.trim() : cmHost;
        const command = `dotnet sitecore login --authority ${authorityUrl} --cm ${cmHost} --allow-write true`;

        try {
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Sitecore Connection',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: `Connecting to ${cmHost}...` });
                await execAsync(command, { cwd: this.cliRoot, timeout: 300000 });
                vscode.window.showInformationMessage(`Connected to ${cmHost}!`);
                return { success: true };
            });
        } catch (error: any) {
            const errorOutput = (error.stdout || '') + (error.stderr || '') + (error.message || '');
            if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
                return { success: false, error: 'Connection timed out. Please try again.' };
            }
            return { success: false, error: errorOutput.trim() || error.message || 'Unknown error' };
        }
    }

    public async login(): Promise<{ success: boolean; error?: string }> {
        try {
            const action = await vscode.window.showInformationMessage(
                'Sitecore CLI Authentication Required — your session has expired. Would you like to login now?',
                'Login Now',
                'Cancel'
            );

            if (action !== 'Login Now') {
                return { success: false, error: 'Login cancelled by user' };
            }

            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Sitecore Login',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Opening browser for authentication...' });

                const cfg = vscode.workspace.getConfiguration('sitecoreSerializer');
                const savedHost      = cfg.get<string>('sitecoreHost') || '';
                const savedAuthority = cfg.get<string>('sitecoreAuthority') || '';
                const loginCmd = savedHost
                    ? `dotnet sitecore login --authority ${savedAuthority || savedHost} --cm ${savedHost} --allow-write true`
                    : 'dotnet sitecore login';

                await execAsync(loginCmd, { cwd: this.cliRoot, timeout: 120000 });
                vscode.window.showInformationMessage('Successfully logged in to Sitecore!');
                return { success: true };
            });
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async handlePluginMissingError(output: string): Promise<boolean> {
        if (!output.toLowerCase().includes('could not locate plugin')) {
            return false;
        }

        const match = output.match(/Could not locate plugin\s+([\w.@]+)/i);
        const pluginName = match ? match[1].split('@')[0] : 'Sitecore.DevEx.Extensibility.Serialization';

        const action = await vscode.window.showErrorMessage(
            `Sitecore CLI plugin not installed: ${pluginName}\n\nRun "dotnet sitecore plugin install" in your project root to install all required plugins.`,
            'Install Plugins Now',
            'Copy Command'
        );

        if (action === 'Install Plugins Now') {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Installing Sitecore CLI Plugins',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Running dotnet sitecore plugin install...' });
                try {
                    await execAsync('dotnet sitecore plugin install', { cwd: this.cliRoot, timeout: 120000 });
                    vscode.window.showInformationMessage('Sitecore CLI plugins installed. Please retry your action.');
                } catch (err: any) {
                    const errMsg = (err.stdout || '') + (err.stderr || '') + (err.message || '');
                    vscode.window.showErrorMessage(`Plugin install failed: ${errMsg}`);
                }
            });
        } else if (action === 'Copy Command') {
            await vscode.env.clipboard.writeText('dotnet sitecore plugin install');
            vscode.window.showInformationMessage('Command copied! Run it in your project root, then retry.');
        }

        return true;
    }

    private isAuthenticationError(output: string): boolean {
        const authErrorPatterns = [
            'not logged in',
            'authentication',
            'login required',
            'unauthorized',
            'token',
            'refresh token was corrupted',
            'refresh token expired',
            're-login to your environment',
            'please re-login',
            'session expired'
        ];

        const lowerOutput = output.toLowerCase();
        return authErrorPatterns.some(pattern => lowerOutput.includes(pattern));
    }

    private async executeWithAuth(
        command: string,
        commandName: string
    ): Promise<{ success: boolean; output: string; error?: string }> {
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: this.cliRoot,
                maxBuffer: 1024 * 1024 * 10
            });
            return { success: true, output: stdout + (stderr || '') };
        } catch (error: any) {
            const errorOutput = (error.stdout || '') + (error.stderr || '');

            if (await this.handlePluginMissingError(errorOutput + error.message)) {
                return {
                    success: false,
                    output: errorOutput,
                    error: 'Sitecore CLI plugin not installed. Please install plugins and retry.'
                };
            }

            if (this.isAuthenticationError(errorOutput)) {
                vscode.window.showWarningMessage(`Authentication required for ${commandName}`);

                const loginResult = await this.login();
                if (!loginResult.success) {
                    return {
                        success: false,
                        output: errorOutput,
                        error: 'Authentication failed: ' + (loginResult.error || 'Login cancelled')
                    };
                }

                try {
                    const { stdout, stderr } = await execAsync(command, {
                        cwd: this.cliRoot,
                        maxBuffer: 1024 * 1024 * 10
                    });
                    return { success: true, output: stdout + (stderr || '') };
                } catch (retryError: any) {
                    return {
                        success: false,
                        output: (retryError.stdout || '') + (retryError.stderr || ''),
                        error: retryError.message
                    };
                }
            }

            return { success: false, output: errorOutput, error: error.message };
        }
    }

    public async pullWhatIf(): Promise<WhatIfResult> {

        const result = await this.executeWithAuth(
            'dotnet sitecore ser pull -t --what-if',
            'Pull Preview'
        );

        if (!result.success && !result.output.includes('What if mode is active')) {
            return {
                success: false,
                output: result.output,
                error: result.error,
                changes: []
            };
        }

        const changes = this.parseWhatIfOutput(result.output);

        return {
            success: true,
            output: result.output,
            error: result.error,
            changes
        };
    }

    public async pushWhatIf(): Promise<WhatIfResult> {

        const result = await this.executeWithAuth(
            'dotnet sitecore ser push -t --what-if',
            'Push Preview'
        );

        if (!result.success && !result.output.includes('What if mode is active')) {
            return {
                success: false,
                output: result.output,
                error: result.error,
                changes: []
            };
        }

        const changes = this.parseWhatIfOutput(result.output);

        return {
            success: true,
            output: result.output,
            error: result.error,
            changes
        };
    }

    private parseWhatIfOutput(output: string): WhatIfChange[] {
        const changes: WhatIfChange[] = [];
        const lines = output.split('\n');
        let currentItem: WhatIfChange | null = null;
        let currentFieldName: string | null = null;

        for (const line of lines) {
            const trimmed = line.trim();

            // Lines from CLI look like: "[master] >  en#1: __Revision" or "[master] >  'old' -> 'new'"
            // We only process lines that contain '>'
            if (trimmed.includes('>') && currentItem) {
                // Skip timing/statistics lines (e.g. "> 4.7ms", "> 243ms overall")
                if (trimmed.match(/>\s*[\d.]+m?s/) || trimmed.match(/overall|node/i)) {
                    continue;
                }

                // Check if this is a value line: >  'oldValue' -> 'newValue'
                // The line may have a [master] prefix so we search for the pattern anywhere
                const valueMatch = trimmed.match(/>\s*'([^']*)'\s*->\s*'([^']*)'$/);
                if (valueMatch && currentFieldName) {
                    if (currentItem.fields && currentItem.fields.length > 0) {
                        const lastField = currentItem.fields[currentItem.fields.length - 1];
                        if (lastField) {
                            lastField.oldValue = valueMatch[1];
                            lastField.newValue = valueMatch[2];
                        }
                    }
                    currentFieldName = null;
                    continue;
                }

                // Otherwise treat as a field name line: >  [U] en#1: __Revision  or  >  en#1: __Revision
                // Skip lines that contain quotes but no arrow (stray value lines we couldn't parse)
                if (trimmed.includes("'")) {
                    continue;
                }

                const fieldMatch = trimmed.match(/>\s*\[([AUD])\]\s*(.+)/) ||
                                   trimmed.match(/>\s*([^\[].+)/);

                if (fieldMatch) {
                    let fieldInfo = (fieldMatch[2] || fieldMatch[1]).trim();
                    // Remove language/version prefix (e.g. "en#1: " -> "")
                    currentFieldName = fieldInfo.replace(/^[a-z]{2}#\d+:\s*/i, '');

                    if (!currentItem.fields) {
                        currentItem.fields = [];
                    }
                    currentItem.fields.push({
                        name: currentFieldName,
                        oldValue: undefined,
                        newValue: undefined
                    });
                }
                continue;
            }

            // Skip lines that don't start with '['
            if (!trimmed.startsWith('[')) {
                continue;
            }

            // If we were tracking a previous item, save it before starting a new one
            if (currentItem && currentItem.fields && currentItem.fields.length > 0) {
                // Item already added, just continue
            }

            // Parse main item line
            // Try pattern with database: [master] [A] /path (guid)
            // Make sure to capture full path including spaces
            let cliMatch = trimmed.match(/\[([^\]]+)\]\s+\[([AUD])\]\s+(\/sitecore\/[^(]+?)(?:\s+\(([a-fA-F0-9-]+)\))?$/);
            
            // Try pattern without database: [A] /path (guid)
            if (!cliMatch) {
                cliMatch = trimmed.match(/\[([AUD])\]\s+(\/sitecore\/[^(]+?)(?:\s+\(([a-fA-F0-9-]+)\))?$/);
                if (cliMatch) {
                    // Rearrange matches to align with first pattern
                    cliMatch = [cliMatch[0], 'master', cliMatch[1], cliMatch[2], cliMatch[3]];
                }
            }
            
            if (cliMatch) {
                const action = cliMatch[2];
                let itemPath = cliMatch[3];
                const itemId = cliMatch[4];
                
                // Trim any trailing whitespace from the path
                itemPath = itemPath.trim();
                
                let actionType: 'Create' | 'Update' | 'Delete' | 'Skip';
                if (action === 'A') {
                    actionType = 'Create';
                } else if (action === 'U') {
                    actionType = 'Update';
                } else if (action === 'D') {
                    actionType = 'Delete';
                } else {
                    actionType = 'Skip';
                }
                
                currentItem = {
                    action: actionType,
                    itemPath,
                    itemId,
                    fields: []
                };
                
                changes.push(currentItem);
                continue;
            }

            // Fallback: old pattern matching
            if (trimmed.includes('would create') || trimmed.includes('Create')) {
                currentItem = this.parseChangeLine(trimmed, 'Create');
                changes.push(currentItem);
            } else if (trimmed.includes('would update') || trimmed.includes('Update')) {
                currentItem = this.parseChangeLine(trimmed, 'Update');
                changes.push(currentItem);
            } else if (trimmed.includes('would delete') || trimmed.includes('Delete')) {
                currentItem = this.parseChangeLine(trimmed, 'Delete');
                changes.push(currentItem);
            } else if (trimmed.includes('would skip') || trimmed.includes('Skip')) {
                currentItem = this.parseChangeLine(trimmed, 'Skip');
                changes.push(currentItem);
            }
        }

        return changes;
    }

    private parseChangeLine(line: string, action: 'Create' | 'Update' | 'Delete' | 'Skip'): WhatIfChange {
        // Try to extract item path (usually in quotes or after "item:")
        let itemPath = 'Unknown';
        
        const pathMatch = line.match(/['"]([^'"]+)['"]/);
        if (pathMatch) {
            itemPath = pathMatch[1];
        } else if (line.includes('/sitecore/')) {
            const sitecoreMatch = line.match(/(\/sitecore\/[^\s,]+)/);
            if (sitecoreMatch) {
                itemPath = sitecoreMatch[1];
            }
        }

        // Try to extract item ID
        const idMatch = line.match(/\{([a-fA-F0-9-]{36})\}/);
        const itemId = idMatch ? idMatch[1] : undefined;

        return {
            action,
            itemPath,
            itemId
        };
    }

    public async pull(): Promise<{ success: boolean; output: string; error?: string }> {
        return this.executeWithAuth('dotnet sitecore ser pull', 'Pull');
    }

    public async push(): Promise<{ success: boolean; output: string; error?: string }> {
        return this.executeWithAuth('dotnet sitecore ser push', 'Push');
    }

    public async validate(): Promise<ValidateResult> {
        const result = await this.executeWithAuth('dotnet sitecore ser validate', 'Validate');
        return this._buildValidateResult(result);
    }

    public async validateFix(): Promise<ValidateResult> {
        const result = await this.executeWithAuth('dotnet sitecore ser validate --fix', 'Validate Fix');
        return this._buildValidateResult(result);
    }

    private _buildValidateResult(result: { success: boolean; output: string; error?: string }): ValidateResult {
        const issues      = this._parseValidateOutput(result.output);
        const errorCount  = issues.filter(i => i.severity === 'Error').length;
        const warningCount = issues.filter(i => i.severity === 'Warning').length;
        return { ...result, issues, errorCount, warningCount };
    }

    private _parseValidateOutput(output: string): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        for (const line of output.split('\n')) {
            const t = line.trim();
            if (!t) { continue; }

            let severity: 'Error' | 'Warning' | 'Info' | null = null;

            if (/\[E(rror)?\]/i.test(t) || /\berror\b/i.test(t)) {
                // Skip summary lines like "Errors: 3"
                if (/^\s*errors?\s*:\s*\d+/i.test(t)) { continue; }
                severity = 'Error';
            } else if (/\[W(arning)?\]/i.test(t) || /\bwarning\b/i.test(t)) {
                if (/^\s*warnings?\s*:\s*\d+/i.test(t)) { continue; }
                severity = 'Warning';
            } else if (/\[I(nfo)?\]/i.test(t)) {
                severity = 'Info';
            }

            if (!severity) { continue; }

            const pathMatch = t.match(/\/sitecore\/\S+/);
            const itemPath  = pathMatch ? pathMatch[0].replace(/[,.:'"]+$/, '') : 'Unknown';
            const message   = t.replace(/^\[.*?\]\s*/, '').trim();
            issues.push({ severity, itemPath, message });
        }
        return issues;
    }

    public async cloudLogin(): Promise<{ success: boolean; error?: string }> {
        try {
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Sitecore Cloud Login',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Opening browser for Sitecore Cloud authentication...' });
                await execAsync('dotnet sitecore cloud login', { cwd: this.cliRoot, timeout: 300000 });
                vscode.window.showInformationMessage('Connected to Sitecore Cloud!');
                return { success: true };
            });
        } catch (error: any) {
            return { success: false, error: error.message || 'Unknown error' };
        }
    }
}
