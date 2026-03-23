import * as vscode from 'vscode';
import { SerializationAnalyzer } from '../services/serializationAnalyzer';

interface CliStats {
    mode: string;
    added: number;
    updated: number;
    deleted: number;
    fieldChanges: number;
}

export class StatsTreeProvider implements vscode.TreeDataProvider<StatItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatItem | undefined | null | void> = 
        new vscode.EventEmitter<StatItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatItem | undefined | null | void> = 
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

    getTreeItem(element: StatItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StatItem): Promise<StatItem[]> {
        if (!element) {
            if (this.cliStats) {
                const s = this.cliStats;
                const total = s.added + s.updated + s.deleted;
                return [
                    new StatItem('Mode', s.mode, 'eye', 'Current preview mode'),
                    new StatItem('Total Changes', total.toString(), 'graph-line', 'Total items that will change'),
                    new StatItem('Items Added', s.added.toString(), 'add', 'Items that will be created'),
                    new StatItem('Items Modified', s.updated.toString(), 'edit', 'Items that will be updated'),
                    new StatItem('Items Deleted', s.deleted.toString(), 'trash', 'Items that will be deleted'),
                    new StatItem('Field Changes', s.fieldChanges.toString(), 'symbol-field', 'Total field-level changes detected')
                ];
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
