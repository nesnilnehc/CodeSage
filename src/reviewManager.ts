import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitService, CommitInfo } from './gitService';
import { NotificationManager } from './notificationManager';

export interface ReviewComment {
    filePath: string;
    lineNumber: number;
    content: string;
    author: string;
    timestamp: string;
}

export interface ReviewData {
    commitId: string;
    filePath: string;
    comments: ReviewComment[];
    aiSuggestions: string[];
    codeQualityScore?: number;
    reviewId: string;
}

export class ReviewManager {
    private gitService: GitService;
    private repoPath: string = '';
    private selectedCommit: CommitInfo | undefined;
    private reviews: Map<string, ReviewData> = new Map();
    private aiSuggestions: Map<string, string> = new Map();
    private codeQualityScores: Map<string, number> = new Map();

    constructor(gitService: GitService) {
        this.gitService = gitService;
    }

    private generateReviewId(): string {
        const timestamp = new Date().toISOString();
        const random = Math.random().toString(36).substring(7);
        return `review_${timestamp}_${random}`;
    }

    private logError(error: Error, context: string): void {
        console.error(`[AI Code Review] ${context}:`, error);
        vscode.window.showErrorMessage(`AI 代码审查错误: ${error.message}`);
    }

    private logInfo(message: string): void {
        console.log(`[AI Code Review] ${message}`);
        vscode.window.showInformationMessage(message);
    }

    public async initialize(repoPath: string): Promise<void> {
        try {
            if (!fs.existsSync(repoPath)) {
                throw new Error(`Repository path does not exist: ${repoPath}`);
            }
            this.repoPath = repoPath;
            this.selectedCommit = undefined;
            this.reviews.clear();
            this.logInfo(`Initialized with repository: ${repoPath}`);
        } catch (error) {
            this.logError(error as Error, 'Failed to initialize review manager');
            throw error;
        }
    }

    public setSelectedCommit(commit: CommitInfo): void {
        try {
            if (!commit) {
                throw new Error('Invalid commit: commit object is null or undefined');
            }
            if (!commit.hash) {
                throw new Error('Invalid commit: commit hash is missing');
            }
            this.selectedCommit = commit;
            this.logInfo(`Selected commit: ${commit.hash} (${commit.message})`);
        } catch (error) {
            this.logError(error as Error, 'Failed to set selected commit');
            throw error;
        }
    }

    public async selectCommit(commitId: string): Promise<void> {
        try {
            if (!commitId) {
                throw new Error('Commit ID is required');
            }
            this.logInfo(`Selecting commit: ${commitId}`);
            
            // First check if the commit is already in cache
            let commit = this.gitService.getCommitInfo(commitId);
            
            // If not in cache, fetch it
            if (!commit) {
                this.logInfo(`Commit ${commitId} not in cache, fetching...`);
                const commits = await this.gitService.getCommitById(commitId);
                if (commits.length > 0) {
                    commit = commits[0];
                }
            }
            
            if (!commit) {
                throw new Error(`Commit with ID ${commitId} not found`);
            }
            
            this.selectedCommit = commit;
            this.logInfo(`Successfully selected commit: ${commit.hash} (${commit.message})`);
        } catch (error) {
            this.logError(error as Error, 'Failed to select commit');
            throw error;
        }
    }

    public getSelectedCommit(): CommitInfo | undefined {
        return this.selectedCommit;
    }

    public async viewFile(filePath: string): Promise<void> {
        try {
            if (!this.selectedCommit) {
                throw new Error('No commit selected');
            }

            const uri = vscode.Uri.file(path.join(this.repoPath, filePath));
            await vscode.commands.executeCommand('vscode.open', uri);
            this.logInfo(`Opened file: ${filePath}`);
        } catch (error) {
            this.logError(error as Error, 'Failed to view file');
            throw error;
        }
    }

    public async reviewFile(filePath: string): Promise<ReviewData> {
        try {
            if (!this.selectedCommit) {
                throw new Error('No commit selected');
            }

            const reviewKey = `${this.selectedCommit.hash}:${filePath}`;
            
            if (!this.reviews.has(reviewKey)) {
                // Create a new review for this file
                this.reviews.set(reviewKey, {
                    commitId: this.selectedCommit.hash,
                    filePath: filePath,
                    comments: [],
                    aiSuggestions: [],
                    reviewId: this.generateReviewId()
                });
                this.logInfo(`Created new review for file: ${filePath}`);
            }
            
            return this.reviews.get(reviewKey)!;
        } catch (error) {
            this.logError(error as Error, 'Failed to review file');
            throw error;
        }
    }

    public async addComment(
        filePath: string, 
        lineNumber: number, 
        content: string
    ): Promise<void> {
        try {
            if (!this.selectedCommit) {
                throw new Error('No commit selected');
            }

            const review = await this.reviewFile(filePath);
            const comment: ReviewComment = {
                filePath,
                lineNumber,
                content,
                author: 'User',
                timestamp: new Date().toISOString()
            };
            review.comments.push(comment);
            this.logInfo(`Added comment to file ${filePath} at line ${lineNumber}`);
        } catch (error) {
            this.logError(error as Error, 'Failed to add comment');
            throw error;
        }
    }

    public async addAISuggestion(
        filePath: string,
        suggestion: string
    ): Promise<void> {
        try {
            if (!this.selectedCommit) {
                throw new Error('No commit selected');
            }

            const review = await this.reviewFile(filePath);
            review.aiSuggestions.push(suggestion);
            this.logInfo(`Added AI suggestion to file ${filePath}`);
            vscode.window.showInformationMessage(`已添加 AI 建议到文件: ${filePath}`);
        } catch (error) {
            this.logError(error as Error, 'Failed to add AI suggestion');
            throw error;
        }
    }

    public async setCodeQualityScore(
        filePath: string,
        score: number
    ): Promise<void> {
        try {
            if (!this.selectedCommit) {
                throw new Error('No commit selected');
            }

            const review = await this.reviewFile(filePath);
            review.codeQualityScore = score;
            this.logInfo(`Set code quality score for file ${filePath}: ${score}`);
            vscode.window.showInformationMessage(`已设置代码质量分数: ${filePath} (${score}/100)`);
        } catch (error) {
            this.logError(error as Error, 'Failed to set code quality score');
            throw error;
        }
    }

    public async generateReport(): Promise<string> {
        // 获取通知管理器实例
        const notificationManager = NotificationManager.getInstance();
        notificationManager.startSession(true);
        
        try {
            // 检查是否选择了提交
            if (!this.selectedCommit) {
                notificationManager.log('未选择提交', 'error', true);
                throw new Error('未选择提交');
            }
            
            notificationManager.log(`开始生成代码审查报告...`, 'info', true);
            notificationManager.log(`选中的提交: ${this.selectedCommit.hash} (${this.selectedCommit.message})`, 'info', false);
            
            let reportContent = '';
            const { AIService } = await import('./aiService');
            const aiService = AIService.getInstance();
            
            // 定义在外部作用域，使其在整个函数中可用
            let totalFiles = 0;
            
            // 使用窗口进度条
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: '正在生成代码审查报告',
                cancellable: true
            }, async (progress) => {
                // 步骤 1：收集提交信息 (5%)
                const step1Message = '步骤 1/4: 收集提交信息';
                progress.report({ increment: 5, message: step1Message });
                notificationManager.updateStatusBar(step1Message);
                notificationManager.log('正在收集提交信息...', 'info', true);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 生成报告基本结构
                reportContent = `# 代码审查报告\n\n`;
                reportContent += `## 提交信息\n`;
                const commit = this.selectedCommit!;
                reportContent += `- 提交哈希: ${commit.hash}\n`;
                reportContent += `- 作者: ${commit.author} <${commit.authorEmail}>\n`;
                reportContent += `- 日期: ${commit.date}\n`;
                reportContent += `- 提交信息: ${commit.message}\n\n`;
                
                notificationManager.log('提交信息收集完成', 'info', true);
                
                // 步骤 2：获取文件变更 (15%)
                const step2Message = '步骤 2/4: 获取文件变更';
                progress.report({ increment: 15, message: step2Message });
                notificationManager.updateStatusBar(step2Message, '正在获取文件变更...');
                
                // 从 git 获取文件
                notificationManager.log('正在从 Git 获取文件变更...', 'info', true);
                const files = await this.gitService.getCommitFiles(this.selectedCommit!.hash);
                totalFiles = files.length;
                
                if (totalFiles === 0) {
                    notificationManager.log('没有找到任何文件变更', 'warning', true);
                    throw new Error('没有找到任何文件变更');
                }
                
                notificationManager.log(`找到 ${totalFiles} 个文件需要审查`, 'info', true);
                notificationManager.updateStatusBar(step2Message, `找到 ${totalFiles} 个文件变更`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 步骤 3：AI 代码审查 (60%)
                reportContent += `## 文件审查\n\n`;
                const incrementPerFile = 60 / totalFiles; // 60% 的进度分配给文件审查
                let fileCount = 0;
                
                for (const file of files) {
                    fileCount++;
                    const fileProgress = `(${fileCount}/${totalFiles})`;
                    const fileMessage = `步骤 3/4: 正在审查文件 ${fileProgress}`;
                    
                    progress.report({
                        increment: incrementPerFile,
                        message: fileMessage
                    });
                    
                    notificationManager.updateStatusBar(fileMessage, `文件: ${file.path}`);
                    notificationManager.log(`开始审查文件 ${fileProgress}: ${file.path}`, 'info', true);
                    reportContent += `### ${file.path}\n\n`;
                    
                    try {
                        // 调用 AI 服务进行代码审查
                        notificationManager.log(`正在分析文件内容...`, 'info', false);
                        const review = await aiService.reviewCode({
                            filePath: file.path,
                            currentContent: file.content || '',
                            previousContent: file.previousContent || ''
                        });
                        
                        // 存储和显示审查结果
                        notificationManager.log(`AI 分析完成，正在处理建议...`, 'info', false);
                        await this.addAISuggestion(file.path, review.suggestions.join('\n'));
                        
                        reportContent += `#### AI 审查建议\n`;
                        for (const suggestion of review.suggestions) {
                            reportContent += `- ${suggestion}\n`;
                        }
                        
                        if (review.score !== undefined) {
                            await this.setCodeQualityScore(file.path, review.score);
                            reportContent += `\n代码质量评分: ${review.score}/100\n`;
                            notificationManager.log(`文件 ${file.path} 的代码质量评分: ${review.score}/100`, 'info', true);
                            notificationManager.updateStatusBar(fileMessage, `文件: ${file.path} (评分: ${review.score}/100)`);
                        }
                        
                        reportContent += '\n---\n\n';
                        notificationManager.log(`文件 ${file.path} 审查完成`, 'info', true);
                    } catch (error) {
                        const errorMessage = `审查文件 ${file.path} 时出错: ${error}`;
                        notificationManager.log(errorMessage, 'error', true);
                        this.logError(error as Error, errorMessage);
                        reportContent += `⚠️ ${errorMessage}\n\n`;
                        notificationManager.updateStatusBar(fileMessage, `错误: ${errorMessage}`);
                    }
                    
                    // 在每个文件之间添加延迟
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // 步骤 4：完成报告 (20%)
                const step4Message = '步骤 4/4: 正在完成报告';
                progress.report({ increment: 20, message: step4Message });
                notificationManager.updateStatusBar(step4Message, '正在生成报告总结...');
                notificationManager.log('正在生成审查报告总结...', 'info', true);
                
                // 添加总结
                reportContent += `## 总结\n\n`;
                reportContent += `- 审查的文件总数: ${totalFiles}\n`;
                reportContent += `- 完成时间: ${new Date().toLocaleString()}\n\n`;
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                notificationManager.log('报告总结生成完成', 'info', true);
            });
            
            // 完成
            notificationManager.complete('AI 代码审查完成');
            notificationManager.showPersistentNotification(`总共审查了 ${totalFiles} 个文件`, 'info');
            notificationManager.showPersistentNotification('报告已生成，可以在编辑器中查看详细内容', 'info');
            
            return reportContent;
        } catch (error) {
            const errorMessage = `生成代码审查报告时出错: ${error}`;
            notificationManager.error(errorMessage);
            this.logError(error as Error, errorMessage);
            throw error;
        } finally {
            // 延迟 5 秒再隐藏状态栏
            notificationManager.endSession(5000);
        }
    }

    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                this.logInfo(`Created directory: ${dirPath}`);
            }
        } catch (error) {
            this.logError(error as Error, 'Failed to create directory');
            throw error;
        }
    }
}
