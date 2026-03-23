import * as vscode from 'vscode';
import { SerializationAnalyzer } from '../services/serializationAnalyzer';

interface CliStats {
    mode: string;
    added: number;
    updated: number;
    deleted: number;
    fieldChanges: number;
    errorCount?: number;
    warningCount?: number;
}

export class StatsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
        new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private cliStats: CliStats | null = null;

    constructor(private analyzer: SerializationAnalyzer) {}

    refresh(): void {
        this.cliStats = null;
        this._onDidChangeTreeData.fire();
    }

    refreshWithCliData(mode: string, added: number, updated: number, deleted: number, changes: any[]): void {
        const fieldChanges = changes.reduce((sum: number, c: any) => sum + (c.fields?.length || 0), 0);
        this.cliStats = { mode, added, updated, deleted, fieldChanges };
        this._onDidChangeTreeData.fire();
    }

    refreshWithValidationData(errorCount: number, warningCount: number): void {
        this.cliStats = { mode: 'Validation', added: 0, updated: 0, deleted: 0, fieldChanges: 0, errorCount, warningCount };
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            if (this.cliStats) {
                const s = this.cliStats;
                const total = s.added + s.updated + s.deleted;
                const isPull     = s.mode === 'Pull Preview';
                const isPush     = s.mode === 'Push Preview';
                const isValidate = s.mode === 'Validation';

                if (isValidate) {
                    const errCount  = s.errorCount  ?? 0;
                    const warnCount = s.warningCount ?? 0;
                    const items: vscode.TreeItem[] = [
                        new StatItem('Mode', 'Validation', 'check-all', 'Serialization validation run'),
                        new StatItem('Errors',   errCount.toString(),  'error',   'Validation errors found'),
                        new StatItem('Warnings', warnCount.toString(), 'warning', 'Validation warnings found'),
                    ];
                    if (errCount > 0) {
                        items.push(new ActionItem('validate-fix'));
                    }
                    return items;
                }

                const items: vscode.TreeItem[] = [
                    new StatItem('Mode', s.mode, 'eye', 'Current preview mode'),
                    new StatItem('Total Changes', total.toString(), 'graph-line', 'Total items that will change'),
                    new StatItem('Items Added', s.added.toString(), 'add', 'Items that will be created'),
                    new StatItem('Items Modified', s.updated.toString(), 'edit', 'Items that will be updated'),
                    new StatItem('Items Deleted', s.deleted.toString(), 'trash', 'Items that will be deleted'),
                    new StatItem('Field Changes', s.fieldChanges.toString(), 'symbol-field', 'Total field-level changes detected'),
                ];

                if (total > 0 && (isPull || isPush)) {
                    items.push(new ActionItem(isPull ? 'pull' : 'push'));
                }

                return items;
            }

            const changes = this.analyzer.getChanges();
            return [
                new StatItem('Total Changes', changes.totalChanges.toString(), 'graph-line', 'The total number of items that have changed'),
                new StatItem('Items Added', changes.added.length.toString(), 'add', 'New Sitecore items serialized'),
                new StatItem('Items Modified', changes.modified.length.toString(), 'edit', 'Existing items with field changes'),
                new StatItem('Items Deleted', changes.deleted.length.toString(), 'trash', 'Items removed from serialization'),
                new StatItem('Field Changes', changes.fieldChanges.toString(), 'symbol-field', 'Total number of individual field modifications')
            ];
        }

        return [];
    }
}

class StatItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        iconName: string,
        tooltipText: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = value;
        this.tooltip = tooltipText;
        this.iconPath = new vscode.ThemeIcon(iconName);
        this.contextValue = 'stat';
    }
}

class ActionItem extends vscode.TreeItem {
    constructor(action: 'pull' | 'push' | 'validate-fix') {
        const cfg = {
            'pull':          { label: 'Pull Now',          icon: 'cloud-download', color: 'charts.blue',   cmd: 'sitecoreSerializer.executePull',    tip: 'Execute pull from Sitecore' },
            'push':          { label: 'Push Now',          icon: 'cloud-upload',   color: 'charts.green',  cmd: 'sitecoreSerializer.executePush',    tip: 'Execute push to Sitecore' },
            'validate-fix':  { label: 'Fix Validations',   icon: 'wrench',         color: 'charts.orange', cmd: 'sitecoreSerializer.validateFix',    tip: 'Run dotnet sitecore ser validate --fix' },
        }[action];

        super(cfg.label, vscode.TreeItemCollapsibleState.None);
        this.tooltip     = cfg.tip;
        this.iconPath    = new vscode.ThemeIcon(cfg.icon, new vscode.ThemeColor(cfg.color));
        this.command     = { command: cfg.cmd, title: cfg.label };
        this.contextValue = 'action';
    }
}
