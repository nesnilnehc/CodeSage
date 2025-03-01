import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitService, CommitInfo, CommitFile } from './gitService';
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
    private static readonly BATCH_SIZE = 5; // 每批处理的文件数量
    private static readonly MAX_CONCURRENT_REVIEWS = 10; // 最大并发审查数
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
        console.error(`[CodeSage] ${context}:`, error);
        vscode.window.showErrorMessage(`CodeSage Error: ${error.message}`);
    }

    private logInfo(message: string): void {
        console.log(`[CodeSage] ${message}`);
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
            vscode.window.showInformationMessage(`Added AI suggestion to file: ${filePath}`);
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
            vscode.window.showInformationMessage(`Set code quality score for file: ${filePath} (${score}/100)`);
        } catch (error) {
            this.logError(error as Error, 'Failed to set code quality score');
            throw error;
        }
    }

    private async reviewFilesParallel(files: CommitFile[]): Promise<Map<string, ReviewData>> {
        if (!this.selectedCommit) {
            throw new Error('No commit selected');
        }

        const results = new Map<string, ReviewData>();
        const batches = [];
        const notificationManager = NotificationManager.getInstance();
        
        // 将文件分成多个批次
        for (let i = 0; i < files.length; i += ReviewManager.BATCH_SIZE) {
            batches.push(files.slice(i, i + ReviewManager.BATCH_SIZE));
        }

        // 处理每个批次
        let processedFiles = 0;
        const totalFiles = files.length;

        for (const batch of batches) {
            notificationManager.log(`Processing batch ${processedFiles / ReviewManager.BATCH_SIZE + 1} of ${Math.ceil(totalFiles / ReviewManager.BATCH_SIZE)}`, 'info', true);
            
            const batchPromises = batch.map(async file => {
                const result = await this.reviewFile(file.path);
                processedFiles++;
                const progress = Math.round((processedFiles / totalFiles) * 100);
                notificationManager.log(`Processed ${processedFiles}/${totalFiles} files (${progress}%)`, 'info', true);
                return { file, result };
            });

            const batchResults = await Promise.all(batchPromises);
            
            // 保存结果
            batchResults.forEach(({ file, result }) => {
                results.set(file.path, result);
            });
        }

        return results;
    }

    public async generateReport(): Promise<string> {
        const notificationManager = NotificationManager.getInstance();
        notificationManager.startSession(true);
        
        try {
            if (!this.selectedCommit) {
                notificationManager.log('No commit selected', 'error', true);
                throw new Error('No commit selected');
            }
            
            notificationManager.log(`Starting code review report generation...`, 'info', true);
            notificationManager.log(`Selected commit: ${this.selectedCommit.hash} (${this.selectedCommit.message})`, 'info', false);
            
            const { AIService } = await import('./aiService');
            const aiService = AIService.getInstance();
            
            // 获取所有需要审查的文件
            const files = await this.gitService.getCommitFiles(this.selectedCommit.hash);
            const totalFiles = files.length;
            
            if (totalFiles === 0) {
                notificationManager.log('No files found in commit', 'warning', true);
                return 'No files found in commit';
            }
            
            // 使用进度条显示审查进度
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: 'Generating Code Review Report',
                cancellable: true
            }, async (progress, token) => {
                notificationManager.log(`Found ${totalFiles} files to review`, 'info', true);
                
                // 并行处理所有文件的审查
                notificationManager.log('Step 1/3: Reviewing files...', 'info', true);
                const reviewResults = await this.reviewFilesParallel(files);
                
                // 并行处理 AI 审查
                notificationManager.log('Step 2/3: Running AI analysis...', 'info', true);
                let processedAIFiles = 0;
                const aiPromises = files.map(async file => {
                    if (token.isCancellationRequested) {
                        return null;
                    }
                    
                    try {
                        const result = await aiService.reviewCode({
                            filePath: file.path,
                            currentContent: file.content,
                            previousContent: file.previousContent
                        });
                        
                        processedAIFiles++;
                        const percentage = (processedAIFiles / totalFiles) * 100;
                        progress.report({
                            increment: 0,
                            message: `AI analysis: ${processedAIFiles}/${totalFiles} files (${percentage.toFixed(1)}%)`
                        });
                        notificationManager.log(`AI analysis: ${processedAIFiles}/${totalFiles} files (${percentage.toFixed(1)}%)`, 'info', true);
                        
                        return result;
                    } catch (error) {
                        notificationManager.log(`Error getting AI review for ${file.path}: ${error}`, 'error', true);
                        return null;
                    }
                });
                
                const aiResults = await Promise.all(aiPromises);
                
                // 生成报告
                notificationManager.log('Step 3/3: Generating final report...', 'info', true);
                let reportContent = '';
                let processedFiles = 0;
                
                // 批量更新建议和分数
                const updatePromises: Promise<void>[] = [];
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const review = reviewResults.get(file.path);
                    const aiResult = aiResults[i];
                    
                    if (!review || !aiResult) continue;
                    
                    // 更新进度
                    processedFiles++;
                    const percentage = (processedFiles / totalFiles) * 100;
                    progress.report({
                        increment: 0,
                        message: `Generating report: ${processedFiles}/${totalFiles} files (${percentage.toFixed(1)}%)`
                    });
                    notificationManager.log(`Generating report: ${processedFiles}/${totalFiles} files (${percentage.toFixed(1)}%)`, 'info', true);
                    
                    // 收集所有更新操作
                    if (aiResult.suggestions) {
                        updatePromises.push(
                            ...aiResult.suggestions.map(suggestion =>
                                this.addAISuggestion(file.path, suggestion)
                            )
                        );
                    }
                    
                    if (aiResult.score !== undefined) {
                        updatePromises.push(
                            this.setCodeQualityScore(file.path, aiResult.score)
                        );
                    }
                    
                    // 生成报告内容
                    reportContent += `\n## File: ${file.path}\n`;
                    reportContent += `Code Quality Score: ${aiResult.score || 'N/A'}\n\n`;
                    
                    if (aiResult.suggestions && aiResult.suggestions.length > 0) {
                        reportContent += '### AI Suggestions:\n';
                        for (const suggestion of aiResult.suggestions) {
                            reportContent += `- ${suggestion}\n`;
                        }
                    }
                    
                    if (review.comments.length > 0) {
                        reportContent += '\n### Comments:\n';
                        for (const comment of review.comments) {
                            reportContent += `- Line ${comment.lineNumber}: ${comment.content} (by ${comment.author})\n`;
                        }
                    }
                    
                    reportContent += '\n---\n';
                }
                
                // 并行执行所有更新操作
                notificationManager.log('Saving review data...', 'info', true);
                await Promise.all(updatePromises);
                
                notificationManager.log('Report generation completed', 'info', true);
                return reportContent;
            });

        } catch (error) {
            const errorMessage = `Error generating code review report: ${error}`;
            notificationManager.log(errorMessage, 'error', true);
            this.logError(error as Error, errorMessage);
            throw error;
        } finally {
            // Delay 5 seconds before hiding status bar
            notificationManager.endSession(5000, false, true);  // 不清空输出，保持输出面板可见
        }
    }
}
