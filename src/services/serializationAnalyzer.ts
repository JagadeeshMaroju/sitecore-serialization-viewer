import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import simpleGit, { SimpleGit } from 'simple-git';
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
        this.gitRoot = this.findGitRoot(this.workspaceRoot);

        try {
            this.git = simpleGit(this.gitRoot);
            this.git.addConfig('http.postBuffer', '524288000', false, 'local').catch(() => {});
            this.git.addConfig('http.lowSpeedLimit', '0', false, 'local').catch(() => {});
            this.git.addConfig('http.lowSpeedTime', '999999', false, 'local').catch(() => {});
        } catch {
            this.git = simpleGit(this.gitRoot);
        }

        this.serializationPath = this.findSerializationPath();

        this.changes = {
            added: [],
            modified: [],
            deleted: [],
            totalChanges: 0,
            fieldChanges: 0
        };
    }

    private findGitRoot(startPath: string): string {
        let currentPath = startPath;

        for (let i = 0; i < 5; i++) {
            if (fs.existsSync(path.join(currentPath, '.git'))) {
                return currentPath;
            }
            const parent = path.dirname(currentPath);
            if (parent === currentPath) { break; }
            currentPath = parent;
        }

        return startPath;
    }

    private findSerializationPath(): string {
        const config = vscode.workspace.getConfiguration('sitecoreSerializer');
        const configPath = config.get<string>('serializationPath');

        if (configPath && configPath !== 'Serialization') {
            const fullPath = path.join(this.gitRoot, configPath);
            if (fs.existsSync(fullPath)) { return fullPath; }
        }

        const searchLocations = [
            path.join(this.workspaceRoot, 'Serialization'),
            path.join(this.workspaceRoot, 'serialization'),
            path.join(this.gitRoot, 'Serialization'),
            path.join(this.gitRoot, 'serialization'),
            path.join(this.gitRoot, 'authoring', 'Serialization'),
            path.join(this.gitRoot, 'src', 'Serialization'),
            path.join(this.gitRoot, 'sitecore', 'Serialization'),
        ];

        for (const location of searchLocations) {
            if (this.hasModuleJsonFiles(location)) { return location; }
        }

        const foundPath = this.searchForModuleJson(this.gitRoot, 0, 3);
        if (foundPath) { return foundPath; }

        return path.join(this.workspaceRoot, 'Serialization');
    }

    private hasModuleJsonFiles(dirPath: string): boolean {
        if (!fs.existsSync(dirPath)) { return false; }
        try {
            return fs.readdirSync(dirPath).some(f => f.endsWith('.module.json'));
        } catch {
            return false;
        }
    }

    private searchForModuleJson(dirPath: string, currentDepth: number, maxDepth: number): string | null {
        if (currentDepth > maxDepth || !fs.existsSync(dirPath)) { return null; }

        const skipFolders = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', '.next'];
        if (skipFolders.includes(path.basename(dirPath))) { return null; }

        try {
            if (this.hasModuleJsonFiles(dirPath)) { return dirPath; }

            for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    const result = this.searchForModuleJson(path.join(dirPath, entry.name), currentDepth + 1, maxDepth);
                    if (result) { return result; }
                }
            }
        } catch { /* permission errors etc. */ }

        return null;
    }

    public getGitRoot(): string { return this.gitRoot; }

    public getSerializationPath(): string { return this.serializationPath; }

    public async analyzeChanges(): Promise<ChangesSummary> {
        try {
            const status = await Promise.race([
                this.git.status(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Git status timeout')), 10000)
                )
            ]);

            this.changes = { added: [], modified: [], deleted: [], totalChanges: 0, fieldChanges: 0 };

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
            if (error?.code === 'ECONNRESET' || error?.message?.includes('ECONNRESET')) {
                vscode.window.showWarningMessage(
                    'Sitecore Serialization Viewer: Git network error. Working in offline mode. ' +
                    'Try: git config --global http.postBuffer 524288000'
                );
            } else if (error?.message?.includes('timeout')) {
                vscode.window.showWarningMessage(
                    'Sitecore Serialization Viewer: Git operation timed out. Check your Git configuration.'
                );
            }

            return this.changes;
        }
    }

    public async compareWithHead(): Promise<ChangesSummary> {
        try {
            const diff = await Promise.race([
                this.git.diff(['--name-status', 'HEAD']),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Git diff timeout')), 10000)
                )
            ]);

            this.changes = { added: [], modified: [], deleted: [], totalChanges: 0, fieldChanges: 0 };

            for (const line of diff.split('\n').filter(l => l.trim())) {
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
            if (error?.code === 'ECONNRESET' || error?.message?.includes('ECONNRESET')) {
                vscode.window.showWarningMessage(
                    'Sitecore Serialization Viewer: Git network error during push preview. ' +
                    'Check your Git remote connection.'
                );
            } else if (error?.message?.includes('timeout')) {
                vscode.window.showWarningMessage(
                    'Sitecore Serialization Viewer: Git diff timed out. Check your Git configuration.'
                );
            }

            return this.changes;
        }
    }

    private async processDiffLine(status: string, filePath: string): Promise<void> {
        const fullPath = path.join(this.workspaceRoot, filePath);

        if (status === 'A') {
            const item = YamlParser.parseYamlFile(fullPath);
            if (item) { this.changes.added.push({ type: 'added', item, filePath }); }
        } else if (status === 'M') {
            const currentItem = YamlParser.parseYamlFile(fullPath);
            const oldContent  = await this.getFileContentFromHead(filePath);
            const oldItem     = this.parseYamlFromString(oldContent, filePath);

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
            const oldItem = this.parseYamlFromString(await this.getFileContentFromHead(filePath), filePath);
            if (oldItem) { this.changes.deleted.push({ type: 'deleted', item: oldItem, filePath }); }
        }
    }

    private async analyzeFile(filePath: string, status: any): Promise<void> {
        const fullPath = path.join(this.workspaceRoot, filePath);

        if (status.created.includes(filePath)) {
            const item = YamlParser.parseYamlFile(fullPath);
            if (item) { this.changes.added.push({ type: 'added', item, filePath }); }
        } else if (status.modified.includes(filePath)) {
            const currentItem = YamlParser.parseYamlFile(fullPath);
            const oldContent  = await this.getFileContentFromHead(filePath);
            const oldItem     = this.parseYamlFromString(oldContent, filePath);

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
            const oldItem = this.parseYamlFromString(await this.getFileContentFromHead(filePath), filePath);
            if (oldItem) { this.changes.deleted.push({ type: 'deleted', item: oldItem, filePath }); }
        }
    }

    private async getFileContentFromHead(filePath: string): Promise<string> {
        try {
            return await this.git.show(['HEAD:' + filePath]);
        } catch {
            return '';
        }
    }

    private parseYamlFromString(content: string, filePath: string): SitecoreItem | null {
        if (!content) { return null; }

        try {
            const yaml = require('yaml');
            const parsed = yaml.parse(content);

            if (!parsed?.ID) { return null; }

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
        } catch {
            return null;
        }
    }

    private async getFieldChanges(oldItem: SitecoreItem | null, newItem: SitecoreItem): Promise<FieldChange[]> {
        const changes: FieldChange[] = [];

        const oldShared = new Map(oldItem?.sharedFields?.map(f => [f.id, { value: f.value, hint: f.hint }]) || []);
        const newShared = new Map(newItem.sharedFields?.map(f => [f.id, { value: f.value, hint: f.hint }]) || []);

        for (const fieldId of new Set([...oldShared.keys(), ...newShared.keys()])) {
            const oldField = oldShared.get(fieldId);
            const newField = newShared.get(fieldId);
            if (oldField?.value !== newField?.value) {
                changes.push({
                    fieldId,
                    fieldName: YamlParser.getFieldName(fieldId, newField?.hint || oldField?.hint || ''),
                    oldValue: oldField?.value,
                    newValue: newField?.value,
                    scope: 'shared'
                });
            }
        }

        if (oldItem?.languages || newItem.languages) {
            const oldLangs = new Map(oldItem?.languages?.map(l => [l.language, l]) || []);
            const newLangs = new Map(newItem.languages?.map(l => [l.language, l]) || []);

            for (const lang of new Set([...oldLangs.keys(), ...newLangs.keys()])) {
                const oldLang = oldLangs.get(lang);
                const newLang = newLangs.get(lang);

                if (oldLang && newLang) {
                    for (let i = 0; i < Math.max(oldLang.versions.length, newLang.versions.length); i++) {
                        const oldVer = oldLang.versions[i];
                        const newVer = newLang.versions[i];

                        if (oldVer && newVer) {
                            const oldFields = new Map(oldVer.fields.map(f => [f.id, { value: f.value, hint: f.hint }]));
                            const newFields = new Map(newVer.fields.map(f => [f.id, { value: f.value, hint: f.hint }]));

                            for (const fieldId of new Set([...oldFields.keys(), ...newFields.keys()])) {
                                const oldField = oldFields.get(fieldId);
                                const newField = newFields.get(fieldId);
                                if (oldField?.value !== newField?.value) {
                                    changes.push({
                                        fieldId,
                                        fieldName: YamlParser.getFieldName(fieldId, newField?.hint || oldField?.hint || ''),
                                        oldValue: oldField?.value,
                                        newValue: newField?.value,
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

    public getChanges(): ChangesSummary { return this.changes; }

    public getChangesByType(type: 'added' | 'modified' | 'deleted'): ItemChange[] {
        return this.changes[type];
    }
}
