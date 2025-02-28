import * as vscode from 'vscode';
import { CommitExplorerProvider } from './commitExplorer';
import { FileExplorerProvider } from './fileExplorer';
import { GitService, CommitFilter } from './gitService';
import { ReviewManager } from './reviewManager';
import { ReviewPanel } from './reviewPanel';
import { AIService } from './aiService';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Code Review extension is now active!');

    // 检查 API key 是否已配置
    const aiService = AIService.getInstance();
    const apiKey = vscode.workspace.getConfiguration('codesage').get('deepseekApiKey');
        if (!apiKey) {
            const configureNow = 'Configure API Key';
            const openSettings = 'Open Settings';
            vscode.window.showWarningMessage(
                'DeepSeek API key not configured. Please configure your API key to use code review features.',
                configureNow,
                openSettings
            ).then(selection => {
                if (selection === configureNow) {
                    vscode.window.showInputBox({
                        prompt: 'Enter your DeepSeek API key',
                        password: true
                    }).then(async apiKey => {
                        if (apiKey) {
                            const isValid = await aiService.validateApiKey(apiKey);
                            if (isValid) {
                                aiService.setApiKey(apiKey);
                                vscode.window.showInformationMessage('DeepSeek API key configured successfully!');
                            } else {
                                vscode.window.showErrorMessage('Invalid DeepSeek API key. Please check your key and try again.');
                            }
                        }
                    });
                } else if (selection === openSettings) {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'codesage.deepseekApiKey');
                }
            });
        }

    // Initialize services
    const gitService = new GitService();
    const reviewManager = new ReviewManager(gitService);
    
    // Register tree data providers
    const commitExplorerProvider = new CommitExplorerProvider(gitService);
    const fileExplorerProvider = new FileExplorerProvider(reviewManager);
    
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('commitExplorer', commitExplorerProvider),
        vscode.window.registerTreeDataProvider('fileExplorer', fileExplorerProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('codesage.configureApiKey', async () => {
            const aiService = AIService.getInstance();
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your DeepSeek API key',
                password: true
            });
            
            if (apiKey) {
                const isValid = await aiService.validateApiKey(apiKey);
                if (isValid) {
                    aiService.setApiKey(apiKey);
                    vscode.window.showInformationMessage('DeepSeek API key configured successfully!');
                } else {
                    vscode.window.showErrorMessage('Invalid DeepSeek API key. Please check your key and try again.');
                }
            }
        }),
        vscode.commands.registerCommand('codesage.startReview', async () => {
            try {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }
                
                const rootPath = workspaceFolders[0].uri.fsPath;
                
                // Check if this is a Git repository
                if (!fs.existsSync(path.join(rootPath, '.git'))) {
                    vscode.window.showErrorMessage('The current workspace is not a Git repository');
                    return;
                }
                
                // Initialize Git service with the repository path
                gitService.setRepository(rootPath);
                
                // Refresh the commit explorer
                commitExplorerProvider.refresh();
                
                vscode.window.showInformationMessage('Code review started');
                
                // Focus the Code Review view
                vscode.commands.executeCommand('code-review-explorer.focus');
            } catch (error) {
                console.error(`Error starting review: ${error}`);
                vscode.window.showErrorMessage(`Error starting review: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('codesage.reviewCode', async (params: { filePath: string, currentContent: string, previousContent: string }) => {
            try {
                console.log(`Reviewing code for ${params.filePath}`);
                
                const aiService = AIService.getInstance();
                const review = await aiService.reviewCode({
                    filePath: params.filePath,
                    currentContent: params.currentContent,
                    previousContent: params.previousContent
                });

                return review;
            } catch (error: any) {
                const isWindsurf = !!(vscode.env as any).windsurfAI;
                if (error?.message?.includes('API key not configured')) {
                    if (!isWindsurf) {
                        const configureNow = 'Configure API Key';
                        const response = await vscode.window.showErrorMessage(
                            'DeepSeek API key not configured. Please configure your API key to use code review features.',
                            configureNow
                        );
                        
                        if (response === configureNow) {
                            const apiKey = await vscode.window.showInputBox({
                            prompt: 'Enter your DeepSeek API key',
                            password: true
                        });
                        
                        if (apiKey) {
                            const aiService = AIService.getInstance();
                            const isValid = await aiService.validateApiKey(apiKey);
                            
                            if (isValid) {
                                aiService.setApiKey(apiKey);
                                vscode.window.showInformationMessage('DeepSeek API key configured successfully!');
                                // Retry the review
                                return await vscode.commands.executeCommand('codesage.reviewCode', params);
                            } else {
                                vscode.window.showErrorMessage('Invalid DeepSeek API key. Please check your key and try again.');
                            }
                        }
                        }
                    }
                } else {
                    console.error(`Error reviewing code: ${error}`);
                    vscode.window.showErrorMessage(`Error reviewing code: ${error}`);
                }
                return null;
            }
        }),
        
        vscode.commands.registerCommand('codesage.generateReport', async () => {
            try {
                const selectedCommit = reviewManager.getSelectedCommit();
                if (!selectedCommit) {
                    vscode.window.showWarningMessage('Please select a commit first');
                    return;
                }

                console.log(`Extension: generating report for commit ${selectedCommit.hash}`);
                
                // Generate report with progress notification
                const report = await reviewManager.generateReport();
                
                // Create and show report document
                const doc = await vscode.workspace.openTextDocument({
                    content: report,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, { preview: false });
                
                vscode.window.showInformationMessage(`Report generated for commit: ${selectedCommit.hash.substring(0, 7)}`);
            } catch (error) {
                console.error(`Error generating report: ${error}`);
                vscode.window.showErrorMessage(`Error generating report: ${error}`);
            }
        }),

        vscode.commands.registerCommand('codesage.reviewFile', async (filePath: string) => {
            try {
                await ReviewPanel.createOrShow(context.extensionUri, reviewManager, filePath);
            } catch (error) {
                console.error(`Error opening review panel: ${error}`);
                vscode.window.showErrorMessage(`Error opening review panel: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('codesage.filterByDateRange', async () => {
            await filterByDateRange(gitService, commitExplorerProvider);
        }),
        
        vscode.commands.registerCommand('codesage.filterByCommitId', async () => {
            await filterByCommitId(gitService, commitExplorerProvider);
        }),
        
        vscode.commands.registerCommand('codesage.filterByBranch', async () => {
            await filterByBranch(gitService, commitExplorerProvider);
        }),
        
        vscode.commands.registerCommand('codesage.selectModel', async () => {
            await selectModel(context);
        }),
        
        vscode.commands.registerCommand('codesage.debugGit', async () => {
            await debugGitFunctionality(gitService);
        }),
        
        vscode.commands.registerCommand('codesage.refreshCommits', async () => {
            try {
                console.log('Refreshing commits...');
                commitExplorerProvider.setLoading(true, 'Refreshing commits...');
                
                // Clear filters and refresh
                gitService.clearFilters();
                
                // Small delay to ensure loading message is shown
                setTimeout(async () => {
                    try {
                        await gitService.getCommits({ maxCount: 100 }); // Force refresh
                        commitExplorerProvider.setLoading(false);
                        commitExplorerProvider.refresh();
                        vscode.window.showInformationMessage('Refreshed commit list');
                    } catch (error) {
                        console.error(`Error refreshing commits: ${error}`);
                        commitExplorerProvider.setLoading(false);
                        commitExplorerProvider.setError(`Failed to refresh commits: ${error}`);
                        vscode.window.showErrorMessage(`Error refreshing commits: ${error}`);
                    }
                }, 100);
            } catch (error) {
                console.error(`Error refreshing commits: ${error}`);
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.setError(`Failed to refresh commits: ${error}`);
                vscode.window.showErrorMessage(`Error refreshing commits: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('codesage.refreshFiles', async () => {
            try {
                console.log('Refreshing files...');
                // 刷新文件列表
                fileExplorerProvider.refresh();
                vscode.window.showInformationMessage('Refreshed file list');
            } catch (error) {
                console.error(`Error refreshing files: ${error}`);
                vscode.window.showErrorMessage(`Error refreshing files: ${error}`);
            }
        }),

        vscode.commands.registerCommand('codesage.selectCommit', async (commitHash: string) => {
            try {
                console.log(`Selecting commit: ${commitHash}`);
                // 获取完整的提交信息
                const commits = await gitService.getCommits();
                const selectedCommit = commits.find(commit => commit.hash === commitHash);
                
                if (!selectedCommit) {
                    throw new Error(`Commit not found: ${commitHash}`);
                }
                
                // 更新 ReviewManager 中的选定提交
                reviewManager.setSelectedCommit(selectedCommit);
                
                // 刷新文件列表
                fileExplorerProvider.refresh();
                
                vscode.window.showInformationMessage(`Selected commit: ${selectedCommit.hash.substring(0, 7)} - ${selectedCommit.message}`);
            } catch (error) {
                console.error(`Error selecting commit: ${error}`);
                vscode.window.showErrorMessage(`Error selecting commit: ${error}`);
            }
        })
    );
}

async function selectModel(context: vscode.ExtensionContext) {
    const aiService = AIService.getInstance();
    const currentModel = aiService.getModel();
    
    const models = [
        { label: 'DeepSeek R1', description: 'DeepSeek R1 AI model for code review' }
    ];
    
    const selectedModel = await vscode.window.showQuickPick(models, {
        placeHolder: 'Select AI model for code review',
        title: 'AI Model Selection'
    });
    
    if (selectedModel) {
        if (!!(vscode.env as any).windsurfAI) {
            vscode.window.showInformationMessage(`Using ${selectedModel.label} model for code review`);
        } else {
            vscode.window.showWarningMessage('This extension requires Windsurf editor to function.');
        }
    }
}

async function filterByDateRange(gitService: GitService, commitExplorerProvider: CommitExplorerProvider) {
    try {
        const startDate = await vscode.window.showInputBox({
            prompt: 'Enter start date (YYYY-MM-DD)',
            placeHolder: 'e.g. 2023-01-01'
        });
        
        if (startDate === undefined) return; // User cancelled
        
        const endDate = await vscode.window.showInputBox({
            prompt: 'Enter end date (YYYY-MM-DD)',
            placeHolder: 'e.g. 2023-12-31'
        });
        
        if (endDate === undefined) return; // User cancelled
        
        commitExplorerProvider.setLoading(true, 'Filtering commits...');
        
        // Apply date filter
        gitService.setDateFilter(startDate, endDate);
        
        // Refresh the view
        setTimeout(async () => {
            try {
                await gitService.getCommits({ maxCount: 100 }); // Force refresh with filter
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.refresh();
                vscode.window.showInformationMessage(`Filtered commits from ${startDate} to ${endDate}`);
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

async function filterByCommitId(gitService: GitService, commitExplorerProvider: CommitExplorerProvider) {
    try {
        const commitId = await vscode.window.showInputBox({
            prompt: 'Enter commit ID or hash prefix',
            placeHolder: 'e.g. a1b2c3d'
        });
        
        if (commitId === undefined) return; // User cancelled
        
        commitExplorerProvider.setLoading(true, 'Filtering commits...');
        
        // 修改为使用现有的筛选方法
        // 创建一个自定义筛选器，后续可以在 GitService 中实现
        const customFilter: CommitFilter = { maxCount: 100 };
        gitService.clearFilters(); // 先清除现有筛选器
        
        // Refresh the view
        setTimeout(async () => {
            try {
                // 获取所有提交，然后在客户端筛选
                const allCommits = await gitService.getCommits({ maxCount: 100 });
                const filteredCommits = allCommits.filter(commit => commit.hash.startsWith(commitId));
                
                // 更新 UI
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.refresh();
                vscode.window.showInformationMessage(`Filtered commits by ID: ${commitId}`);
            } catch (error) {
                console.error(`Error filtering commits: ${error}`);
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.setError(`Failed to filter commits: ${error}`);
                vscode.window.showErrorMessage(`Error filtering commits: ${error}`);
            }
        }, 100);
    } catch (error) {
        console.error(`Error setting commit ID filter: ${error}`);
        vscode.window.showErrorMessage(`Error setting commit ID filter: ${error}`);
    }
}

async function filterByBranch(gitService: GitService, commitExplorerProvider: CommitExplorerProvider) {
    try {
        // Get list of branches
        const branches = await gitService.getBranches();
        
        if (!branches || branches.length === 0) {
            vscode.window.showErrorMessage('No branches found');
            return;
        }
        
        // Create QuickPick items
        const branchItems = branches.map(branch => ({
            label: branch,
            description: '' // 移除对 getCurrentBranch 的引用
        }));
        
        // Show QuickPick
        const selectedBranch = await vscode.window.showQuickPick(branchItems, {
            placeHolder: 'Select a branch to filter commits'
        });
        
        if (!selectedBranch) return; // User cancelled
        
        commitExplorerProvider.setLoading(true, 'Filtering commits...');
        
        // Apply branch filter
        gitService.setBranchFilter(selectedBranch.label);
        
        // Refresh the view
        setTimeout(async () => {
            try {
                await gitService.getCommits({ maxCount: 100 }); // Force refresh with filter
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.refresh();
                vscode.window.showInformationMessage(`Filtered commits by branch: ${selectedBranch.label}`);
            } catch (error) {
                console.error(`Error filtering commits: ${error}`);
                commitExplorerProvider.setLoading(false);
                commitExplorerProvider.setError(`Failed to filter commits: ${error}`);
                vscode.window.showErrorMessage(`Error filtering commits: ${error}`);
            }
        }, 100);
    } catch (error) {
        console.error(`Error setting branch filter: ${error}`);
        vscode.window.showErrorMessage(`Error setting branch filter: ${error}`);
    }
}

async function debugGitFunctionality(gitService: GitService) {
    try {
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!rootPath) {
            vscode.window.showErrorMessage('No workspace folder open');
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
    console.log('AI Code Review extension is now deactivated!');
}
