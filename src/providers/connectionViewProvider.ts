import * as vscode from 'vscode';
import { SitecoreCLI } from '../services/sitecoreCLI';

type LoginType = 'identity' | 'cloud';

export class ConnectionViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sitecoreConnectionView';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _cli: SitecoreCLI
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        this._render();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'connect') {
                await this._handleConnect(msg.loginType, msg.cmHost, msg.authority);
            }
        });
    }

    public refresh(): void { this._render(); }

    private _render(state: 'idle' | 'connecting' = 'idle'): void {
        if (!this._view) { return; }
        const cfg = vscode.workspace.getConfiguration('sitecoreSerializer');
        const savedHost      = cfg.get<string>('sitecoreHost') || '';
        const savedAuthority = cfg.get<string>('sitecoreAuthority') || '';
        const loginType      = (cfg.get<string>('loginType') || 'identity') as LoginType;
        this._view.webview.html = this._getHtml(savedHost, savedAuthority, loginType, state);
    }

    private _renderWith(cmHost: string, authority: string, loginType: LoginType, state: 'idle' | 'connecting'): void {
        if (!this._view) { return; }
        this._view.webview.html = this._getHtml(cmHost, authority, loginType, state);
    }

    private async _handleConnect(loginType: LoginType, cmHost: string, authority: string): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('sitecoreSerializer');

        if (loginType === 'cloud') {
            await cfg.update('loginType', 'cloud', vscode.ConfigurationTarget.Workspace);
            this._renderWith('', '', 'cloud', 'connecting');
            const result = await this._cli.cloudLogin();
            if (result.success) {
                await cfg.update('sitecoreHost', '', vscode.ConfigurationTarget.Workspace);
                await cfg.update('sitecoreAuthority', '', vscode.ConfigurationTarget.Workspace);
            } else if (result.error !== 'Cancelled by user') {
                vscode.window.showErrorMessage(`Cloud login failed: ${result.error}`);
            }
            this._render();
            return;
        }

        // Identity login
        if (!cmHost || !cmHost.trim()) {
            vscode.window.showErrorMessage('Please enter a Sitecore CM host URL.');
            return;
        }
        const normHost      = this._normalizeUrl(cmHost);
        const normAuthority = authority && authority.trim() ? this._normalizeUrl(authority) : '';

        if (normAuthority === normHost) {
            vscode.window.showErrorMessage('Authority URL cannot be the same as the CM URL.');
            return;
        }

        await cfg.update('loginType', 'identity', vscode.ConfigurationTarget.Workspace);
        this._renderWith(normHost, normAuthority, 'identity', 'connecting');

        const result = await this._cli.connectToHost(normHost, normAuthority || undefined);
        if (result.success) {
            await cfg.update('sitecoreHost', normHost, vscode.ConfigurationTarget.Workspace);
            await cfg.update('sitecoreAuthority', normAuthority, vscode.ConfigurationTarget.Workspace);
            this._render();
        } else {
            if (result.error !== 'Cancelled by user') {
                vscode.window.showErrorMessage(`Connection failed: ${result.error}`);
            }
            this._renderWith(normHost, normAuthority, 'identity', 'idle');
        }
    }

    private _normalizeUrl(url: string): string {
        let u = url.trim();
        if (!u.startsWith('http://') && !u.startsWith('https://')) { u = 'https://' + u; }
        return u.replace(/\/$/, '');
    }

    private _getHtml(savedHost: string, savedAuthority: string, loginType: LoginType, state: 'idle' | 'connecting'): string {
        const isCloud      = loginType === 'cloud';
        const isConnected  = (isCloud || !!savedHost) && state === 'idle';
        const isConnecting = state === 'connecting';

        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escHost      = esc(savedHost);
        const escAuthority = esc(savedAuthority);

        const indicatorClass = isConnecting ? 'connecting' : isConnected ? 'connected' : 'disconnected';
        const statusLabel    = isConnecting ? 'Connecting...' : isConnected ? (isCloud ? 'Connected (Cloud)' : 'Connected') : 'Not Connected';
        const dis            = isConnecting ? 'disabled' : '';

        // Auto-suggest authority: replace //cm. with //id. in the CM host
        const suggestedAuthority = savedHost.replace(/^(https?:\/\/)cm\./, '$1id.');
        const initialAuthority   = savedAuthority || (suggestedAuthority !== savedHost ? suggestedAuthority : '');
        const escInitialAuthority = esc(initialAuthority);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sitecore Connection</title>
    <style>
        * { box-sizing: border-box; }
        body {
            padding: 12px;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background: transparent;
            margin: 0;
        }
        .status-card {
            display: flex; align-items: center; gap: 8px;
            margin-bottom: 14px; padding: 8px 10px;
            border-radius: 3px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            min-width: 0;
        }
        .indicator { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .indicator.connected    { background: #4ec9b0; box-shadow: 0 0 5px rgba(78,201,176,0.5); }
        .indicator.disconnected { background: var(--vscode-descriptionForeground); opacity: 0.5; }
        .indicator.connecting   { background: #e5c07b; animation: pulse 1s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .status-info { min-width: 0; flex: 1; overflow: hidden; }
        .status-label { font-weight: 600; font-size: 12px; }
        .status-host {
            font-size: 11px; color: var(--vscode-descriptionForeground);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            margin-top: 2px; font-family: var(--vscode-editor-font-family, monospace);
        }
        .segment-row {
            display: flex; gap: 4px; margin-bottom: 14px;
        }
        .segment-btn {
            flex: 1; padding: 4px 8px; border-radius: 3px; cursor: pointer;
            font-family: var(--vscode-font-family); font-size: 12px;
            border: 1px solid var(--vscode-button-secondaryBackground);
            background: transparent; color: var(--vscode-foreground);
            transition: background 0.15s;
        }
        .segment-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        .segment-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        label {
            display: block; margin-bottom: 4px;
            font-size: 11px; color: var(--vscode-descriptionForeground);
            text-transform: uppercase; letter-spacing: 0.06em;
        }
        input[type="text"] {
            width: 100%; padding: 5px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.35));
            border-radius: 2px;
            font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
            outline: none; margin-bottom: 10px;
        }
        input[type="text"]:focus   { border-color: var(--vscode-focusBorder); }
        input[type="text"]::placeholder { color: var(--vscode-input-placeholderForeground); }
        input[type="text"]:disabled { opacity: 0.5; }
        .btn-row { display: flex; gap: 6px; }
        button.btn-primary {
            flex: 1; padding: 5px 10px; border: none; border-radius: 2px;
            cursor: pointer; font-family: var(--vscode-font-family);
            font-size: 12px; font-weight: 500;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        button.btn-primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .hint { margin-top: 10px; font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
        .cloud-hint { margin-bottom: 10px; font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
    </style>
</head>
<body>
    <div class="status-card">
        <div class="indicator ${indicatorClass}"></div>
        <div class="status-info">
            <div class="status-label">${statusLabel}</div>
            ${isConnected && !isCloud && !isConnecting
                ? `<div class="status-host" title="${escHost}">${escHost}</div>`
                : ''}
        </div>
    </div>

    <div class="segment-row">
        <button class="segment-btn ${!isCloud ? 'active' : ''}" id="btnIdentity" onclick="setType('identity')" ${dis}>Sitecore on-prem</button>
        <button class="segment-btn ${isCloud ? 'active' : ''}" id="btnCloud" onclick="setType('cloud')" ${dis}>Sitecore AI</button>
    </div>

    <div id="identityFields" style="display:${isCloud ? 'none' : 'block'}">
        <label for="cmHostInput">CM Host</label>
        <input type="text" id="cmHostInput" value="${escHost}"
            placeholder="https://cm.your-site.com" ${dis} />

        <label for="authorityInput">Authority URL</label>
        <input type="text" id="authorityInput" value="${escInitialAuthority}"
            placeholder="https://id.your-site.com" ${dis} data-auto="true" />
    </div>

    <div id="cloudFields" style="display:${isCloud ? 'block' : 'none'}">
        <div class="cloud-hint">Authenticates via <strong>dotnet sitecore cloud login</strong>.<br>No host configuration required for Sitecore AI.</div>
    </div>

    <div class="btn-row">
        <button class="btn-primary" onclick="connect()" ${dis}>Connect</button>
    </div>

    <div class="hint" id="identityHint" style="display:${isCloud ? 'none' : 'block'}">
        A browser window will open to complete authentication.<br>
        The Authority URL defaults to <em>id.</em> of your CM host if left blank.
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentType = '${isCloud ? 'cloud' : 'identity'}';

        function setType(type) {
            currentType = type;
            document.getElementById('identityFields').style.display = type === 'identity' ? 'block' : 'none';
            document.getElementById('cloudFields').style.display    = type === 'cloud'    ? 'block' : 'none';
            document.getElementById('identityHint').style.display   = type === 'identity' ? 'block' : 'none';
            document.getElementById('btnIdentity').classList.toggle('active', type === 'identity');
            document.getElementById('btnCloud').classList.toggle('active', type === 'cloud');
        }

        function suggestAuthority(cm) {
            return cm.replace(/^(https?:\\/\\/)cm\\./, '$1id.');
        }

        function connect() {
            if (currentType === 'cloud') {
                vscode.postMessage({ command: 'connect', loginType: 'cloud', cmHost: '', authority: '' });
                return;
            }
            const cmHost    = (document.getElementById('cmHostInput')?.value || '').trim();
            const authority = (document.getElementById('authorityInput')?.value || '').trim();
            if (!cmHost) { document.getElementById('cmHostInput')?.focus(); return; }
            vscode.postMessage({ command: 'connect', loginType: 'identity', cmHost, authority });
        }

        // Auto-populate authority when CM host changes
        const cmInput   = document.getElementById('cmHostInput');
        const authInput = document.getElementById('authorityInput');

        if (cmInput && authInput) {
            cmInput.addEventListener('input', function() {
                if (authInput.dataset.auto !== 'false') {
                    const suggested = suggestAuthority(this.value.trim());
                    if (suggested !== this.value.trim()) { authInput.value = suggested; }
                }
            });
            authInput.addEventListener('input', function() {
                this.dataset.auto = 'false';
            });
        }

        ['cmHostInput', 'authorityInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('keydown', e => { if (e.key === 'Enter') { connect(); } }); }
        });
    </script>
</body>
</html>`;
    }
}
