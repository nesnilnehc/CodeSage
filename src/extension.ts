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
import { exec } from 'child_process';
import { promisify } from 'util';
import { OUTPUT, UI } from './i18n';
import { AppConfig } from './config/appConfig';
import { ModelValidator } from './models/modelValidator';
import { isReviewableFile } from './utils/fileUtils';

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
                        vscode.commands.executeCommand('workbench.action.openSettings', 'codekarmic.apiKey');
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
        vscode.commands.registerCommand('codekarmic.configureApiKey', async () => {
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

        vscode.commands.registerCommand('codekarmic.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'codekarmic');
        });
        vscode.commands.registerCommand('codekarmic.startReview', async () => {
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
        
        vscode.commands.registerCommand('codekarmic.reviewCode', async (params: { filePath: string, currentContent: string, previousContent: string }) => {
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
                            return await vscode.commands.executeCommand('codekarmic.reviewCode', params);
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
        
        vscode.commands.registerCommand('codekarmic.generateReport', async () => {
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
        
        vscode.commands.registerCommand('codekarmic.reviewFile', async () => {
            try {
                const extension = vscode.extensions.getExtension('nesnilnehc.codekarmic');
                if (extension) {
                    await ReviewPanel.createOrShow(extension.extensionUri, reviewManager, '');
                } else {
                    throw new Error('Extension not found');
                }
            } catch (error) {
                console.error(`Error opening review panel: ${error}`);
                vscode.window.showErrorMessage(`Error opening review panel: ${error}`);
            }
        });
        
        vscode.commands.registerCommand('codekarmic.reviewWorkspaceFile', async () => {
            try {
                // 获取当前活动的编辑器
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('没有打开的文件');
                    return;
                }

                // 获取文件路径
                const filePath = editor.document.uri.fsPath;
                await reviewWorkspaceFile(filePath, reviewManager);
                
            } catch (error) {
                console.error(`工作区文件审查错误: ${error}`);
                vscode.window.showErrorMessage(`工作区文件审查错误: ${error}`);
            }
        });
        
        vscode.commands.registerCommand('codekarmic.filterByDateRange', async () => {
            await filterByDateRange(new GitService(), commitExplorerProvider);
        });
        
        vscode.commands.registerCommand('codekarmic.filterByCommitId', async () => {
            await filterByCommitId(commitExplorerProvider);
        });
        
        vscode.commands.registerCommand('codekarmic.selectModel', async () => {
            await selectModel();
        });
        
        vscode.commands.registerCommand('codekarmic.debugGit', async () => {
            await debugGitFunctionality(new GitService());
        });
        
        vscode.commands.registerCommand('codekarmic.refreshCommits', async () => {
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
        
        vscode.commands.registerCommand('codekarmic.refreshFiles', async () => {
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

        vscode.commands.registerCommand('codekarmic.togglePane', async () => {
            try {
                const extension = vscode.extensions.getExtension('nesnilnehc.codekarmic');
                if (extension) {
                    // 获取当前活动编辑器
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showWarningMessage('没有打开的文件');
                        return;
                    }

                    // 获取文件路径
                    const filePath = editor.document.uri.fsPath;
                    
                    // 如果面板已经打开则关闭它
                    if (ReviewPanel.currentPanel) {
                        ReviewPanel.currentPanel.dispose();
                    } else {
                        // 否则，打开面板分析当前文件
                        await ReviewPanel.createOrShow(extension.extensionUri, reviewManager, filePath);
                        
                        // 在面板创建后自动请求AI分析
                        if (ReviewPanel.currentPanel) {
                            await (ReviewPanel.currentPanel as ReviewPanel).performAIReview();
                        }
                    }
                } else {
                    throw new Error('找不到扩展');
                }
            } catch (error) {
                console.error(`切换AI面板错误: ${error}`);
                vscode.window.showErrorMessage(`切换AI面板错误: ${error}`);
            }
        });

        vscode.commands.registerCommand('codekarmic.selectCommit', async (commitHash: string) => {
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

        vscode.commands.registerCommand('codekarmic.viewFile', async (filePath: string) => {
            try {
                const extension = vscode.extensions.getExtension('nesnilnehc.codekarmic');
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

        vscode.commands.registerCommand('codekarmic.reviewExplorerItem', async (fileUri: vscode.Uri) => {
            try {
                if (!fileUri) {
                    // 如果没有通过参数传递URI，尝试获取当前选中的文件
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        fileUri = activeEditor.document.uri;
                    } else {
                        throw new Error('没有选择文件');
                    }
                }

                // 获取文件路径
                const filePath = fileUri.fsPath;
                
                // 检查是文件还是文件夹
                const fileStats = await vscode.workspace.fs.stat(fileUri);
                if (fileStats.type === vscode.FileType.Directory) {
                    // 处理文件夹
                    await reviewFolder(fileUri, reviewManager);
                } else {
                    // 处理单个文件
                    await reviewWorkspaceFile(filePath, reviewManager);
                }
            } catch (error) {
                console.error(`资源管理器项目审查错误: ${error}`);
                vscode.window.showErrorMessage(`资源管理器项目审查错误: ${error}`);
            }
        });

        vscode.commands.registerCommand('codekarmic.reviewSelectedItems', async (selectedItems: readonly vscode.Uri[] | vscode.Uri) => {
            try {
                let itemsToProcess: readonly vscode.Uri[] = [];

                // 处理单个 URI 或 URI 数组的情况
                if (selectedItems instanceof vscode.Uri) {
                    itemsToProcess = [selectedItems];
                } else if (Array.isArray(selectedItems)) {
                    itemsToProcess = selectedItems;
                } else {
                    // 尝试从当前选择获取，以防从命令面板调用
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        itemsToProcess = [activeEditor.document.uri];
                    } else {
                        // 检查资源管理器选择
                        const explorerSelection = vscode.window.visibleTextEditors[0]?.selection;
                        // 注意：这种方式获取资源管理器选择可能不准确，VS Code API 对此支持有限
                        // 更可靠的方式是依赖右键菜单上下文传递正确的参数
                        // 这里仅作为一种尝试性后备
                        vscode.window.showWarningMessage('无法确定要审查的项目。请在资源管理器中选择文件或文件夹后重试。');
                        return;
                    }
                }

                // 再次检查处理列表是否为空
                if (!itemsToProcess || itemsToProcess.length === 0) {
                    vscode.window.showWarningMessage('没有有效的项目可供审查。');
                    return;
                }

                // 处理多个选中项
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: '正在处理选中的项目...',
                        cancellable: true
                    },
                    async (progress, token) => {
                        const totalItems = itemsToProcess.length;
                        let processedItems = 0;

                        for (const item of itemsToProcess) {
                            if (token.isCancellationRequested) {
                                break;
                            }

                            // 确保 item 是有效的 Uri 对象
                            if (!(item instanceof vscode.Uri)) {
                                console.warn('Skipping invalid item:', item);
                                continue;
                            }

                            try {
                                const itemStats = await vscode.workspace.fs.stat(item);
                                if (itemStats.type === vscode.FileType.Directory) {
                                    await reviewFolder(item, reviewManager);
                                } else {
                                    await reviewWorkspaceFile(item.fsPath, reviewManager);
                                }
                            } catch (statError) {
                                console.error(`无法获取项目状态 ${item.fsPath}: ${statError}`);
                                // 可以选择通知用户或跳过此项
                                NotificationManager.getInstance().log(`跳过项目 ${path.basename(item.fsPath)}，无法获取状态`, 'warning', false);
                            }

                            processedItems++;
                            progress.report({ 
                                increment: (100 / totalItems),
                                message: `已处理 ${processedItems}/${totalItems} 个项目` 
                            });
                        }
                    }
                );

            } catch (error) {
                console.error(`选中项目审查错误: ${error}`);
                vscode.window.showErrorMessage(`选中项目审查错误: ${error}`);
            }
        });
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

/**
 * 审查工作区中的文件（不依赖于Git）
 */
async function reviewWorkspaceFile(filePath: string, reviewManager: ReviewManager): Promise<void> {
    try {
        // 检查文件类型是否可以进行代码审查
        if (!isReviewableFile(filePath)) {
            vscode.window.showWarningMessage(OUTPUT.REVIEW.FILE_TYPE_NOT_SUPPORTED(filePath));
            return;
        }

        // 显示进度指示器，并设置为可取消
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: '正在分析代码...',
                cancellable: true // 设置为可取消
            },
            async (progress, token) => {
                // 添加取消事件监听
                token.onCancellationRequested(() => {
                    NotificationManager.getInstance().log('文件审查已被用户取消', 'info', true);
                    throw new Error('用户取消了操作');
                });
                
                progress.report({ increment: 0 });
                
                // 读取文件内容
                const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                const content = Buffer.from(fileContent).toString('utf8');
                
                // 检查是否已取消
                if (token.isCancellationRequested) {
                    return;
                }
                
                progress.report({ increment: 30, message: '处理文件内容...' });
                
                // 调用AI服务进行文件审查
                const { AIService } = await import('./services/ai/aiService');
                const aiPromise = AIService.getInstance().reviewCode({
                    filePath: filePath,
                    currentContent: content,
                    previousContent: content, // 对于工作区文件，当前内容和以前内容相同
                    includeDiffAnalysis: false // 明确指定不需要分析差异
                });
                
                // 创建一个可以被取消的Promise
                const timeoutPromise = new Promise((_, reject) => {
                    const interval = setInterval(() => {
                        if (token.isCancellationRequested) {
                            clearInterval(interval);
                            reject(new Error('用户取消了操作'));
                        }
                    }, 100);
                });
                
                // 使用Promise.race来实现可取消的操作
                const result = await Promise.race([
                    aiPromise,
                    timeoutPromise
                ]);
                
                // 检查是否已取消
                if (token.isCancellationRequested) {
                    return;
                }
                
                progress.report({ increment: 30, message: '生成建议...' });
                
                // 打开审查面板显示结果
                const extension = vscode.extensions.getExtension('nesnilnehc.codekarmic');
                if (extension) {
                    await ReviewPanel.createOrShow(extension.extensionUri, reviewManager, filePath, result);
                } else {
                    throw new Error('找不到扩展');
                }
                
                progress.report({ increment: 40, message: '完成审查...' });
                
                NotificationManager.getInstance().log(`完成对 ${path.basename(filePath)} 的审查`, 'info', true);
            }
        );
    } catch (error) {
        // 检查是否是用户取消的错误
        if (error instanceof Error && error.message === '用户取消了操作') {
            console.log('文件审查已被用户取消');
            return; // 不显示错误消息
        }
        
        console.error(`文件审查错误: ${error}`);
        vscode.window.showErrorMessage(`文件审查错误: ${error}`);
    }
}

/**
 * 审查文件夹中的所有文件
 */
async function reviewFolder(folderUri: vscode.Uri, reviewManager: ReviewManager): Promise<void> {
    try {
        // 显示进度指示器
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: '正在扫描文件夹...',
                cancellable: true // 确保可以取消
            },
            async (progress, token) => {
                // 监听取消事件
                token.onCancellationRequested(() => {
                    NotificationManager.getInstance().log('文件夹审查已被用户取消', 'info', true);
                    throw new Error('用户取消了操作');
                });
                
                // 获取所有文件
                const files = await getAllFiles(folderUri.fsPath);
                
                // 检查是否已取消
                if (token.isCancellationRequested) {
                    return;
                }
                
                const reviewableFiles = files.filter(file => isReviewableFile(file));
                
                if (reviewableFiles.length === 0) {
                    vscode.window.showInformationMessage(`文件夹 ${path.basename(folderUri.fsPath)} 中没有可审查的文件`);
                    return;
                }
                
                // 如果文件太多，询问用户是否继续
                if (reviewableFiles.length > 10) {
                    const continue_review = '继续审查';
                    const select_individual = '选择部分文件';
                    const cancel = '取消';
                    
                    const choice = await vscode.window.showWarningMessage(
                        `文件夹包含 ${reviewableFiles.length} 个可审查的文件，审查可能需要较长时间`,
                        continue_review, select_individual, cancel
                    );
                    
                    if (choice === cancel) {
                        return;
                    }
                    
                    // 检查是否已取消
                    if (token.isCancellationRequested) {
                        return;
                    }
                    
                    if (choice === select_individual) {
                        // 让用户选择要审查的文件
                        const fileItems = reviewableFiles.map(file => ({
                            label: path.basename(file),
                            description: path.relative(folderUri.fsPath, file),
                            file: file
                        }));
                        
                        const selectedFiles = await vscode.window.showQuickPick(fileItems, {
                            canPickMany: true,
                            placeHolder: '选择要审查的文件'
                        });
                        
                        if (!selectedFiles || selectedFiles.length === 0) {
                            return;
                        }
                        
                        // 更新要审查的文件列表
                        reviewableFiles.length = 0;
                        selectedFiles.forEach(item => reviewableFiles.push(item.file));
                    }
                }
                
                // 检查是否已取消
                if (token.isCancellationRequested) {
                    return;
                }
                
                // 开始审查文件
                const totalFiles = reviewableFiles.length;
                let processedFiles = 0;
                
                for (const file of reviewableFiles) {
                    if (token.isCancellationRequested) {
                        NotificationManager.getInstance().log(`文件夹审查在处理 ${processedFiles}/${totalFiles} 个文件后被用户取消`, 'info', true);
                        break;
                    }
                    
                    try {
                        await reviewWorkspaceFile(file, reviewManager);
                        processedFiles++;
                        
                        progress.report({
                            increment: 100 / totalFiles,
                            message: `已审查 ${processedFiles}/${totalFiles} 个文件`
                        });
                    } catch (error) {
                        // 如果是用户取消的错误，停止整个文件夹的审查
                        if (error instanceof Error && error.message === '用户取消了操作') {
                            NotificationManager.getInstance().log(`文件夹审查在处理 ${processedFiles}/${totalFiles} 个文件后被用户取消`, 'info', true);
                            break;
                        }
                        
                        console.error(`审查文件 ${file} 时出错: ${error}`);
                        // 继续处理其他文件
                    }
                }
                
                if (processedFiles > 0 && !token.isCancellationRequested) {
                    NotificationManager.getInstance().log(
                        `已完成对 ${path.basename(folderUri.fsPath)} 文件夹中 ${processedFiles} 个文件的审查`,
                        'info',
                        true
                    );
                }
            }
        );
    } catch (error) {
        // 检查是否是用户取消的错误
        if (error instanceof Error && error.message === '用户取消了操作') {
            console.log('文件夹审查已被用户取消');
            return; // 不显示错误消息
        }
        
        console.error(`文件夹审查错误: ${error}`);
        vscode.window.showErrorMessage(`文件夹审查错误: ${error}`);
    }
}

/**
 * 递归获取文件夹中的所有文件
 */
async function getAllFiles(folderPath: string): Promise<string[]> {
    const files: string[] = [];
    
    async function traverseDirectory(dirPath: string) {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
        
        for (const [name, type] of entries) {
            const fullPath = path.join(dirPath, name);
            
            // 忽略 node_modules、.git 等文件夹
            if (type === vscode.FileType.Directory) {
                if (name !== 'node_modules' && name !== '.git' && !name.startsWith('.')) {
                    await traverseDirectory(fullPath);
                }
            } else {
                files.push(fullPath);
            }
        }
    }
    
    await traverseDirectory(folderPath);
    return files;
}
