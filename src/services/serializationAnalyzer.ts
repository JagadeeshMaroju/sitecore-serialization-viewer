import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import { YamlParser } from '../utils/yamlParser';
import { ItemChange, ChangesSummary, SitecoreItem, FieldChange } from '../models/types';

export class SerializationAnalyzer {
    private git: SimpleGit;
    private workspaceRoot: string;
    private serializationPath: string;
    private gitRoot: string;
    private changes: ChangesSummary;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        
        // Find the actual git root (which might be a parent directory)
        this.gitRoot = this.findGitRoot(this.workspaceRoot);
        
        // Initialize git with better error handling
        try {
            this.git = simpleGit(this.gitRoot);
            
            // Configure git to work better in offline/slow network scenarios
            this.git.addConfig('http.postBuffer', '524288000', false, 'local').catch(() => {
                // Ignore if config fails - not critical
            });
            this.git.addConfig('http.lowSpeedLimit', '0', false, 'local').catch(() => {
                // Ignore if config fails
            });
            this.git.addConfig('http.lowSpeedTime', '999999', false, 'local').catch(() => {
                // Ignore if config fails
            });
        } catch (error) {
            console.error('Error initializing git:', error);
            this.git = simpleGit(this.gitRoot); // Fallback to basic initialization
        }
        
        // Find Serialization folder intelligently
        this.serializationPath = this.findSerializationPath();

        this.changes = {
            added: [],
            modified: [],
            deleted: [],
            totalChanges: 0,
            fieldChanges: 0
        };
    }

    /**
     * Find the git root directory by searching upward
     */
    private findGitRoot(startPath: string): string {
        console.log(` Searching for Git root starting from: ${startPath}`);
        let currentPath = startPath;
        const maxDepth = 5; // Don't go more than 5 levels up
        
        for (let i = 0; i < maxDepth; i++) {
            const gitPath = path.join(currentPath, '.git');
            console.log(`  Checking: ${gitPath}`);
            if (fs.existsSync(gitPath)) {
                console.log(`   Found git root at: ${currentPath}`);
                return currentPath;
            }
            
            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) {
                console.log(`    Reached filesystem root`);
                break; // Reached filesystem root
            }
            currentPath = parentPath;
        }
        
        console.log(`    No git root found, using workspace root: ${startPath}`);
        return startPath;
    }

    /**
     * Find Serialization folder by searching in multiple locations
     */
    private findSerializationPath(): string {
        console.log(` Searching for Serialization folder...`);
        const config = vscode.workspace.getConfiguration('sitecoreSerializer');
        const configPath = config.get<string>('serializationPath');
        
        // If user specified a path, use it
        if (configPath && configPath !== 'Serialization') {
            const fullPath = path.join(this.gitRoot, configPath);
            console.log(`  Checking configured path: ${fullPath}`);
            if (fs.existsSync(fullPath)) {
                console.log(`   Using configured serialization path: ${fullPath}`);
                return fullPath;
            } else {
                console.log(`    Configured path does not exist`);
            }
        }

        // Search for .module.json files in common locations
        const searchLocations = [
            path.join(this.workspaceRoot, 'Serialization'),
            path.join(this.workspaceRoot, 'serialization'),
            path.join(this.gitRoot, 'Serialization'),
            path.join(this.gitRoot, 'serialization'),
            path.join(this.gitRoot, 'authoring', 'Serialization'),
            path.join(this.gitRoot, 'src', 'Serialization'),
            path.join(this.gitRoot, 'sitecore', 'Serialization'),
        ];

        console.log(`  Searching ${searchLocations.length} common locations...`);
        // Also search for any folder containing .module.json files
        for (const location of searchLocations) {
            console.log(`    Checking: ${location}`);
            if (this.hasModuleJsonFiles(location)) {
                console.log(`   Found Serialization folder at: ${location}`);
                return location;
            }
        }

        // Last resort: search entire git root recursively (but limit depth)
        console.log(`  Performing recursive search (max depth: 3)...`);
        const foundPath = this.searchForModuleJson(this.gitRoot, 0, 3);
        if (foundPath) {
            console.log(`   Found Serialization folder via recursive search: ${foundPath}`);
            return foundPath;
        }

        // Fallback to default
        const defaultPath = path.join(this.workspaceRoot, 'Serialization');
        console.log(`    No Serialization folder found, using default: ${defaultPath}`);
        return defaultPath;
    }

    /**
     * Check if a directory contains .module.json files
     */
    private hasModuleJsonFiles(dirPath: string): boolean {
        if (!fs.existsSync(dirPath)) {
            return false;
        }

        try {
            const files = fs.readdirSync(dirPath);
            return files.some(file => file.endsWith('.module.json'));
        } catch (error) {
            return false;
        }
    }

    /**
     * Recursively search for directories containing .module.json files
     */
    private searchForModuleJson(dirPath: string, currentDepth: number, maxDepth: number): string | null {
        if (currentDepth > maxDepth || !fs.existsSync(dirPath)) {
            return null;
        }

        // Skip node_modules, .git, and other irrelevant folders
        const skipFolders = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', '.next'];
        const baseName = path.basename(dirPath);
        if (skipFolders.includes(baseName)) {
            return null;
        }

        try {
            // Check current directory
            if (this.hasModuleJsonFiles(dirPath)) {
                return dirPath;
            }

            // Search subdirectories
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const subPath = path.join(dirPath, entry.name);
                    const result = this.searchForModuleJson(subPath, currentDepth + 1, maxDepth);
                    if (result) {
                        return result;
                    }
                }
            }
        } catch (error) {
            // Ignore permission errors, etc.
        }

        return null;
    }

    /**
     * Get the git root directory
     */
    public getGitRoot(): string {
        return this.gitRoot;
    }

    /**
     * Get the serialization path
     */
    public getSerializationPath(): string {
        return this.serializationPath;
    }

    /**
     * Analyze all serialization changes
     */
    public async analyzeChanges(): Promise<ChangesSummary> {
        try {
            // Get git status with timeout to prevent hanging
            const status = await Promise.race([
                this.git.status(),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Git status timeout')), 10000)
                )
            ]);
            
            // Reset changes
            this.changes = {
                added: [],
                modified: [],
                deleted: [],
                totalChanges: 0,
                fieldChanges: 0
            };

            // Use Set to avoid processing same file twice
            const processedFiles = new Set<string>();
            const allChangedFiles = [
                ...status.modified,
                ...status.created,
                ...status.deleted,
                ...status.renamed.map(r => r.to)
            ];

            for (const file of allChangedFiles) {
                if (file.endsWith('.yml') && file.includes('Serialization') && !processedFiles.has(file)) {
                    processedFiles.add(file);
                    await this.analyzeFile(file, status);
                }
            }

            this.changes.totalChanges = 
                this.changes.added.length + 
                this.changes.modified.length + 
                this.changes.deleted.length;

            return this.changes;
        } catch (error: any) {
            console.error('Error analyzing changes:', error);
            
            // Check if it's a network error
            if (error?.code === 'ECONNRESET' || error?.message?.includes('ECONNRESET')) {
                console.warn('Git network error detected. Extension will work in offline mode.');
                vscode.window.showWarningMessage(
                    'Sitecore Serialization Viewer: Git network error. Working in offline mode. ' +
                    'Try: git config --global http.postBuffer 524288000'
                );
            } else if (error?.message?.includes('timeout')) {
                console.warn('Git operation timed out.');
                vscode.window.showWarningMessage(
                    'Sitecore Serialization Viewer: Git operation timed out. Check your Git configuration.'
                );
            }
            
            return this.changes;
        }
    }

    /**
     * Compare current state with HEAD
     */
    public async compareWithHead(): Promise<ChangesSummary> {
        try {
            // Add timeout to git diff operation
            const diff = await Promise.race([
                this.git.diff(['--name-status', 'HEAD']),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Git diff timeout')), 10000)
                )
            ]);
            
            this.changes = {
                added: [],
                modified: [],
                deleted: [],
                totalChanges: 0,
                fieldChanges: 0
            };

            const lines = diff.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                const [status, filePath] = line.split('\t');
                
                if (filePath?.endsWith('.yml') && filePath.includes('Serialization')) {
                    await this.processDiffLine(status, filePath);
                }
            }

            this.changes.totalChanges = 
                this.changes.added.length + 
                this.changes.modified.length + 
                this.changes.deleted.length;

            return this.changes;
        } catch (error: any) {
            console.error('Error comparing with HEAD:', error);
            
            // Check if it's a network error
            if (error?.code === 'ECONNRESET' || error?.message?.includes('ECONNRESET')) {
                console.warn('Git network error during diff operation.');
                vscode.window.showWarningMessage(
                    'Sitecore Serialization Viewer: Git network error during push preview. ' +
                    'Check your Git remote connection.'
                );
            } else if (error?.message?.includes('timeout')) {
                console.warn('Git diff operation timed out.');
                vscode.window.showWarningMessage(
                    'Sitecore Serialization Viewer: Git diff timed out. Check your Git configuration.'
                );
            }
            
            return this.changes;
        }
    }

    /**
     * Process a single diff line
     */
    private async processDiffLine(status: string, filePath: string): Promise<void> {
        const fullPath = path.join(this.workspaceRoot, filePath);

        if (status === 'A') {
            // Added file
            const item = YamlParser.parseYamlFile(fullPath);
            if (item) {
                this.changes.added.push({
                    type: 'added',
                    item,
                    filePath
                });
            }
        } else if (status === 'M') {
            // Modified file
            const currentItem = YamlParser.parseYamlFile(fullPath);
            const oldContent = await this.getFileContentFromHead(filePath);
            const oldItem = this.parseYamlFromString(oldContent, filePath);

            if (currentItem) {
                const fieldChanges = await this.getFieldChanges(oldItem, currentItem);
                
                this.changes.modified.push({
                    type: 'modified',
                    item: currentItem,
                    oldItem: oldItem || undefined,
                    changedFields: fieldChanges,
                    filePath
                });

                this.changes.fieldChanges += fieldChanges.length;
            }
        } else if (status === 'D') {
            // Deleted file
            const oldContent = await this.getFileContentFromHead(filePath);
            const oldItem = this.parseYamlFromString(oldContent, filePath);

            if (oldItem) {
                this.changes.deleted.push({
                    type: 'deleted',
                    item: oldItem,
                    filePath
                });
            }
        }
    }

    /**
     * Analyze a single file based on git status
     */
    private async analyzeFile(filePath: string, status: any): Promise<void> {
        const fullPath = path.join(this.workspaceRoot, filePath);

        if (status.created.includes(filePath)) {
            const item = YamlParser.parseYamlFile(fullPath);
            if (item) {
                this.changes.added.push({
                    type: 'added',
                    item,
                    filePath
                });
            }
        } else if (status.modified.includes(filePath)) {
            const currentItem = YamlParser.parseYamlFile(fullPath);
            const oldContent = await this.getFileContentFromHead(filePath);
            const oldItem = this.parseYamlFromString(oldContent, filePath);

            if (currentItem) {
                const fieldChanges = await this.getFieldChanges(oldItem, currentItem);
                
                this.changes.modified.push({
                    type: 'modified',
                    item: currentItem,
                    oldItem: oldItem || undefined,
                    changedFields: fieldChanges,
                    filePath
                });

                this.changes.fieldChanges += fieldChanges.length;
            }
        } else if (status.deleted.includes(filePath)) {
            const oldContent = await this.getFileContentFromHead(filePath);
            const oldItem = this.parseYamlFromString(oldContent, filePath);

            if (oldItem) {
                this.changes.deleted.push({
                    type: 'deleted',
                    item: oldItem,
                    filePath
                });
            }
        }
    }

    /**
     * Get file content from HEAD commit
     */
    private async getFileContentFromHead(filePath: string): Promise<string> {
        try {
            return await this.git.show(['HEAD:' + filePath]);
        } catch (error) {
            return '';
        }
    }

    /**
     * Parse YAML from string content
     */
    private parseYamlFromString(content: string, filePath: string): SitecoreItem | null {
        if (!content) {
            return null;
        }

        try {
            const yaml = require('yaml');
            const parsed = yaml.parse(content);

            if (!parsed || !parsed.ID) {
                return null;
            }

            return {
                id: parsed.ID,
                parent: parsed.Parent || '',
                template: parsed.Template || '',
                path: parsed.Path || '',
                branchId: parsed.BranchID,
                filePath,
                name: path.basename(filePath, '.yml'),
                sharedFields: YamlParser['parseFields'](parsed.SharedFields),
                languages: YamlParser['parseLanguages'](parsed.Languages)
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Get detailed field-level changes
     */
    private async getFieldChanges(
        oldItem: SitecoreItem | null,
        newItem: SitecoreItem
    ): Promise<FieldChange[]> {
        const changes: FieldChange[] = [];

        // Compare shared fields
        const oldSharedFieldsMap = new Map(
            oldItem?.sharedFields?.map(f => [f.id, { value: f.value, hint: f.hint }]) || []
        );
        const newSharedFieldsMap = new Map(
            newItem.sharedFields?.map(f => [f.id, { value: f.value, hint: f.hint }]) || []
        );

        // Find all unique field IDs
        const allFieldIds = new Set([
            ...oldSharedFieldsMap.keys(),
            ...newSharedFieldsMap.keys()
        ]);

        for (const fieldId of allFieldIds) {
            const oldField = oldSharedFieldsMap.get(fieldId);
            const newField = newSharedFieldsMap.get(fieldId);
            const oldValue = oldField?.value;
            const newValue = newField?.value;

            if (oldValue !== newValue) {
                // Use hint from new field, or old field, or fall back to ID
                const hint = newField?.hint || oldField?.hint || '';
                
                changes.push({
                    fieldId,
                    fieldName: YamlParser.getFieldName(fieldId, hint),
                    oldValue,
                    newValue,
                    scope: 'shared'
                });
            }
        }

        // Compare language-specific fields
        if (oldItem?.languages || newItem.languages) {
            const oldLangs = new Map(
                oldItem?.languages?.map(l => [l.language, l]) || []
            );
            const newLangs = new Map(
                newItem.languages?.map(l => [l.language, l]) || []
            );

            const allLanguages = new Set([...oldLangs.keys(), ...newLangs.keys()]);

            for (const lang of allLanguages) {
                const oldLang = oldLangs.get(lang);
                const newLang = newLangs.get(lang);

                if (oldLang && newLang) {
                    for (let i = 0; i < Math.max(oldLang.versions.length, newLang.versions.length); i++) {
                        const oldVer = oldLang.versions[i];
                        const newVer = newLang.versions[i];

                        if (oldVer && newVer) {
                            const oldFieldsMap = new Map(oldVer.fields.map(f => [f.id, { value: f.value, hint: f.hint }]));
                            const newFieldsMap = new Map(newVer.fields.map(f => [f.id, { value: f.value, hint: f.hint }]));

                            const versionFieldIds = new Set([...oldFieldsMap.keys(), ...newFieldsMap.keys()]);

                            for (const fieldId of versionFieldIds) {
                                const oldField = oldFieldsMap.get(fieldId);
                                const newField = newFieldsMap.get(fieldId);
                                const oldValue = oldField?.value;
                                const newValue = newField?.value;

                                if (oldValue !== newValue) {
                                    // Use hint from new field, or old field, or fall back to ID
                                    const hint = newField?.hint || oldField?.hint || '';
                                    
                                    changes.push({
                                        fieldId,
                                        fieldName: YamlParser.getFieldName(fieldId, hint),
                                        oldValue,
                                        newValue,
                                        language: lang,
                                        version: newVer.version,
                                        scope: 'language'
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        return changes;
    }

    /**
     * Get current changes summary
     */
    public getChanges(): ChangesSummary {
        return this.changes;
    }

    /**
     * Get changes by type
     */
    public getChangesByType(type: 'added' | 'modified' | 'deleted'): ItemChange[] {
        return this.changes[type];
    }
}
