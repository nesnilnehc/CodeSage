import * as vscode from 'vscode';
import { CommitExplorerProvider } from './ui/components/commitExplorer';
import { FileExplorerProvider } from './ui/components/fileExplorer';
import { GitService } from './services/git/gitService';
import { ReviewManager } from './services/review/reviewManager';
import { ReviewPanel } from './ui/views/reviewPanel';
import { AIService } from './services/ai/aiService';
import { NotificationManager } from './services/notification/notificationManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { OUTPUT, UI } from './i18n';
import { AppConfig } from './config/appConfig';
import { ModelValidator } from './models/modelValidator';

const execAsync = promisify(exec);

export function activate() {
    try {
        // 初始化通知管理器并启动会话，确保输出面板可见
        NotificationManager.getInstance().startSession(true);
        
        const modelType = AppConfig.getInstance().getModelType();
        
        if (!ModelValidator.validateModel(modelType)) {
            throw new Error(ModelValidator.getErrorMessage(modelType));
        }

        console.log(OUTPUT.EXTENSION.ACTIVATE);
        NotificationManager.getInstance().log(OUTPUT.EXTENSION.ACTIVATE, 'info', false);

        // Initialize app configuration
        const config = AppConfig.getInstance();
        
        // Check if API key is configured
        const apiKey = config.getApiKey();
            if (!apiKey) {
                const configureNow = UI.BUTTONS.CONFIGURE_API_KEY;
                const openSettings = UI.BUTTONS.OPEN_SETTINGS;
                vscode.window.showWarningMessage(
                    UI.MESSAGES.API_KEY_MISSING,
                    configureNow,
                    openSettings
                ).then(selection => {
                    if (selection === configureNow) {
                        vscode.window.showInputBox({
                            prompt: UI.PLACEHOLDERS.API_KEY,
                            password: true
                        }).then(async apiKey => {
                            if (apiKey) {
                                const isValid = await AIService.getInstance().validateApiKey(apiKey);
                                if (isValid) {
                                    AIService.getInstance().setApiKey(apiKey);
                                    NotificationManager.getInstance().log(UI.MESSAGES.API_KEY_SUCCESS, 'info', true);
                                } else {
                                    vscode.window.showErrorMessage(UI.MESSAGES.API_KEY_INVALID);
                                }
                            }
                        });
                    } else if (selection === openSettings) {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'codesage.apiKey');
                    }
                });
            }

        // Initialize a single GitService instance that will be shared
        const gitService = new GitService();
        
        // Initialize services with the shared GitService instance
        const reviewManager = new ReviewManager(gitService);
        
        // Register tree data providers - use the same GitService instance
        const commitExplorerProvider = new CommitExplorerProvider(gitService);
        const fileExplorerProvider = new FileExplorerProvider(reviewManager);
        
        vscode.window.registerTreeDataProvider('commitExplorer', commitExplorerProvider);
        vscode.window.registerTreeDataProvider('fileExplorer', fileExplorerProvider);

        // Register commands
        vscode.commands.registerCommand('codesage.configureApiKey', async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: UI.PLACEHOLDERS.API_KEY,
                password: true
            });
            
            if (apiKey) {
                const isValid = await AIService.getInstance().validateApiKey(apiKey);
                if (isValid) {
                    AIService.getInstance().setApiKey(apiKey);
                    NotificationManager.getInstance().log(UI.MESSAGES.API_KEY_SUCCESS, 'info', true);
                } else {
                    vscode.window.showErrorMessage(UI.MESSAGES.API_KEY_INVALID);
                }
            }
        });
        vscode.commands.registerCommand('codesage.startReview', async () => {
            try {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    NotificationManager.getInstance().log(OUTPUT.REPOSITORY.NO_WORKSPACE_FOLDER, 'error', true);
                    return;
                }
                
                const rootPath = workspaceFolders[0]?.uri.fsPath;
                
                // Check if rootPath exists
                if (!rootPath) {
                    NotificationManager.getInstance().log('Root path is undefined', 'error', true);
                    return;
                }
                
                // Check if this is a Git repository
                if (!fs.existsSync(path.join(rootPath, '.git'))) {
                    NotificationManager.getInstance().log(OUTPUT.REPOSITORY.NOT_GIT_REPOSITORY, 'error', true);
                    return;
                }
                
                // Initialize Git service with the repository path
                const gitService = new GitService();
                gitService.setRepository(rootPath);
                
                // Refresh the commit explorer
                commitExplorerProvider.refresh();
                
                NotificationManager.getInstance().log(UI.MESSAGES.REVIEW_STARTED, 'info', true);
                
                // Focus the Code Review view
                vscode.commands.executeCommand('code-review-explorer.focus');
            } catch (error) {
                console.error(`Error starting review: ${error}`);
                NotificationManager.getInstance().log(`Error starting review: ${error}`, 'error', true);
            }
        });
        
        vscode.commands.registerCommand('codesage.reviewCode', async (params: { filePath: string, currentContent: string, previousContent: string }) => {
            try {
                console.log(`Reviewing code for ${params.filePath}`);
                
                const review = await AIService.getInstance().reviewCode({
                    filePath: params.filePath,
                    currentContent: params.currentContent,
                    previousContent: params.previousContent
                });

                return review;
            } catch (error: any) {
                if (error?.message?.includes('API key not configured')) {
                    const configureNow = UI.BUTTONS.CONFIGURE_API_KEY;
                    const response = await vscode.window.showErrorMessage(
                        UI.MESSAGES.API_KEY_MISSING,
                        configureNow
                    );
                    
                    if (response === configureNow) {
                        const apiKey = await vscode.window.showInputBox({
                        prompt: UI.PLACEHOLDERS.API_KEY,
                        password: true
                    });
                    
                    if (apiKey) {
                        const isValid = await AIService.getInstance().validateApiKey(apiKey);
                        
                        if (isValid) {
                            AIService.getInstance().setApiKey(apiKey);
                            NotificationManager.getInstance().log(UI.MESSAGES.API_KEY_SUCCESS, 'info', true);
                            // Retry the review
                            return await vscode.commands.executeCommand('codesage.reviewCode', params);
                        } else {
                            vscode.window.showErrorMessage(UI.MESSAGES.API_KEY_INVALID);
                        }
                    }
                    }
                } else {
                    console.error(`Error reviewing code: ${error}`);
                    NotificationManager.getInstance().log(`Error reviewing code: ${error}`, 'error', true);
                }
                return null;
            }
        });
        
        vscode.commands.registerCommand('codesage.generateReport', async () => {
            try {
                const selectedCommit = reviewManager.getSelectedCommit();
                if (!selectedCommit || !selectedCommit.hash) {
                    vscode.window.showWarningMessage(UI.MESSAGES.SELECT_COMMIT_FIRST);
                    return;
                }

                console.log(`Extension: generating report for commit ${selectedCommit.hash}`);
                
                // Generate report with progress notification
                const report = await reviewManager.generateReport();
                
                // Save report to docs/reviews directory
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders.length > 0) {
                    const rootPath = workspaceFolders[0].uri.fsPath;
                    const reviewsDir = path.join(rootPath, 'docs', 'reviews');
                    
                    // Create directory if it doesn't exist
                    if (!fs.existsSync(path.join(rootPath, 'docs'))) {
                        fs.mkdirSync(path.join(rootPath, 'docs'));
                    }
                    if (!fs.existsSync(reviewsDir)) {
                        fs.mkdirSync(reviewsDir);
                    }
                    
                    // Create filename with timestamp and commit hash
                    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
                    const shortHash = selectedCommit.hash.substring(0, 8);
                    const filename = `review_${timestamp}_${shortHash}.md`;
                    const filePath = path.join(reviewsDir, filename);
                    
                    // Save report to file
                    fs.writeFileSync(filePath, report);
                    console.log(`${OUTPUT.REPORT.REPORT_SAVED_TO(filePath)}`);
                    
                    // Open the saved file
                    const fileUri = vscode.Uri.file(filePath);
                    const doc = await vscode.workspace.openTextDocument(fileUri);
                    await vscode.window.showTextDocument(doc, { preview: false });
                    
                    NotificationManager.getInstance().log(`${UI.MESSAGES.REPORT_GENERATED(selectedCommit.hash)} - ${OUTPUT.REPORT.REPORT_SAVED_TO(filePath)}`, 'info', true);
                } else {
                    // If no workspace is open, just show the report as before
                    const doc = await vscode.workspace.openTextDocument({
                        content: report,
                        language: 'markdown'
                    });
                    await vscode.window.showTextDocument(doc, { preview: false });
                    
                    NotificationManager.getInstance().log(UI.MESSAGES.REPORT_GENERATED(selectedCommit.hash), 'info', true);
                }
            } catch (error) {
                console.error(`Error generating report: ${error}`);
                NotificationManager.getInstance().log(`Error generating report: ${error}`, 'error', true);
            }
        });
        
        vscode.commands.registerCommand('codesage.reviewFile', async (filePath: string) => {
            try {
                const extension = vscode.extensions.getExtension('codesage');
                if (extension) {
                    await ReviewPanel.createOrShow(extension.extensionUri, reviewManager, filePath);
                } else {
                    throw new Error('Extension not found');
                }
            } catch (error) {
                console.error(`Error opening review panel: ${error}`);
                vscode.window.showErrorMessage(`Error opening review panel: ${error}`);
            }
        });
        
        vscode.commands.registerCommand('codesage.filterByDateRange', async () => {
            await filterByDateRange(new GitService(), commitExplorerProvider);
        });
        
        vscode.commands.registerCommand('codesage.filterByCommitId', async () => {
            await filterByCommitId(commitExplorerProvider);
        });
        
        vscode.commands.registerCommand('codesage.selectModel', async () => {
            await selectModel();
        });
        
        vscode.commands.registerCommand('codesage.debugGit', async () => {
            await debugGitFunctionality(new GitService());
        });
        
        vscode.commands.registerCommand('codesage.refreshCommits', async () => {
            try {
                console.log('Refreshing commits...');
                commitExplorerProvider.setLoading(true, UI.MESSAGES.REFRESHING_COMMITS);
                
                // Clear filters and refresh
                const gitService = new GitService();
                gitService.clearFilters();
                
                // Small delay to ensure loading message is shown
                setTimeout(async () => {
                    try {
                        await gitService.getCommits({ maxCount: 100 }); // Force refresh
                        commitExplorerProvider.setLoading(false);
                        commitExplorerProvider.refresh();
                        NotificationManager.getInstance().log(UI.MESSAGES.COMMITS_REFRESHED, 'info', true);
                    } catch (error) {
                        console.error(`Error refreshing commits: ${error}`);
                        commitExplorerProvider.setLoading(false);
                        commitExplorerProvider.setError(`Failed to refresh commits: ${error}`);
                        NotificationManager.getInstance().log(`Error refreshing commits: ${error}`, 'error', true);
                    }
                }, 100);
            } catch (error) {
                console.error(`Error refreshing commits: ${error}`);
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.setError(`Failed to refresh commits: ${error}`);
                NotificationManager.getInstance().log(`Error refreshing commits: ${error}`, 'error', true);
            }
        });
        
        vscode.commands.registerCommand('codesage.refreshFiles', async () => {
            try {
                console.log('Refreshing files...');
                // Refresh file list
                fileExplorerProvider.refresh();
                NotificationManager.getInstance().log(UI.MESSAGES.FILES_REFRESHED, 'info', true);
            } catch (error) {
                console.error(`Error refreshing files: ${error}`);
                NotificationManager.getInstance().log(`Error refreshing files: ${error}`, 'error', true);
            }
        });

        vscode.commands.registerCommand('codesage.selectCommit', async (commitHash: string) => {
            try {
                console.log(`Selecting commit: ${commitHash}`);
                
                // 使用 ReviewManager 的 selectCommit 方法
                // 这个方法会处理所有的逻辑，包括从缓存中获取提交或必要时获取新的提交
                await reviewManager.selectCommit(commitHash);
                
                // Refresh file list
                fileExplorerProvider.refresh();
                
                // 无需额外的日志，因为 reviewManager.selectCommit 已经处理了日志
            } catch (error) {
                console.error(`Error selecting commit: ${error}`);
                NotificationManager.getInstance().log(`Error selecting commit: ${error}`, 'error', true);
            }
        });

        vscode.commands.registerCommand('codesage.viewFile', async (filePath: string) => {
            try {
                console.log(`Viewing file: ${filePath}`);
                const selectedCommit = reviewManager.getSelectedCommit();
                
                if (!selectedCommit) {
                    throw new Error('No commit selected');
                }
                
                // 获取文件当前和之前的内容 - 使用共享的已初始化gitService实例
                const files = await gitService.getCommitFiles(selectedCommit.hash);
                const file = files.find(f => f.path === filePath);
                
                if (!file) {
                    throw new Error(`File not found: ${filePath}`);
                }
                
                // 获取文件差异
                const diff = await gitService.getFileDiff(selectedCommit.hash, filePath);
                
                // 获取文件的blame信息
                const blameInfo = await gitService.getFileBlameInfo(filePath, selectedCommit.hash);
                
                // 格式化状态显示
                const statusMap = {
                    'added': '[A] Added',
                    'modified': '[M] Modified',
                    'deleted': '[D] Deleted',
                    'renamed': '[R] Renamed',
                    'copied': '[C] Copied',
                    'binary': '[B] Binary'
                };
                const statusDisplay = statusMap[file.status] || '❓ Unknown';
                const changeStats = file.status !== 'binary' ? `(+${file.insertions} -${file.deletions})` : '';
                
                // 创建临时文件用于显示差异
                const createTempFile = async (content: string, suffix: string): Promise<vscode.Uri> => {
                    const tempDir = path.join(os.tmpdir(), 'codesage-diff');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    
                    const tempFilePath = path.join(tempDir, `${path.basename(file.path)}${suffix}`);
                    fs.writeFileSync(tempFilePath, content);
                    return vscode.Uri.file(tempFilePath);
                };
                
                try {
                    // 为旧版本和新版本创建临时文件
                    const oldContent = file.previousContent || '';
                    const newContent = file.content || '';
                    
                    // 创建临时文件
                    const oldUri = await createTempFile(oldContent, '.previous');
                    const newUri = await createTempFile(newContent, '.current');
                    
                    // 使用VS Code的diff编辑器显示差异
                    const title = `${file.path} (${statusDisplay} ${changeStats})`;
                    await vscode.commands.executeCommand('vscode.diff', oldUri, newUri, title);
                    
                    // 如果有blame信息，添加状态栏显示功能
                    if (blameInfo.length > 0) {
                        // 等待编辑器打开
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // 创建状态栏项
                        const blameStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
                        blameStatusBarItem.text = '加载中...';
                        blameStatusBarItem.show();
                        
                        // 创建行尾装饰器类型
                        const decorationType = vscode.window.createTextEditorDecorationType({
                            after: {
                                margin: '0 0 0 1em',
                                color: '#888888'
                            },
                            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
                        });
                        
                        // 获取当前活动的编辑器
                        const activeEditor = vscode.window.activeTextEditor;
                        if (activeEditor) {
                            // 初始化装饰器
                            const decorations: vscode.DecorationOptions[] = [];
                            
                            // 当光标位置变化时更新状态栏和装饰器
                            const updateBlameInfo = () => {
                                if (!activeEditor) {
                                    return;
                                }
                                
                                // 清除所有装饰器
                                decorations.length = 0;
                                
                                // 获取当前光标位置
                                const position = activeEditor.selection.active;
                                const lineNumber = position.line + 1;
                                
                                // 在blameInfo中查找对应行的信息
                                const blame = blameInfo.find(b => b.line === lineNumber);
                                
                                if (blame) {
                                    // 更新状态栏
                                    const messagePreview = blame.message.length > 30 ? 
                                        blame.message.substring(0, 30) + '...' : 
                                        blame.message;
                                    
                                    blameStatusBarItem.text = `$(git-commit) ${blame.hash.substring(0, 7)} | ${blame.author} | ${blame.time} | ${messagePreview}`;
                                    blameStatusBarItem.tooltip = `Commit: ${blame.hash}\n作者: ${blame.author}\n时间: ${blame.time}\n消息: ${blame.message}`;
                                    
                                    // 添加行尾装饰器
                                    const line = activeEditor.document.lineAt(position.line);
                                    const range = new vscode.Range(
                                        position.line, line.text.length,
                                        position.line, line.text.length
                                    );
                                    
                                    // 尽可能显示完整的commit message
                                    // 使用更长的长度显示消息，以便能够看清消息内容
                                    const messageDisplay = blame.message;
                                    
                                    // 将时间格式简化为日期，以节省空间
                                    const dateOnly = blame.time.split(' ')[0];
                                    
                                    // 缩短作者名称如果太长
                                    const authorDisplay = blame.author.length > 15 ? 
                                        blame.author.substring(0, 12) + '...' : 
                                        blame.author;
                                    
                                    decorations.push({
                                        range,
                                        renderOptions: {
                                            after: {
                                                contentText: ` // ${authorDisplay} | ${dateOnly} | ${blame.hash.substring(0, 7)} | ${messageDisplay}`,
                                            }
                                        }
                                    });
                                    
                                    // 应用装饰器
                                    activeEditor.setDecorations(decorationType, decorations);
                                } else {
                                    blameStatusBarItem.text = '无法获取当前行的Git Blame信息';
                                    activeEditor.setDecorations(decorationType, []);
                                }
                            };
                            
                            // 初始更新
                            updateBlameInfo();
                            
                            // 监听光标位置变化
                            const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection(e => {
                                if (e.textEditor === activeEditor) {
                                    updateBlameInfo();
                                }
                            });
                            
                            // 当编辑器关闭时清理资源
                            const cleanupDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
                                if (!editor || editor.document.uri.fsPath !== newUri.fsPath) {
                                    blameStatusBarItem.dispose();
                                    decorationType.dispose();
                                    selectionChangeDisposable.dispose();
                                    cleanupDisposable.dispose();
                                }
                            });
                        }
                    }
                } catch (diffError) {
                    console.error(`Error showing diff: ${diffError}`);
                    
                    // 如果VS Code的diff编辑器失败，回退到markdown预览
                    try {
                        const inlineDiff = diff;
                        const changeContent = `# ${file.path}\n\n## File Status\n${statusDisplay} ${changeStats}\n\n## Git Diff\n\`\`\`diff\n${inlineDiff}\`\`\`\n`;
                        
                        const doc = await vscode.workspace.openTextDocument({
                            content: changeContent,
                            language: 'markdown'
                        });
                        await vscode.window.showTextDocument(doc, { preview: false });
                    } catch (markdownError) {
                        vscode.window.showErrorMessage(`Error viewing file: ${markdownError}`);
                    }
                }
            } catch (error) {
                console.error(`Error viewing file: ${error}`);
                NotificationManager.getInstance().log(`Error viewing file: ${error}`, 'error', true);
            }
        })
    } catch (error) {
        const errorDetails = error instanceof Error ? error.stack || error.message : String(error);
        vscode.window.showErrorMessage(`激活扩展失败: ${errorDetails}`);
        return;
    }
}

async function selectModel() {
    const models = [
        { label: 'DeepSeek R1', description: 'DeepSeek R1 AI model for code review' }
    ];
    
    const modelType = await vscode.window.showQuickPick(models, {
        placeHolder: UI.PLACEHOLDERS.SELECT_MODEL,
        title: UI.TITLES.MODEL_SELECTION
    });
    
    if (modelType) {
        NotificationManager.getInstance().log(`Using ${modelType.label} model for code review`, 'info', true);
    }
}

async function filterByDateRange(gitService: GitService, commitExplorerProvider: CommitExplorerProvider) {
    try {
        const startDate = await vscode.window.showInputBox({
            prompt: UI.PLACEHOLDERS.START_DATE,
            placeHolder: UI.PLACEHOLDERS.DATE_FORMAT
        });
        
        if (startDate === undefined) return; // User cancelled
        
        const endDate = await vscode.window.showInputBox({
            prompt: UI.PLACEHOLDERS.END_DATE,
            placeHolder: UI.PLACEHOLDERS.DATE_FORMAT
        });
        
        if (endDate === undefined) return; // User cancelled
        
        commitExplorerProvider.setLoading(true, UI.MESSAGES.FILTERING_COMMITS);
        
        // Apply date filter
        gitService.setDateFilter(startDate, endDate);
        
        // Refresh the view
        setTimeout(async () => {
            try {
                // 更新 UI
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.refresh();
                NotificationManager.getInstance().log(UI.MESSAGES.COMMITS_FILTERED, 'info', true);
            } catch (error) {
                console.error(`Error filtering commits: ${error}`);
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.setError(`Failed to filter commits: ${error}`);
                vscode.window.showErrorMessage(`Error filtering commits: ${error}`);
            }
        }, 100);
    } catch (error) {
        console.error(`Error setting date filter: ${error}`);
        vscode.window.showErrorMessage(`Error setting date filter: ${error}`);
    }
}

async function filterByCommitId(commitExplorerProvider: CommitExplorerProvider) {
    try {
        const commitId = await vscode.window.showInputBox({
            prompt: UI.PLACEHOLDERS.COMMIT_ID,
            placeHolder: UI.PLACEHOLDERS.COMMIT_ID_PREFIX
        });
        
        if (commitId === undefined) return; // User cancelled
        
        commitExplorerProvider.setLoading(true, UI.MESSAGES.FILTERING_COMMITS);
        
        // Refresh the view
        setTimeout(async () => {
            try {
                // 更新 UI
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.refresh();
                NotificationManager.getInstance().log(UI.MESSAGES.COMMITS_FILTERED_BY_ID, 'info', true);
            } catch (error) {
                console.error(`Error filtering commits: ${error}`);
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.setError(`Failed to filter commits: ${error}`);
                vscode.window.showErrorMessage(`Error filtering commits: ${error}`);
            }
        }, 100);
    } catch (error) {
        console.error(`Error setting commit filter: ${error}`);
        vscode.window.showErrorMessage(`Error setting commit filter: ${error}`);
    }
}

async function debugGitFunctionality(gitService: GitService) {
    try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            NotificationManager.getInstance().log(OUTPUT.REPOSITORY.NO_WORKSPACE_FOLDER, 'error', true);
            return;
        }
        
        // Initialize Git service
        gitService.setRepository(rootPath);
        
        // 获取分支信息
        const branches = await gitService.getBranches();
        let currentBranch = "Unknown";
        
        // 尝试从分支列表中找出当前分支（通常带有 * 标记）
        try {
            // 使用 git 命令直接获取当前分支
            const { stdout } = await execAsync('git branch --show-current', { cwd: rootPath });
            currentBranch = stdout.trim();
        } catch (error) {
            console.error(`Error getting current branch: ${error}`);
        }
        
        // Get recent commits
        const commits = await gitService.getCommits({ maxCount: 5 });
        
        // Create debug output
        let debugOutput = `
Git Debug Information:
---------------------
Repository Path: ${rootPath}
Current Branch: ${currentBranch}

Branches:
${branches.join('\n')}

Recent Commits:
${commits.map(commit => `${commit.hash.substring(0, 7)} - ${commit.date} - ${commit.message}`).join('\n')}
`;
        
        // Show debug information
        const outputChannel = vscode.window.createOutputChannel('Git Debug');
        outputChannel.clear();
        outputChannel.appendLine(debugOutput);
        outputChannel.show();
        
    } catch (error) {
        console.error(`Error in Git debugging: ${error}`);
        vscode.window.showErrorMessage(`Error in Git debugging: ${error}`);
    }
}

export function deactivate() {
    console.log(OUTPUT.EXTENSION.DEACTIVATE);
}
