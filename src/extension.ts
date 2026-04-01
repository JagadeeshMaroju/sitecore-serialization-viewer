import * as vscode from 'vscode';
import { ChangesTreeProvider, FieldContentProvider } from './providers/changesTreeProvider';
import { StatsTreeProvider } from './providers/statsTreeProvider';
import { ConnectionViewProvider } from './providers/connectionViewProvider';
import { SerializationAnalyzer } from './services/serializationAnalyzer';
import { SitecoreCLI } from './services/sitecoreCLI';
import { ItemDetailPanel } from './panels/itemDetailPanel';

export async function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Sitecore Serialization');
    context.subscriptions.push(outputChannel);

    const log = (message: string) => {
        console.log(message);
        outputChannel.appendLine(message);
    };
    
    log('========================================');
    log('Sitecore Serialization Viewer - Activating');
    log('========================================');
    log(`VS Code Version: ${vscode.version}`);
    log(`Workspace Folders: ${vscode.workspace.workspaceFolders?.length || 0}`);
    if (vscode.workspace.workspaceFolders?.[0]) {
        log(`Workspace Root: ${vscode.workspace.workspaceFolders[0].uri.fsPath}`);
    }
    log('');

    try {
        const analyzer = new SerializationAnalyzer();
        const changesProvider = new ChangesTreeProvider(analyzer);
        const statsProvider = new StatsTreeProvider(analyzer);

        const gitRoot = analyzer.getGitRoot();
        const sitecoreCLI = new SitecoreCLI(gitRoot);

        const config = vscode.workspace.getConfiguration('sitecoreSerializer');
        const existingHost = config.get<string>('sitecoreHost') || '';
        if (!existingHost) {
            const detectedHost = sitecoreCLI.detectHost();
            if (detectedHost) {
                await config.update('sitecoreHost', detectedHost, vscode.ConfigurationTarget.Workspace);
            }
        }

        vscode.window.registerTreeDataProvider('sitecoreChangesView', changesProvider);
        vscode.window.registerTreeDataProvider('sitecoreStatsView', statsProvider);

        const connectionProvider = new ConnectionViewProvider(context.extensionUri, sitecoreCLI);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                ConnectionViewProvider.viewType,
                connectionProvider
            )
        );

        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('sitecoreSerializer.sitecoreHost')) {
                    connectionProvider.refresh();
                }
            })
        );

        context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider(
                'sitecore-field',
                new FieldContentProvider()
            )
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.connect', async () => {
                await vscode.commands.executeCommand('sitecoreConnectionView.focus');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.viewChanges', async () => {
                try {
                    await analyzer.analyzeChanges();
                    changesProvider.refresh();
                    statsProvider.refresh();
                    vscode.window.showInformationMessage('Sitecore serialization changes loaded!');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to analyze changes: ${error}`);
                }
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.previewPull', async () => {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Sitecore Pull Preview',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: 'Checking what Sitecore has changed...' });

                    try {
                        const result = await sitecoreCLI.pullWhatIf();

                        if (!result.success && !result.changes.length) {
                            vscode.window.showErrorMessage(
                                `Could not preview pull: ${result.error || 'Unknown error'}\n\n` +
                                `Try running: dotnet sitecore ser pull -t --what-if`
                            );
                            return;
                        }

                        progress.report({ message: 'Analyzing what would be pulled...' });

                        const changes = result.changes;
                        const creates = changes.filter(c => c.action === 'Create').length;
                        const updates = changes.filter(c => c.action === 'Update').length;
                        const deletes = changes.filter(c => c.action === 'Delete').length;
                        const skips   = changes.filter(c => c.action === 'Skip').length;

                        changesProvider.refreshForPullPreview(changes);
                        statsProvider.refreshWithCliData('Pull Preview', creates, updates, deletes, changes);
                        await vscode.commands.executeCommand('setContext', 'sitecoreSerializer.previewMode', 'pull');

                        if (creates + updates + deletes === 0) {
                            vscode.window.showInformationMessage('No changes in Sitecore. Your local files are up to date!');
                            return;
                        }

                        const hasLocalChanges = (await analyzer.analyzeChanges()).totalChanges > 0;
                        const warningMsg = hasLocalChanges
                            ? '\n\n⚠️ You have uncommitted local changes — pulling will overwrite them.'
                            : '';

                        const message =
                            `📥 Pull Preview (see sidebar for details):\n\n` +
                            `  • ${creates} item(s) will be CREATED locally\n` +
                            `  • ${updates} item(s) will be UPDATED locally\n` +
                            `  • ${deletes} item(s) will be DELETED locally` +
                            (skips > 0 ? `\n  • ${skips} item(s) will be SKIPPED` : '') +
                            warningMsg;

                        vscode.window.showInformationMessage(message, 'Pull Now', 'Show CLI Output')
                            .then(async action => {
                                if (action === 'Pull Now') {
                                    await vscode.commands.executeCommand('sitecoreSerializer.executePull');
                                } else if (action === 'Show CLI Output') {
                                    const doc = await vscode.workspace.openTextDocument({ content: result.output, language: 'log' });
                                    await vscode.window.showTextDocument(doc);
                                }
                            });
                    } catch (error) {
                        vscode.window.showErrorMessage(`Pull preview failed: ${error}`);
                    }
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.previewPush', async () => {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Sitecore Push Preview',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: 'Connecting to Sitecore CLI...' });

                    try {
                        const result = await sitecoreCLI.pushWhatIf();

                        if (!result.success && !result.changes.length) {
                            vscode.window.showErrorMessage(
                                `Could not preview push: ${result.error || 'Unknown error'}\n\n` +
                                `Try running: dotnet sitecore ser push -t --what-if`
                            );
                            return;
                        }

                        progress.report({ message: 'Analyzing what would be pushed...' });

                        const changes = result.changes;
                        const creates = changes.filter(c => c.action === 'Create').length;
                        const updates = changes.filter(c => c.action === 'Update').length;
                        const deletes = changes.filter(c => c.action === 'Delete').length;
                        const skips   = changes.filter(c => c.action === 'Skip').length;

                        changesProvider.refreshForPushPreview(changes);
                        statsProvider.refreshWithCliData('Push Preview', creates, updates, deletes, changes);
                        await vscode.commands.executeCommand('setContext', 'sitecoreSerializer.previewMode', 'push');

                        if (creates + updates + deletes === 0) {
                            vscode.window.showInformationMessage('No changes to push. All items are synchronized with Sitecore.');
                            return;
                        }

                        const message =
                            `📤 Push Preview (see sidebar for details):\n\n` +
                            `  • ${creates} item(s) will be CREATED in Sitecore\n` +
                            `  • ${updates} item(s) will be UPDATED in Sitecore\n` +
                            `  • ${deletes} item(s) will be DELETED from Sitecore` +
                            (skips > 0 ? `\n  • ${skips} item(s) will be SKIPPED` : '');

                        vscode.window.showInformationMessage(message, 'Push Now', 'Show CLI Output')
                            .then(async action => {
                                if (action === 'Push Now') {
                                    await vscode.commands.executeCommand('sitecoreSerializer.executePush');
                                } else if (action === 'Show CLI Output') {
                                    const doc = await vscode.workspace.openTextDocument({ content: result.output, language: 'log' });
                                    await vscode.window.showTextDocument(doc);
                                }
                            });
                    } catch (error) {
                        vscode.window.showErrorMessage(`Push preview failed: ${error}`);
                    }
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.validate', async () => {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Sitecore Serialization Validation',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: 'Validating serialization...' });
                    try {
                        const result = await sitecoreCLI.validate();
                        if (result.output) { log(result.output); }

                        changesProvider.refreshForValidation(result.issues);
                        statsProvider.refreshWithValidationData(result.errorCount, result.warningCount);
                        await vscode.commands.executeCommand('setContext', 'sitecoreSerializer.previewMode',
                            result.errorCount > 0 ? 'validate-errors' : 'validate');

                        if (result.errorCount === 0 && result.warningCount === 0) {
                            vscode.window.showInformationMessage('Serialization is valid — no issues found.');
                        } else {
                            const summary = `Validation: ${result.errorCount} error(s), ${result.warningCount} warning(s) — see sidebar for details.`;
                            const buttons: string[] = result.errorCount > 0 ? ['Fix Validations', 'Show Output'] : ['Show Output'];
                            vscode.window.showWarningMessage(summary, ...buttons).then(async action => {
                                if (action === 'Fix Validations') {
                                    await vscode.commands.executeCommand('sitecoreSerializer.validateFix');
                                } else if (action === 'Show Output') {
                                    const doc = await vscode.workspace.openTextDocument({ content: result.output, language: 'log' });
                                    await vscode.window.showTextDocument(doc);
                                }
                            });
                        }
                    } catch (error) {
                        vscode.window.showErrorMessage(`Validation failed: ${error}`);
                    }
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.validateFix', async () => {
                const confirm = await vscode.window.showWarningMessage(
                    'This will attempt to auto-fix serialization validation errors. Continue?',
                    { modal: true },
                    'Fix Now'
                );
                if (confirm !== 'Fix Now') { return; }

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Sitecore Serialization Fix',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: 'Fixing validation errors...' });
                    try {
                        const result = await sitecoreCLI.validateFix();
                        if (result.output) { log(result.output); }

                        changesProvider.refreshForValidation(result.issues);
                        statsProvider.refreshWithValidationData(result.errorCount, result.warningCount);
                        await vscode.commands.executeCommand('setContext', 'sitecoreSerializer.previewMode',
                            result.errorCount > 0 ? 'validate-errors' : 'validate');

                        if (result.errorCount === 0) {
                            vscode.window.showInformationMessage('All validation errors fixed!');
                        } else {
                            vscode.window.showWarningMessage(`${result.errorCount} error(s) could not be fixed automatically.`);
                        }
                    } catch (error) {
                        vscode.window.showErrorMessage(`Validate fix failed: ${error}`);
                    }
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.executePull', async () => {
                const confirm = await vscode.window.showWarningMessage(
                    'This will pull all changes from Sitecore and overwrite your local serialization files. Continue?',
                    { modal: true },
                    'Pull Now'
                );
                if (confirm !== 'Pull Now') { return; }

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Sitecore Pull',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: 'Pulling from Sitecore...' });
                    const result = await sitecoreCLI.pull();
                    if (result.output) { log(result.output); }

                    if (result.success) {
                        await vscode.commands.executeCommand('setContext', 'sitecoreSerializer.previewMode', '');
                        await analyzer.analyzeChanges();
                        changesProvider.refresh();
                        statsProvider.refresh();
                        vscode.window.showInformationMessage('Pull completed successfully!');
                    } else {
                        vscode.window.showErrorMessage(`Pull failed: ${result.error || 'Unknown error'}`);
                    }
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.executePush', async () => {
                const confirm = await vscode.window.showWarningMessage(
                    'This will push your local serialization files to Sitecore. Continue?',
                    { modal: true },
                    'Push Now'
                );
                if (confirm !== 'Push Now') { return; }

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Sitecore Push',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ message: 'Pushing to Sitecore...' });
                    const result = await sitecoreCLI.push();
                    if (result.output) { log(result.output); }

                    if (result.success) {
                        await vscode.commands.executeCommand('setContext', 'sitecoreSerializer.previewMode', '');
                        await analyzer.analyzeChanges();
                        changesProvider.refresh();
                        statsProvider.refresh();
                        vscode.window.showInformationMessage('Push completed successfully!');
                    } else {
                        vscode.window.showErrorMessage(`Push failed: ${result.error || 'Unknown error'}`);
                    }
                });
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.refreshView', async () => {
                await vscode.commands.executeCommand('setContext', 'sitecoreSerializer.previewMode', '');
                await analyzer.analyzeChanges();
                changesProvider.refresh();
                statsProvider.refresh();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sitecoreSerializer.showItemDetails', (item: any) => {
                ItemDetailPanel.render(context.extensionUri, item);
            })
        );

        const autoRefresh = vscode.workspace.getConfiguration('sitecoreSerializer').get<boolean>('autoRefresh');
        if (autoRefresh) {
            const watcher = vscode.workspace.createFileSystemWatcher('**/*.yml');
            watcher.onDidChange(() => {
                analyzer.analyzeChanges().then(() => {
                    changesProvider.refresh();
                    statsProvider.refresh();
                }).catch(error => {
                    log(`Auto-refresh failed: ${error}`);
                });
            });
            context.subscriptions.push(watcher);
        }

        analyzer.analyzeChanges().then((result) => {
            changesProvider.refresh();
            statsProvider.refresh();
            log(`Sitecore Serialization Viewer ready. ${result.totalChanges} local change(s) found.`);
        }).catch(error => {
            log(`Initial analysis failed: ${error}`);
        });

    } catch (error) {
        log(`Extension activation failed: ${error}`);
        vscode.window.showErrorMessage(
            `Sitecore Serialization Viewer failed to activate: ${error}\n\nCheck the Output panel for details.`
        );
        outputChannel.show(true);
    }
}

export function deactivate() {}
