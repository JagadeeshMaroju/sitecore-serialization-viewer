import * as vscode from 'vscode';
import { ChangesTreeProvider, FieldContentProvider } from './providers/changesTreeProvider';
import { StatsTreeProvider } from './providers/statsTreeProvider';
import { SerializationAnalyzer } from './services/serializationAnalyzer';
import { SitecoreCLI } from './services/sitecoreCLI';
import { ItemDetailPanel } from './panels/itemDetailPanel';

export function activate(context: vscode.ExtensionContext) {
    // Create dedicated output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Sitecore Serialization');
    context.subscriptions.push(outputChannel);
    
    // Helper function to log to both console and output channel
    const log = (message: string) => {
        console.log(message);
        outputChannel.appendLine(message);
    };
    
    log('========================================');
    log('Sitecore Serialization Viewer - Activating');
    log('========================================');
    log(`Extension Version: 1.0.3`);
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
        
        // Use the git root that the analyzer found
        const gitRoot = analyzer.getGitRoot();
        const sitecoreCLI = new SitecoreCLI(gitRoot);
        
        // Log the paths being used
        log('📁 Paths Discovered:');
        log(`  Git root: ${gitRoot}`);
        log(`  Serialization path: ${analyzer.getSerializationPath()}`);
        log('');

    // Register tree data providers
    vscode.window.registerTreeDataProvider('sitecoreChangesView', changesProvider);
    vscode.window.registerTreeDataProvider('sitecoreStatsView', statsProvider);

    // Register virtual document provider for field diffs
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            'sitecore-field',
            new FieldContentProvider()
        )
    );

    // Register commands
    log('📝 Registering commands...');
    context.subscriptions.push(
        vscode.commands.registerCommand('sitecoreSerializer.viewChanges', async () => {
            log('🔄 Command: viewChanges - Starting analysis...');
            try {
                await analyzer.analyzeChanges();
                changesProvider.refresh();
                statsProvider.refresh();
                log('✅ Command: viewChanges - Completed successfully');
                vscode.window.showInformationMessage('Sitecore serialization changes loaded!');
            } catch (error) {
                log(`❌ Command: viewChanges - Failed: ${error}`);
                console.error('❌ Command: viewChanges - Failed:', error);
                vscode.window.showErrorMessage(`Failed to analyze changes: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sitecoreSerializer.previewPull', async () => {
            log('🔄 Command: previewPull - Starting...');
            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Sitecore Pull Preview",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: "Checking what Sitecore has changed..." });
                
                try {
                    // Execute what-if command
                    log('  Executing: dotnet sitecore ser pull -t --what-if');
                    const result = await sitecoreCLI.pullWhatIf();
                    log(`  Result: success=${result.success}, changes=${result.changes.length}`);
                    
                    // Log the raw CLI output
                    if (result.output) {
                        log('');
                        log('  --- CLI Output Start ---');
                        log(result.output);
                        log('  --- CLI Output End ---');
                        log('');
                    }
                    
                    if (!result.success && !result.changes.length) {
                        log(`  ❌ Pull preview failed: ${result.error}`);
                        console.error('  ❌ Pull preview failed:', result.error);
                        vscode.window.showErrorMessage(
                            `❌ Could not preview pull: ${result.error || 'Unknown error'}\n\n` +
                            `Try running: dotnet sitecore ser pull -t --what-if`
                        );
                        return;
                    }
                    
                    progress.report({ message: "Analyzing what would be pulled..." });
                    
                    // Show the CLI output in the tree view
                    const changes = result.changes;
                    const creates = changes.filter(c => c.action === 'Create').length;
                    const updates = changes.filter(c => c.action === 'Update').length;
                    const deletes = changes.filter(c => c.action === 'Delete').length;
                    const skips = changes.filter(c => c.action === 'Skip').length;
                    
                    log(`  📊 Changes: ${creates} creates, ${updates} updates, ${deletes} deletes, ${skips} skips`);
                    
                    // Update tree view and stats with Sitecore changes
                    changesProvider.refreshForPullPreview(changes);
                    statsProvider.refreshWithCliData('Pull Preview', creates, updates, deletes, changes);
                    
                    if (creates + updates + deletes === 0) {
                        log('  ✅ No changes detected');
                        vscode.window.showInformationMessage(
                            '✅ No changes in Sitecore. Your local files are up to date!'
                        );
                    } else {
                        const hasLocalChanges = (await analyzer.analyzeChanges()).totalChanges > 0;
                        log(`  Local changes detected: ${hasLocalChanges}`);
                        
                        let warningMsg = '';
                        if (hasLocalChanges) {
                            warningMsg = '\n\n⚠️ WARNING: You have uncommitted local changes!\n' +
                                'Pulling will overwrite your local files.\n' +
                            'Consider committing or stashing first.';
                    }
                    
                    const message = `📥 Sitecore Has Changes (showing in sidebar):\n\n` +
                        `  • ${creates} item(s) will be CREATED locally\n` +
                        `  • ${updates} item(s) will be UPDATED locally\n` +
                        `  • ${deletes} item(s) will be DELETED locally` +
                        (skips > 0 ? `\n  • ${skips} item(s) will be SKIPPED` : '') +
                        warningMsg;
                    
                    // Don't await - let it show and dismiss naturally
                    vscode.window.showInformationMessage(
                        message,
                        ...(hasLocalChanges 
                            ? ['Show CLI Output', 'Copy Pull Command', 'Show My Local Changes']
                            : ['Show CLI Output', 'Copy Pull Command']
                        )
                    ).then(async action => {
                        if (action === 'Show CLI Output') {
                            const doc = await vscode.workspace.openTextDocument({
                                content: result.output,
                                language: 'log'
                            });
                            await vscode.window.showTextDocument(doc);
                        } else if (action === 'Copy Pull Command') {
                            await vscode.env.clipboard.writeText('dotnet sitecore ser pull');
                            vscode.window.showInformationMessage('📋 Command copied to clipboard!');
                        } else if (action === 'Show My Local Changes') {
                            await analyzer.analyzeChanges();
                            changesProvider.refresh();
                            statsProvider.refresh();
                        }
                    });
                }
                } catch (error) {
                    log(`❌ Command: previewPull - Failed: ${error}`);
                    console.error('❌ Command: previewPull - Failed:', error);
                    vscode.window.showErrorMessage(`Pull preview failed: ${error}`);
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sitecoreSerializer.previewPush', async () => {
            log('🔄 Command: previewPush - Starting...');
            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Sitecore Push Preview",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: "Connecting to Sitecore CLI..." });
                
                try {
                    // Execute what-if command
                    log('  Executing: dotnet sitecore ser push -t --what-if');
                    const result = await sitecoreCLI.pushWhatIf();
                    log(`  Result: success=${result.success}, changes=${result.changes.length}`);
                    
                    // Log the raw CLI output
                    if (result.output) {
                        log('');
                        log('  --- CLI Output Start ---');
                        log(result.output);
                        log('  --- CLI Output End ---');
                        log('');
                    }
                    
                    if (!result.success && !result.changes.length) {
                        log(`  ❌ Push preview failed: ${result.error}`);
                        console.error('  ❌ Push preview failed:', result.error);
                        vscode.window.showErrorMessage(
                            `❌ Could not preview push: ${result.error || 'Unknown error'}\n\n` +
                            `Try running: dotnet sitecore ser push -t --what-if`
                        );
                        return;
                    }
                    
                    progress.report({ message: "Analyzing what would be pushed..." });
                    
                    // Show the CLI output in the tree view
                    const changes = result.changes;
                    const creates = changes.filter(c => c.action === 'Create').length;
                    const updates = changes.filter(c => c.action === 'Update').length;
                    const deletes = changes.filter(c => c.action === 'Delete').length;
                    const skips = changes.filter(c => c.action === 'Skip').length;
                    
                    log(`  📊 Changes: ${creates} creates, ${updates} updates, ${deletes} deletes, ${skips} skips`);
                    
                    progress.report({ message: "Complete!" });
                    
                    // Update tree view and stats with Sitecore CLI changes
                    changesProvider.refreshForPushPreview(changes);
                    statsProvider.refreshWithCliData('Push Preview', creates, updates, deletes, changes);
                    
                    log('✅ Command: previewPush - Completed');
                    
                    if (creates + updates + deletes === 0) {
                        log('  ✅ No changes detected');
                        vscode.window.showInformationMessage(
                            '✅ No changes to push. All items are synchronized with Sitecore.'
                        );
                    } else {
                        const message = `📤 Sitecore CLI Reports (showing in sidebar):\n\n` +
                            `  • ${creates} item(s) will be CREATED in Sitecore\n` +
                            `  • ${updates} item(s) will be UPDATED in Sitecore\n` +
                            `  • ${deletes} item(s) will be DELETED from Sitecore` +
                            (skips > 0 ? `\n  • ${skips} item(s) will be SKIPPED` : '');
                        
                        // Don't await - let it show and dismiss naturally
                        vscode.window.showInformationMessage(
                            message,
                            'Show CLI Output',
                            'Copy Push Command',
                            'Dismiss'
                        ).then(action => {
                            if (action === 'Show CLI Output') {
                                vscode.workspace.openTextDocument({
                                    content: result.output,
                                    language: 'log'
                                }).then(doc => vscode.window.showTextDocument(doc));
                            } else if (action === 'Copy Push Command') {
                                vscode.env.clipboard.writeText('dotnet sitecore ser push');
                                vscode.window.showInformationMessage('📋 Command copied to clipboard!');
                            }
                        });
                    }
                } catch (error) {
                    log(`❌ Command: previewPush - Failed: ${error}`);
                    console.error('❌ Command: previewPush - Failed:', error);
                    vscode.window.showErrorMessage(`Push preview failed: ${error}`);
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sitecoreSerializer.refreshView', async () => {
            log('🔄 Command: refreshView - Refreshing...');
            await analyzer.analyzeChanges();
            changesProvider.refresh();
            statsProvider.refresh();
            log('✅ Command: refreshView - Completed');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sitecoreSerializer.showItemDetails', (item: any) => {
            ItemDetailPanel.render(context.extensionUri, item);
        })
    );

    // Auto-refresh on file changes
    const config = vscode.workspace.getConfiguration('sitecoreSerializer');
    const autoRefresh = config.get<boolean>('autoRefresh');
    log(`⚙️  Auto-refresh: ${autoRefresh ? 'enabled' : 'disabled'}`);
    
    if (autoRefresh) {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.yml');
        
        watcher.onDidChange(() => {
            log('📝 File change detected, refreshing...');
            analyzer.analyzeChanges().then(() => {
                changesProvider.refresh();
                statsProvider.refresh();
            }).catch(error => {
                log(`❌ Auto-refresh failed: ${error}`);
                console.error('❌ Auto-refresh failed:', error);
            });
        });

        context.subscriptions.push(watcher);
        log('👀 File watcher registered for *.yml files');
    }

    // Initial analysis
    log('');
    log('🔍 Running initial analysis...');
    analyzer.analyzeChanges().then((result) => {
        changesProvider.refresh();
        statsProvider.refresh();
        log(`✅ Initial analysis complete: ${result.totalChanges} changes found`);
        log(`   Added: ${result.added.length}, Modified: ${result.modified.length}, Deleted: ${result.deleted.length}`);
        log('');
        log('========================================');
        log('✅ Sitecore Serialization Viewer - Ready!');
        log('========================================');
        outputChannel.show(true); // Show the output channel on activation
    }).catch(error => {
        log(`❌ Initial analysis failed: ${error}`);
        console.error('❌ Initial analysis failed:', error);
        log('Extension will continue to work, but initial analysis failed.');
        log('========================================');
    });
    
    } catch (error) {
        log(`❌❌❌ FATAL: Extension activation failed: ${error}`);
        console.error('❌❌❌ FATAL: Extension activation failed:', error);
        console.error('Stack trace:', error);
        vscode.window.showErrorMessage(
            `Sitecore Serialization Viewer failed to activate: ${error}\n\nCheck Output console for details.`
        );
        outputChannel.show(true);
    }
}

export function deactivate() {}
