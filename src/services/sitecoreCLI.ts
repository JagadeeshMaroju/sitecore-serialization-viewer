import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

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

export class SitecoreCLI {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Check if user is authenticated with Sitecore CLI
     */
    public async checkAuthentication(): Promise<{ authenticated: boolean; error?: string }> {
        try {
            // Try to get environment info (requires auth)
            const { stdout } = await execAsync('dotnet sitecore cloud environment info', {
                cwd: this.workspaceRoot,
                timeout: 5000
            });

            return { authenticated: true };
        } catch (error: any) {
            const output = (error.stdout || '') + (error.stderr || '');
            
            // Check for common auth error patterns
            if (output.includes('not logged in') || 
                output.includes('authentication') ||
                output.includes('login required') ||
                output.includes('token') ||
                output.includes('unauthorized')) {
                return { 
                    authenticated: false, 
                    error: 'Authentication required' 
                };
            }

            // If command failed but not auth issue, consider authenticated
            return { authenticated: true };
        }
    }

    /**
     * Prompt user to login and execute login command
     */
    public async login(): Promise<{ success: boolean; error?: string }> {
        try {
            const action = await vscode.window.showInformationMessage(
                '🔐 Sitecore CLI Authentication Required\n\n' +
                'Your session has expired. Would you like to login now?\n' +
                'This will open your browser for authentication.',
                'Login Now',
                'Cancel'
            );

            if (action !== 'Login Now') {
                return { success: false, error: 'Login cancelled by user' };
            }

            // Show progress while waiting for login
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Sitecore Login",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: "Opening browser for authentication..." });

                const { stdout, stderr } = await execAsync('dotnet sitecore login', {
                    cwd: this.workspaceRoot,
                    timeout: 120000 // 2 minutes timeout
                });

                const output = stdout + (stderr || '');

                // Check if login was successful
                if (output.includes('successfully') || 
                    output.includes('authenticated') ||
                    output.includes('logged in')) {
                    vscode.window.showInformationMessage('✅ Successfully logged in to Sitecore!');
                    return { success: true };
                }

                return { success: true }; // Assume success if no error thrown
            });
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if error output indicates authentication issue
     */
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

    /**
     * Execute a CLI command with automatic authentication handling
     */
    private async executeWithAuth(
        command: string,
        commandName: string
    ): Promise<{ success: boolean; output: string; error?: string }> {
        console.log(`[SitecoreCLI] Executing command: ${command}`);
        console.log(`[SitecoreCLI] Working directory: ${this.workspaceRoot}`);
        
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: this.workspaceRoot,
                maxBuffer: 1024 * 1024 * 10
            });

            console.log(`[SitecoreCLI] Command succeeded`);
            console.log(`[SitecoreCLI] stdout length: ${stdout?.length || 0} chars`);
            console.log(`[SitecoreCLI] stderr length: ${stderr?.length || 0} chars`);

            return {
                success: true,
                output: stdout + (stderr || '')
            };
        } catch (error: any) {
            const errorOutput = (error.stdout || '') + (error.stderr || '');
            console.log(`[SitecoreCLI] Command failed with error:`, error.message);
            console.log(`[SitecoreCLI] Error output length: ${errorOutput.length} chars`);
            
            // Check if it's an authentication error
            if (this.isAuthenticationError(errorOutput)) {
                console.log(`[SitecoreCLI] Authentication error detected`);
                
                vscode.window.showWarningMessage(
                    `🔐 Authentication required for ${commandName}`
                );

                // Prompt to login
                const loginResult = await this.login();
                
                if (!loginResult.success) {
                    console.log(`[SitecoreCLI] Login failed:`, loginResult.error);
                    return {
                        success: false,
                        output: errorOutput,
                        error: 'Authentication failed: ' + (loginResult.error || 'Login cancelled')
                    };
                }

                console.log(`[SitecoreCLI] Login successful, retrying command...`);
                // Retry the command after successful login
                try {
                    const { stdout, stderr } = await execAsync(command, {
                        cwd: this.workspaceRoot,
                        maxBuffer: 1024 * 1024 * 10
                    });

                    console.log(`[SitecoreCLI] Retry succeeded`);
                    return {
                        success: true,
                        output: stdout + (stderr || '')
                    };
                } catch (retryError: any) {
                    return {
                        success: false,
                        output: (retryError.stdout || '') + (retryError.stderr || ''),
                        error: retryError.message
                    };
                }
            }

            // Not an auth error, return the error
            return {
                success: false,
                output: errorOutput,
                error: error.message
            };
        }
    }

    /**
     * Execute sitecore ser pull -t --what-if to preview changes
     */
    public async pullWhatIf(): Promise<WhatIfResult> {
        vscode.window.showInformationMessage('🔍 Checking what Sitecore has changed...');

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

        // Parse the output (even if command "failed" with exit code 1)
        const changes = this.parseWhatIfOutput(result.output);

        return {
            success: true,
            output: result.output,
            error: result.error,
            changes
        };
    }

    /**
     * Execute sitecore ser push -t --what-if to preview changes
     */
    public async pushWhatIf(): Promise<WhatIfResult> {
        vscode.window.showInformationMessage('🔍 Checking with Sitecore CLI... This may take a moment.');

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

        // Parse the output
        const changes = this.parseWhatIfOutput(result.output);

        return {
            success: true,
            output: result.output,
            error: result.error,
            changes
        };
    }

    /**
     * Parse the output from --what-if command
     */
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

    /**
     * Parse a single change line
     */
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

    /**
     * Execute regular push (not what-if)
     */
    public async push(): Promise<{ success: boolean; output: string; error?: string }> {
        try {
            const command = 'dotnet sitecore ser push';
            
            const { stdout, stderr } = await execAsync(command, {
                cwd: this.workspaceRoot,
                maxBuffer: 1024 * 1024 * 10
            });

            return {
                success: true,
                output: stdout + (stderr || '')
            };
        } catch (error: any) {
            return {
                success: false,
                output: error.stdout + (error.stderr || ''),
                error: error.message
            };
        }
    }
}
