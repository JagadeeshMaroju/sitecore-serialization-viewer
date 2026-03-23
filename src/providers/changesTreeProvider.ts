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
    
    private isPushPreview: boolean = false;
    private isPullPreview: boolean = false;
    private isValidation: boolean = false;
    private sitecoreChanges: any[] = [];
    private validationIssues: ValidationIssue[] = [];

    constructor(private analyzer: SerializationAnalyzer) {}

    refresh(): void {
        this.isPushPreview = false;
        this.isPullPreview = false;
        this.isValidation = false;
        this.sitecoreChanges = [];
        this.validationIssues = [];
        this._onDidChangeTreeData.fire();
    }

    refreshForValidation(issues: ValidationIssue[]): void {
        this.isValidation = true;
        this.isPullPreview = false;
        this.isPushPreview = false;
        this.sitecoreChanges = [];
        this.validationIssues = issues;
        this._onDidChangeTreeData.fire();
    }

    refreshForPushPreview(sitecoreChanges?: any[]): void {
        this.isPushPreview = true;
        this.isPullPreview = false;
        this.isValidation = false;
        this.validationIssues = [];
        this.sitecoreChanges = sitecoreChanges || [];
        this._onDidChangeTreeData.fire();
    }

    refreshForPullPreview(sitecoreChanges: any[]): void {
        this.isPullPreview = true;
        this.isPushPreview = false;
        this.isValidation = false;
        this.validationIssues = [];
        this.sitecoreChanges = sitecoreChanges;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {

            // Validation mode
            if (this.isValidation) {
                const items: TreeItem[] = [];
                if (this.validationIssues.length === 0) {
                    items.push(new InfoTreeItem('✅ Serialization is valid — no issues found.', 'info'));
                    return items;
                }
                items.push(new InfoTreeItem('🔍 Validation Results', 'info'));
                const errors   = this.validationIssues.filter(i => i.severity === 'Error');
                const warnings = this.validationIssues.filter(i => i.severity === 'Warning');
                const infos    = this.validationIssues.filter(i => i.severity === 'Info');
                if (errors.length > 0) {
                    items.push(new ValidationCategoryTreeItem(`Errors (${errors.length})`, errors, 'error'));
                }
                if (warnings.length > 0) {
                    items.push(new ValidationCategoryTreeItem(`Warnings (${warnings.length})`, warnings, 'warning'));
                }
                if (infos.length > 0) {
                    items.push(new ValidationCategoryTreeItem(`Info (${infos.length})`, infos, 'info'));
                }
                return items;
            }

            // Root level - show change type categories
            
            // If in Pull Preview mode, show Sitecore changes
            if (this.isPullPreview && this.sitecoreChanges.length > 0) {
                const items: TreeItem[] = [];
                
                items.push(new InfoTreeItem(
                    '📥 Sitecore Changes: What will be pulled from Sitecore',
                    'info'
                ));

                const creates = this.sitecoreChanges.filter(c => c.action === 'Create');
                const updates = this.sitecoreChanges.filter(c => c.action === 'Update');
                const deletes = this.sitecoreChanges.filter(c => c.action === 'Delete');

                if (creates.length > 0) {
                    items.push(new SitecoreCategoryTreeItem(
                        `Will be Created Locally (${creates.length})`,
                        creates,
                        'added'
                    ));
                }

                if (updates.length > 0) {
                    items.push(new SitecoreCategoryTreeItem(
                        `Will be Updated Locally (${updates.length})`,
                        updates,
                        'modified'
                    ));
                }

                if (deletes.length > 0) {
                    items.push(new SitecoreCategoryTreeItem(
                        `Will be Deleted Locally (${deletes.length})`,
                        deletes,
                        'deleted'
                    ));
                }

                return items;
            }
            
            // If in Push Preview mode with CLI data, show Sitecore changes
            if (this.isPushPreview && this.sitecoreChanges.length > 0) {
                const items: TreeItem[] = [];
                
                items.push(new InfoTreeItem(
                    '📤 Push Preview: What will be pushed to Sitecore',
                    'info'
                ));

                const creates = this.sitecoreChanges.filter(c => c.action === 'Create');
                const updates = this.sitecoreChanges.filter(c => c.action === 'Update');
                const deletes = this.sitecoreChanges.filter(c => c.action === 'Delete');

                if (creates.length > 0) {
                    items.push(new SitecoreCategoryTreeItem(
                        `Will be Created in Sitecore (${creates.length})`,
                        creates,
                        'added'
                    ));
                }

                if (updates.length > 0) {
                    items.push(new SitecoreCategoryTreeItem(
                        `Will be Updated in Sitecore (${updates.length})`,
                        updates,
                        'modified'
                    ));
                }

                if (deletes.length > 0) {
                    items.push(new SitecoreCategoryTreeItem(
                        `Will be Deleted from Sitecore (${deletes.length})`,
                        deletes,
                        'deleted'
                    ));
                }

                return items;
            }
            
            const changes = this.analyzer.getChanges();
            const items: TreeItem[] = [];

            if (changes.added.length > 0) {
                items.push(new CategoryTreeItem(
                    `Added (${changes.added.length})`,
                    'added',
                    changes.added.length,
                    'added'
                ));
            }

            if (changes.modified.length > 0) {
                items.push(new CategoryTreeItem(
                    `Modified (${changes.modified.length})`,
                    'modified',
                    changes.modified.length,
                    'modified'
                ));
            }

            if (changes.deleted.length > 0) {
                items.push(new CategoryTreeItem(
                    `Deleted (${changes.deleted.length})`,
                    'deleted',
                    changes.deleted.length,
                    'deleted'
                ));
            }

            if (items.length === 0) {
                return [new TreeItem(
                    'No changes detected. Click "Preview Pull" or "Preview Push" to check Sitecore.',
                    vscode.TreeItemCollapsibleState.None
                )];
            }

            return items;
        } else if (element instanceof CategoryTreeItem) {
            // Show items in this category
            const items = this.analyzer.getChangesByType(element.changeType);
            return items.map(item => new ItemTreeItem(item));
        } else if (element instanceof ValidationCategoryTreeItem) {
            return element.issues.map(i => new ValidationIssueTreeItem(i));
        } else if (element instanceof SitecoreCategoryTreeItem) {
            // Show Sitecore changes
            return element.changes.map(change => new SitecoreItemTreeItem(change));
        } else if (element instanceof SitecoreItemTreeItem) {
            // Show changed fields for Sitecore CLI items
            if (element.change.fields && element.change.fields.length > 0) {
                return element.change.fields.map((field: any) => 
                    new SitecoreFieldTreeItem(field)
                );
            }
        } else if (element instanceof ItemTreeItem) {
            // Show changed fields for modified items
            if (element.itemChange.type === 'modified' && element.itemChange.changedFields) {
                return element.itemChange.changedFields.map(field => 
                    new FieldTreeItem(field, element.itemChange)
                );
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
    constructor(
        public readonly label: string,
        public readonly type: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('notificationsInfoIcon.foreground'));
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
            iconName === 'added' ? 'diff-added' : 
            iconName === 'modified' ? 'diff-modified' : 
            'diff-removed'
        );
        
        this.contextValue = 'sitecoreCategory';
    }
}

class SitecoreItemTreeItem extends TreeItem {
    constructor(public readonly change: any) {
        // Make item expandable if it has fields
        const hasFields = change.fields && change.fields.length > 0;
        const collapsibleState = hasFields 
            ? vscode.TreeItemCollapsibleState.Collapsed 
            : vscode.TreeItemCollapsibleState.None;
        
        super(change.itemPath, collapsibleState);

        const fieldCount = hasFields ? ` (${change.fields.length} fields)` : '';
        this.description = `(${change.action})${fieldCount}`;
        this.tooltip = new vscode.MarkdownString(
            `**${change.action}**: ${change.itemPath}\n\n` +
            `${change.itemId ? `ID: ${change.itemId}\n` : ''}` +
            `${hasFields ? `Fields Changed: ${change.fields.length}` : ''}`
        );
        
        this.iconPath = new vscode.ThemeIcon(
            change.action === 'Create' ? 'add' :
            change.action === 'Update' ? 'edit' :
            'trash'
        );
        
        this.contextValue = 'sitecoreItem';
    }
}

class SitecoreFieldTreeItem extends TreeItem {
    constructor(public readonly field: any) {
        const fieldName = field.name || field;
        
        // Build single-line label: "FieldName: oldValue → newValue"
        let label = fieldName;
        if (field.oldValue !== undefined && field.newValue !== undefined) {
            // Truncate long values for display
            const oldPreview = field.oldValue.length > 20 ? field.oldValue.substring(0, 20) + '...' : field.oldValue;
            const newPreview = field.newValue.length > 20 ? field.newValue.substring(0, 20) + '...' : field.newValue;
            label = `${fieldName}: ${oldPreview} → ${newPreview}`;
        }
        
        super(label, vscode.TreeItemCollapsibleState.None);
        
        // Full details in tooltip
        if (field.oldValue !== undefined && field.newValue !== undefined) {
            this.tooltip = new vscode.MarkdownString(
                `**Field:** ${fieldName}\n\n` +
                `**Old Value:**\n\`\`\`\n${field.oldValue}\n\`\`\`\n\n` +
                `**New Value:**\n\`\`\`\n${field.newValue}\n\`\`\``
            );
        } else {
            this.tooltip = `Field: ${fieldName}`;
        }
        
        this.iconPath = new vscode.ThemeIcon('symbol-field');
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
            iconName === 'added' ? 'diff-added' : 
            iconName === 'modified' ? 'diff-modified' : 
            'diff-removed'
        );
        
        this.contextValue = 'category';
    }
}

class ItemTreeItem extends TreeItem {
    constructor(public readonly itemChange: ItemChange) {
        const hasFields = itemChange.changedFields && itemChange.changedFields.length > 0;
        const collapsibleState = hasFields 
            ? vscode.TreeItemCollapsibleState.Collapsed 
            : vscode.TreeItemCollapsibleState.None;

        super(itemChange.item.name, collapsibleState);

        this.description = itemChange.item.path;
        this.tooltip = this.createTooltip();
        this.contextValue = 'sitecoreItem';
        
        // Set icon based on change type
        this.iconPath = new vscode.ThemeIcon(
            itemChange.type === 'added' ? 'add' :
            itemChange.type === 'modified' ? 'edit' :
            'trash'
        );

        // Add command to open file
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
        
        if (this.itemChange.changedFields && this.itemChange.changedFields.length > 0) {
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

        const oldPreview = this.truncate(field.oldValue || '(empty)', 50);
        const newPreview = this.truncate(field.newValue || '(empty)', 50);
        
        this.description = `${oldPreview} → ${newPreview}`;
        this.tooltip = this.createTooltip();
        this.contextValue = 'field';
        
        this.iconPath = new vscode.ThemeIcon('symbol-field');

        // Command to show diff
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

    private truncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + '...';
    }

    private createVirtualDocument(suffix: string, content: string): vscode.Uri {
        const scheme = 'sitecore-field';
        const path = `${this.itemChange.item.name}/${this.field.fieldName}.${suffix}.txt`;
        return vscode.Uri.parse(`${scheme}:${path}`).with({ 
            query: Buffer.from(content).toString('base64') 
        });
    }

    private createTooltip(): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${this.field.fieldName}**\n\n`);
        tooltip.appendMarkdown(`- **Field ID:** ${this.field.fieldId}\n`);
        tooltip.appendMarkdown(`- **Scope:** ${this.field.scope}\n`);
        
        if (this.field.language) {
            tooltip.appendMarkdown(`- **Language:** ${this.field.language}\n`);
        }
        if (this.field.version) {
            tooltip.appendMarkdown(`- **Version:** ${this.field.version}\n`);
        }

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
        const iconMap = { error: 'error', warning: 'warning', info: 'info' };
        const colorMap = {
            error:   new vscode.ThemeColor('notificationsErrorIcon.foreground'),
            warning: new vscode.ThemeColor('notificationsWarningIcon.foreground'),
            info:    new vscode.ThemeColor('notificationsInfoIcon.foreground'),
        };
        this.iconPath = new vscode.ThemeIcon(iconMap[severity], colorMap[severity]);
        this.contextValue = 'validationCategory';
    }
}

class ValidationIssueTreeItem extends TreeItem {
    constructor(public readonly issue: ValidationIssue) {
        super(issue.itemPath, vscode.TreeItemCollapsibleState.None);
        this.description = issue.message;
        this.tooltip = new vscode.MarkdownString(
            `**${issue.severity}**\n\n` +
            `**Path:** ${issue.itemPath}\n\n` +
            `${issue.message}`
        );
        const iconMap: Record<string, string> = { Error: 'error', Warning: 'warning', Info: 'info' };
        const colorMap: Record<string, vscode.ThemeColor> = {
            Error:   new vscode.ThemeColor('notificationsErrorIcon.foreground'),
            Warning: new vscode.ThemeColor('notificationsWarningIcon.foreground'),
            Info:    new vscode.ThemeColor('notificationsInfoIcon.foreground'),
        };
        this.iconPath = new vscode.ThemeIcon(iconMap[issue.severity] || 'circle-outline', colorMap[issue.severity]);
        this.contextValue = 'validationIssue';
    }
}

// Virtual document provider for field diffs
export class FieldContentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        const content = Buffer.from(uri.query, 'base64').toString('utf8');
        return content;
    }
}
