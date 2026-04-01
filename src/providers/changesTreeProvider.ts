import * as vscode from 'vscode';
import * as path from 'path';
import { SerializationAnalyzer } from '../services/serializationAnalyzer';
import { ItemChange } from '../models/types';
import { ValidationIssue } from '../services/sitecoreCLI';

export class ChangesTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> =
        new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private isPushPreview = false;
    private isPullPreview = false;
    private isValidation  = false;
    private sitecoreChanges: any[] = [];
    private validationIssues: ValidationIssue[] = [];

    constructor(private analyzer: SerializationAnalyzer) {}

    refresh(): void {
        this.isPushPreview    = false;
        this.isPullPreview    = false;
        this.isValidation     = false;
        this.sitecoreChanges  = [];
        this.validationIssues = [];
        this._onDidChangeTreeData.fire();
    }

    refreshForValidation(issues: ValidationIssue[]): void {
        this.isValidation     = true;
        this.isPullPreview    = false;
        this.isPushPreview    = false;
        this.sitecoreChanges  = [];
        this.validationIssues = issues;
        this._onDidChangeTreeData.fire();
    }

    refreshForPushPreview(sitecoreChanges?: any[]): void {
        this.isPushPreview    = true;
        this.isPullPreview    = false;
        this.isValidation     = false;
        this.validationIssues = [];
        this.sitecoreChanges  = sitecoreChanges || [];
        this._onDidChangeTreeData.fire();
    }

    refreshForPullPreview(sitecoreChanges: any[]): void {
        this.isPullPreview    = true;
        this.isPushPreview    = false;
        this.isValidation     = false;
        this.validationIssues = [];
        this.sitecoreChanges  = sitecoreChanges;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            if (this.isValidation) {
                const items: TreeItem[] = [];
                if (this.validationIssues.length === 0) {
                    items.push(new InfoTreeItem('Serialization is valid — no issues found.', 'info'));
                    return items;
                }
                items.push(new InfoTreeItem('Validation Results', 'info'));
                const errors   = this.validationIssues.filter(i => i.severity === 'Error');
                const warnings = this.validationIssues.filter(i => i.severity === 'Warning');
                const infos    = this.validationIssues.filter(i => i.severity === 'Info');
                if (errors.length > 0)   { items.push(new ValidationCategoryTreeItem(`Errors (${errors.length})`, errors, 'error')); }
                if (warnings.length > 0) { items.push(new ValidationCategoryTreeItem(`Warnings (${warnings.length})`, warnings, 'warning')); }
                if (infos.length > 0)    { items.push(new ValidationCategoryTreeItem(`Info (${infos.length})`, infos, 'info')); }
                return items;
            }

            if (this.isPullPreview && this.sitecoreChanges.length > 0) {
                const items: TreeItem[] = [];
                items.push(new InfoTreeItem('Sitecore Changes: What will be pulled from Sitecore', 'info'));

                const creates = this.sitecoreChanges.filter(c => c.action === 'Create');
                const updates = this.sitecoreChanges.filter(c => c.action === 'Update');
                const deletes = this.sitecoreChanges.filter(c => c.action === 'Delete');

                if (creates.length > 0) { items.push(new SitecoreCategoryTreeItem(`Will be Created Locally (${creates.length})`, creates, 'added')); }
                if (updates.length > 0) { items.push(new SitecoreCategoryTreeItem(`Will be Updated Locally (${updates.length})`, updates, 'modified')); }
                if (deletes.length > 0) { items.push(new SitecoreCategoryTreeItem(`Will be Deleted Locally (${deletes.length})`, deletes, 'deleted')); }

                return items;
            }

            if (this.isPushPreview && this.sitecoreChanges.length > 0) {
                const items: TreeItem[] = [];
                items.push(new InfoTreeItem('Push Preview: What will be pushed to Sitecore', 'info'));

                const creates = this.sitecoreChanges.filter(c => c.action === 'Create');
                const updates = this.sitecoreChanges.filter(c => c.action === 'Update');
                const deletes = this.sitecoreChanges.filter(c => c.action === 'Delete');

                if (creates.length > 0) { items.push(new SitecoreCategoryTreeItem(`Will be Created in Sitecore (${creates.length})`, creates, 'added')); }
                if (updates.length > 0) { items.push(new SitecoreCategoryTreeItem(`Will be Updated in Sitecore (${updates.length})`, updates, 'modified')); }
                if (deletes.length > 0) { items.push(new SitecoreCategoryTreeItem(`Will be Deleted from Sitecore (${deletes.length})`, deletes, 'deleted')); }

                return items;
            }

            const changes = this.analyzer.getChanges();
            const items: TreeItem[] = [];

            if (changes.added.length > 0)    { items.push(new CategoryTreeItem(`Added (${changes.added.length})`, 'added', changes.added.length, 'added')); }
            if (changes.modified.length > 0) { items.push(new CategoryTreeItem(`Modified (${changes.modified.length})`, 'modified', changes.modified.length, 'modified')); }
            if (changes.deleted.length > 0)  { items.push(new CategoryTreeItem(`Deleted (${changes.deleted.length})`, 'deleted', changes.deleted.length, 'deleted')); }

            if (items.length === 0) {
                return [new TreeItem('No changes detected. Click "Preview Pull" or "Preview Push" to check Sitecore.', vscode.TreeItemCollapsibleState.None)];
            }

            return items;
        }

        if (element instanceof CategoryTreeItem) {
            return this.analyzer.getChangesByType(element.changeType).map(item => new ItemTreeItem(item));
        }
        if (element instanceof ValidationCategoryTreeItem) {
            return element.issues.map(i => new ValidationIssueTreeItem(i));
        }
        if (element instanceof SitecoreCategoryTreeItem) {
            return element.changes.map(change => new SitecoreItemTreeItem(change));
        }
        if (element instanceof SitecoreItemTreeItem) {
            if (element.change.fields?.length > 0) {
                return element.change.fields.map((field: any) => new SitecoreFieldTreeItem(field));
            }
        }
        if (element instanceof ItemTreeItem) {
            if (element.itemChange.type === 'modified' && element.itemChange.changedFields) {
                return element.itemChange.changedFields.map(field => new FieldTreeItem(field, element.itemChange));
            }
        }

        return [];
    }
}

class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

class InfoTreeItem extends TreeItem {
    constructor(label: string, type: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath    = new vscode.ThemeIcon('info', new vscode.ThemeColor('notificationsInfoIcon.foreground'));
        this.contextValue = 'info';
    }
}

class SitecoreCategoryTreeItem extends TreeItem {
    constructor(
        public readonly label: string,
        public readonly changes: any[],
        iconName: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon(
            iconName === 'added' ? 'diff-added' : iconName === 'modified' ? 'diff-modified' : 'diff-removed'
        );
        this.contextValue = 'sitecoreCategory';
    }
}

class SitecoreItemTreeItem extends TreeItem {
    constructor(public readonly change: any) {
        const hasFields = change.fields && change.fields.length > 0;
        super(change.itemPath, hasFields ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        this.description = `(${change.action})${hasFields ? ` (${change.fields.length} fields)` : ''}`;
        this.tooltip = new vscode.MarkdownString(
            `**${change.action}**: ${change.itemPath}\n\n` +
            (change.itemId ? `ID: ${change.itemId}\n` : '') +
            (hasFields ? `Fields Changed: ${change.fields.length}` : '')
        );
        this.iconPath = new vscode.ThemeIcon(
            change.action === 'Create' ? 'add' : change.action === 'Update' ? 'edit' : 'trash'
        );
        this.contextValue = 'sitecoreItem';
    }
}

class SitecoreFieldTreeItem extends TreeItem {
    constructor(public readonly field: any) {
        const fieldName = field.name || field;
        let label = fieldName;
        if (field.oldValue !== undefined && field.newValue !== undefined) {
            const oldPreview = field.oldValue.length > 20 ? field.oldValue.substring(0, 20) + '...' : field.oldValue;
            const newPreview = field.newValue.length > 20 ? field.newValue.substring(0, 20) + '...' : field.newValue;
            label = `${fieldName}: ${oldPreview} → ${newPreview}`;
        }
        super(label, vscode.TreeItemCollapsibleState.None);

        if (field.oldValue !== undefined && field.newValue !== undefined) {
            this.tooltip = new vscode.MarkdownString(
                `**Field:** ${fieldName}\n\n` +
                `**Old Value:**\n\`\`\`\n${field.oldValue}\n\`\`\`\n\n` +
                `**New Value:**\n\`\`\`\n${field.newValue}\n\`\`\``
            );
        } else {
            this.tooltip = `Field: ${fieldName}`;
        }

        this.iconPath     = new vscode.ThemeIcon('symbol-field');
        this.contextValue = 'sitecoreField';
    }
}

class CategoryTreeItem extends TreeItem {
    constructor(
        public readonly label: string,
        public readonly changeType: 'added' | 'modified' | 'deleted',
        public readonly count: number,
        iconName: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon(
            iconName === 'added' ? 'diff-added' : iconName === 'modified' ? 'diff-modified' : 'diff-removed'
        );
        this.contextValue = 'category';
    }
}

class ItemTreeItem extends TreeItem {
    constructor(public readonly itemChange: ItemChange) {
        const hasFields = itemChange.changedFields && itemChange.changedFields.length > 0;
        super(itemChange.item.name, hasFields ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        this.description  = itemChange.item.path;
        this.tooltip      = this.createTooltip();
        this.contextValue = 'sitecoreItem';
        this.iconPath     = new vscode.ThemeIcon(
            itemChange.type === 'added' ? 'add' : itemChange.type === 'modified' ? 'edit' : 'trash'
        );
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [vscode.Uri.file(path.join(
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                itemChange.filePath
            ))]
        };
    }

    private createTooltip(): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${this.itemChange.item.name}**\n\n`);
        tooltip.appendMarkdown(`- **Type:** ${this.itemChange.type}\n`);
        tooltip.appendMarkdown(`- **Path:** ${this.itemChange.item.path}\n`);
        tooltip.appendMarkdown(`- **ID:** ${this.itemChange.item.id}\n`);
        tooltip.appendMarkdown(`- **Template:** ${this.itemChange.item.template}\n`);
        if (this.itemChange.changedFields?.length) {
            tooltip.appendMarkdown(`- **Fields Changed:** ${this.itemChange.changedFields.length}\n`);
        }
        tooltip.appendMarkdown(`\n*Click to open file*`);
        return tooltip;
    }
}

class FieldTreeItem extends TreeItem {
    constructor(
        private readonly field: any,
        private readonly itemChange: ItemChange
    ) {
        super(field.fieldName, vscode.TreeItemCollapsibleState.None);

        this.description  = `${FieldTreeItem.truncate(field.oldValue || '(empty)', 50)} → ${FieldTreeItem.truncate(field.newValue || '(empty)', 50)}`;
        this.tooltip      = this.createTooltip();
        this.contextValue = 'field';
        this.iconPath     = new vscode.ThemeIcon('symbol-field');
        this.command = {
            command: 'vscode.diff',
            title: 'Show Field Diff',
            arguments: [
                this.createVirtualDocument('old', field.oldValue || ''),
                this.createVirtualDocument('new', field.newValue || ''),
                `${field.fieldName} (${field.scope})${field.language ? ` - ${field.language}` : ''}`
            ]
        };
    }

    private static truncate(text: string, max: number): string {
        return text.length <= max ? text : text.substring(0, max) + '...';
    }

    private createVirtualDocument(suffix: string, content: string): vscode.Uri {
        return vscode.Uri.parse(`sitecore-field:${this.itemChange.item.name}/${this.field.fieldName}.${suffix}.txt`)
            .with({ query: Buffer.from(content).toString('base64') });
    }

    private createTooltip(): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${this.field.fieldName}**\n\n`);
        tooltip.appendMarkdown(`- **Field ID:** ${this.field.fieldId}\n`);
        tooltip.appendMarkdown(`- **Scope:** ${this.field.scope}\n`);
        if (this.field.language) { tooltip.appendMarkdown(`- **Language:** ${this.field.language}\n`); }
        if (this.field.version)  { tooltip.appendMarkdown(`- **Version:** ${this.field.version}\n`); }
        tooltip.appendMarkdown(`\n**Old Value:**\n\`\`\`\n${this.field.oldValue || '(empty)'}\n\`\`\`\n`);
        tooltip.appendMarkdown(`\n**New Value:**\n\`\`\`\n${this.field.newValue || '(empty)'}\n\`\`\`\n`);
        return tooltip;
    }
}

class ValidationCategoryTreeItem extends TreeItem {
    constructor(
        public readonly label: string,
        public readonly issues: ValidationIssue[],
        severity: 'error' | 'warning' | 'info'
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        const iconMap  = { error: 'error', warning: 'warning', info: 'info' };
        const colorMap = {
            error:   new vscode.ThemeColor('notificationsErrorIcon.foreground'),
            warning: new vscode.ThemeColor('notificationsWarningIcon.foreground'),
            info:    new vscode.ThemeColor('notificationsInfoIcon.foreground'),
        };
        this.iconPath     = new vscode.ThemeIcon(iconMap[severity], colorMap[severity]);
        this.contextValue = 'validationCategory';
    }
}

class ValidationIssueTreeItem extends TreeItem {
    constructor(public readonly issue: ValidationIssue) {
        super(issue.itemPath, vscode.TreeItemCollapsibleState.None);
        this.description = issue.message;
        this.tooltip     = new vscode.MarkdownString(
            `**${issue.severity}**\n\n**Path:** ${issue.itemPath}\n\n${issue.message}`
        );
        const iconMap: Record<string, string> = { Error: 'error', Warning: 'warning', Info: 'info' };
        const colorMap: Record<string, vscode.ThemeColor> = {
            Error:   new vscode.ThemeColor('notificationsErrorIcon.foreground'),
            Warning: new vscode.ThemeColor('notificationsWarningIcon.foreground'),
            Info:    new vscode.ThemeColor('notificationsInfoIcon.foreground'),
        };
        this.iconPath     = new vscode.ThemeIcon(iconMap[issue.severity] || 'circle-outline', colorMap[issue.severity]);
        this.contextValue = 'validationIssue';
    }
}

export class FieldContentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        return Buffer.from(uri.query, 'base64').toString('utf8');
    }
}
