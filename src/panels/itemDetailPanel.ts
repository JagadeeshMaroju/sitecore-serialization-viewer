import * as vscode from 'vscode';

export class ItemDetailPanel {
    public static currentPanel: ItemDetailPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, item: any) {
        this._panel = panel;
        this._panel.webview.html = this.getWebviewContent(item);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static render(extensionUri: vscode.Uri, item: any) {
        if (ItemDetailPanel.currentPanel) {
            ItemDetailPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            ItemDetailPanel.currentPanel._panel.webview.html = 
                ItemDetailPanel.currentPanel.getWebviewContent(item);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'sitecoreItemDetail',
                'Sitecore Item Details',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            ItemDetailPanel.currentPanel = new ItemDetailPanel(panel, extensionUri, item);
        }
    }

    private getWebviewContent(item: any): string {
        const changedFields = item.itemChange?.changedFields || [];
        const sitecoreItem = item.itemChange?.item || item;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sitecore Item Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-textSeparator-foreground);
            padding-bottom: 10px;
        }
        
        h2 {
            color: var(--vscode-textLink-activeForeground);
            margin-top: 25px;
            border-bottom: 1px solid var(--vscode-textSeparator-foreground);
            padding-bottom: 5px;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 10px;
            margin: 15px 0;
        }
        
        .info-label {
            font-weight: bold;
            color: var(--vscode-textPreformat-foreground);
        }
        
        .info-value {
            font-family: var(--vscode-editor-font-family);
            word-break: break-all;
        }
        
        .field-change {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding: 15px;
            margin: 10px 0;
            border-radius: 4px;
        }
        
        .field-name {
            font-weight: bold;
            font-size: 1.1em;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        
        .field-meta {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
        }
        
        .diff-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-top: 10px;
        }
        
        .diff-side {
            background: var(--vscode-editor-background);
            padding: 10px;
            border-radius: 4px;
            border: 1px solid var(--vscode-textSeparator-foreground);
        }
        
        .diff-label {
            font-weight: bold;
            margin-bottom: 8px;
            padding: 5px;
            border-radius: 3px;
        }
        
        .old-value {
            background: var(--vscode-diffEditor-removedTextBackground);
        }
        
        .new-value {
            background: var(--vscode-diffEditor-insertedTextBackground);
        }
        
        .diff-content {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            padding: 10px;
            background: var(--vscode-textCodeBlock-background);
            border-radius: 3px;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 0.85em;
            font-weight: bold;
            margin-right: 5px;
        }
        
        .badge-added {
            background: var(--vscode-gitDecoration-addedResourceForeground);
            color: white;
        }
        
        .badge-modified {
            background: var(--vscode-gitDecoration-modifiedResourceForeground);
            color: white;
        }
        
        .badge-deleted {
            background: var(--vscode-gitDecoration-deletedResourceForeground);
            color: white;
        }
        
        .no-changes {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <h1>${this.escapeHtml(sitecoreItem.name)}</h1>
    
    <div class="info-grid">
        <div class="info-label">Status:</div>
        <div class="info-value">
            <span class="badge badge-${item.itemChange?.type || 'added'}">
                ${(item.itemChange?.type || 'unknown').toUpperCase()}
            </span>
        </div>
        
        <div class="info-label">Path:</div>
        <div class="info-value">${this.escapeHtml(sitecoreItem.path)}</div>
        
        <div class="info-label">Item ID:</div>
        <div class="info-value">${this.escapeHtml(sitecoreItem.id)}</div>
        
        <div class="info-label">Template ID:</div>
        <div class="info-value">${this.escapeHtml(sitecoreItem.template)}</div>
        
        <div class="info-label">Parent ID:</div>
        <div class="info-value">${this.escapeHtml(sitecoreItem.parent)}</div>
        
        ${sitecoreItem.branchId ? `
        <div class="info-label">Branch ID:</div>
        <div class="info-value">${this.escapeHtml(sitecoreItem.branchId)}</div>
        ` : ''}
        
        <div class="info-label">File Path:</div>
        <div class="info-value">${this.escapeHtml(sitecoreItem.filePath)}</div>
    </div>
    
    ${changedFields.length > 0 ? `
        <h2>Changed Fields (${changedFields.length})</h2>
        ${changedFields.map((field: any) => `
            <div class="field-change">
                <div class="field-name">${this.escapeHtml(field.fieldName)}</div>
                <div class="field-meta">
                    <strong>Field ID:</strong> ${this.escapeHtml(field.fieldId)} | 
                    <strong>Scope:</strong> ${this.escapeHtml(field.scope)}
                    ${field.language ? ` | <strong>Language:</strong> ${this.escapeHtml(field.language)}` : ''}
                    ${field.version ? ` | <strong>Version:</strong> ${field.version}` : ''}
                </div>
                <div class="diff-container">
                    <div class="diff-side">
                        <div class="diff-label old-value">Old Value</div>
                        <div class="diff-content">${this.escapeHtml(field.oldValue || '(empty)')}</div>
                    </div>
                    <div class="diff-side">
                        <div class="diff-label new-value">New Value</div>
                        <div class="diff-content">${this.escapeHtml(field.newValue || '(empty)')}</div>
                    </div>
                </div>
            </div>
        `).join('')}
    ` : '<div class="no-changes">No field changes detected</div>'}
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        if (!text) {
            return '';
        }
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    public dispose() {
        ItemDetailPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
