import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitService, CommitInfo, CommitFile } from '../git/gitService';
import { NotificationManager } from '../notification/notificationManager';
import { CodeReviewResult } from '../ai/aiService';
import assert from 'assert';
import { OUTPUT } from '../../i18n';
import { isReviewableFile } from '../../utils/fileUtils';

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

export enum ErrorContext {
    initialize,
    setSelectedCommit,
    selectCommit,
    viewFile,
    reviewFile,
    addComment,
    addAISuggestion,
    setCodeQualityScore,
    generateReport
}

export const ErrorContextLabels = {
    [ErrorContext.initialize]: {
        en: 'Initializing repository',
        zh: ''
    },
    [ErrorContext.setSelectedCommit]: {
        en: 'Setting selected commit',
        zh: ''
    },
    [ErrorContext.selectCommit]: {
        en: 'Selecting commit',
        zh: ''
    },
    [ErrorContext.viewFile]: {
        en: 'Viewing file',
        zh: ''
    },
    [ErrorContext.reviewFile]: {
        en: 'Reviewing file',
        zh: ''
    },
    [ErrorContext.addComment]: {
        en: 'Adding comment',
        zh: ''
    },
    [ErrorContext.addAISuggestion]: {
        en: 'Adding AI suggestion',
        zh: ''
    },
    [ErrorContext.setCodeQualityScore]: {
        en: 'Setting code quality score',
        zh: ''
    },
    [ErrorContext.generateReport]: {
        en: 'Generating report',
        zh: ''
    }
};

export class ReviewManager {
    private static readonly BATCH_SIZE = 5; // Number of files to process per batch
    // 删除未使用的MAX_CONCURRENT_REVIEWS常量
    private gitService: GitService;
    private repoPath: string = '';
    private selectedCommit: CommitInfo | undefined;
    private reviews: Map<string, ReviewData> = new Map();
    // 删除未使用的aiSuggestions和codeQualityScores映射
    private notificationManager: NotificationManager;
    private isGeneratingReport: boolean = false; // 标志，防止并发生成报告操作

    constructor(gitService: GitService) {
        this.gitService = gitService;
        this.notificationManager = NotificationManager.getInstance();
    }

    private generateReviewId(): string {
        const timestamp = new Date().toISOString();
        const random = Math.random().toString(36).substring(7);
        return `review_${timestamp}_${random}`;
    }

    private logError(error: Error, context: ErrorContext): void {
        // 删除未使用的errorDetails变量
        const contextLabel = ErrorContextLabels[context];
        this.notificationManager.log(`${contextLabel}: ${error.message}`, 'error', true);
    }

    private logInfo(message: string, showNotification: boolean = false): void {
        this.notificationManager.log(message, 'info', showNotification);
    }

    public async initialize(repoPath: string): Promise<void> {
        try {
            if (!fs.existsSync(repoPath)) {
                throw new Error(`Repository path does not exist: ${repoPath}`);
            }
            this.repoPath = repoPath;
            this.selectedCommit = undefined;
            this.reviews.clear();
            // 修改日志输出，使用REPO_INIT而不是INITIALIZE_REPO，保持一致性
            this.logInfo(`${OUTPUT.REPOSITORY.REPO_INIT} ${repoPath}`, false);
            
            // 初始化 Git 服务
            await this.gitService.setRepository(repoPath);
        } catch (error) {
            assert(error instanceof Error);
            this.logError(error, ErrorContext.initialize);
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
            // 在设置选定提交时不需要输出日志
            // 只有在生成报告时才需要显示提交信息
        } catch (error) {
            assert(error instanceof Error);
            this.logError(error, ErrorContext.setSelectedCommit);
            throw error;
        }
    }

    public async selectCommit(commitId: string): Promise<void> {
        try {
            if (!commitId) {
                throw new Error('Commit ID is required');
            }
            
            // Check if GitService is already initialized with current repository
            // If not initialized, then initialize only once
            if (!this.gitService.isInitialized()) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    throw new Error('No workspace folder open');
                }
                
                const rootPath = workspaceFolders[0]?.uri.fsPath;
                if (!rootPath) {
                    throw new Error('Root path is undefined');
                }
                
                // Only initialize repository if needed
                await this.initialize(rootPath);
            }
            // 不需要每次都记录使用已有仓库
            
            // First check if the commit is already in cache
            let commit = this.gitService.getCommitInfo(commitId);
            
            // If not in cache, try to fetch it
            if (!commit) {
                this.notificationManager.log(`Commit ${commitId} not in cache, fetching...`, 'info', false);
                try {
                    // Use the already initialized GitService instance
                    const commits = await this.gitService.getCommitById(commitId);
                    if (commits.length > 0) {
                        commit = commits[0];
                        this.notificationManager.log(`Successfully fetched commit ${commitId}`, 'info', false);
                    } else {
                        this.notificationManager.log(`No results returned for commit ${commitId}`, 'warning', false);
                    }
                } catch (fetchError) {
                    this.logError(fetchError instanceof Error ? fetchError : new Error(String(fetchError)), ErrorContext.selectCommit);
                }
            } else {
                this.notificationManager.log(`${OUTPUT.REPOSITORY.USING_CACHED_COMMIT} ${commitId}`, 'info', false);
            }
            
            if (!commit) {
                throw new Error(`Commit with ID ${commitId} not found`);
            }
            
            this.selectedCommit = commit;
            // Keep this log since it's the final success status notification
            this.logInfo(`${OUTPUT.REPOSITORY.REPO_COMMIT_SELECT} ${commit.hash} (${commit.message})`, false);
        } catch (error) {
            assert(error instanceof Error);
            this.logError(error, ErrorContext.selectCommit);
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
            this.logInfo(`${OUTPUT.FILE.OPEN_FILE} ${filePath}`);
        } catch (error) {
            assert(error instanceof Error);
            this.logError(error, ErrorContext.viewFile);
            throw error;
        }
    }

    public async reviewFile(filePath: string): Promise<ReviewData> {
        try {
            if (!this.selectedCommit) {
                throw new Error('No commit selected');
            }
            
            // 检查文件类型是否可以进行代码审查
            if (!isReviewableFile(filePath)) {
                throw new Error(OUTPUT.REVIEW.FILE_TYPE_NOT_SUPPORTED(filePath));
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
                this.logInfo(`${OUTPUT.FILE.NEW_REVIEW} ${filePath}`);
            }
            
            return this.reviews.get(reviewKey)!;
        } catch (error) {
            assert(error instanceof Error);
            this.logError(error, ErrorContext.reviewFile);
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
            this.logInfo(`${OUTPUT.PROCESS.ADD_COMMENT} ${filePath} at line ${lineNumber}`);
        } catch (error) {
            assert(error instanceof Error);
            this.logError(error, ErrorContext.addComment);
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
        } catch (error) {
            assert(error instanceof Error);
            this.logError(error, ErrorContext.addAISuggestion);
            throw error;
        }
    }

    public getGitService(): GitService {
        return this.gitService;
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
            this.logInfo(`${OUTPUT.PROCESS.SET_QUALITY_SCORE} ${filePath}: ${score}`);
        } catch (error) {
            assert(error instanceof Error);
            this.logError(error, ErrorContext.setCodeQualityScore);
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
        
        // Divide files into batches
        for (let i = 0; i < files.length; i += ReviewManager.BATCH_SIZE) {
            batches.push(files.slice(i, i + ReviewManager.BATCH_SIZE));
        }

        // Process each batch
        let processedFiles = 0;
        const totalFiles = files.length;

        for (const batch of batches) {
            // 使用函数调用而不是模板字符串
            const currentBatch = Math.floor(processedFiles / ReviewManager.BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(totalFiles / ReviewManager.BATCH_SIZE);
            notificationManager.log(OUTPUT.PROCESS.PROC_BATCH(currentBatch, totalBatches), 'info', false);
            
            const batchPromises = batch.map(async file => {
                const result = await this.reviewFile(file.path);
                processedFiles++;
                // 使用函数调用而不是模板字符串
                notificationManager.log(OUTPUT.PROCESS.PROC_FILES(processedFiles, totalFiles), 'info', false);
                return { file, result };
            });

            const batchResults = await Promise.all(batchPromises);
            
            // Save results
            batchResults.forEach(({ file, result }) => {
                results.set(file.path, result);
            });
        }

        return results;
    }

    public async generateReport(): Promise<string> {
        const notificationManager = NotificationManager.getInstance();
        // 开始新会话但不清空输出通道，保留之前的日志
        notificationManager.startSession(true, false);
        
        // 防止并发生成报告操作
        if (this.isGeneratingReport) {
            notificationManager.log(OUTPUT.REPOSITORY.REPORT_IN_PROGRESS, 'warning', true);
            return '';
        }
        
        this.isGeneratingReport = true;
        
        try {
            console.time('[CodeSage] Total Report Generation');
            if (!this.selectedCommit || !this.selectedCommit.hash) {
                notificationManager.log(OUTPUT.REPOSITORY.NO_COMMIT, 'error', true);
                throw new Error('No commit selected or commit hash is missing');
            }
            
            const startTime = new Date();
            // 使用带有commitId的日志消息
            const shortCommitId = this.selectedCommit.hash.substring(0, 8);
            notificationManager.log(OUTPUT.REPORT.GENERATE_REPORT_FOR_COMMIT(shortCommitId), 'info', true);
            
            const { AIService } = await import('../ai/aiService');
            const aiService = AIService.getInstance();
            
            console.time('[CodeSage] Get Commit Files');
            
            // 确保Git服务已初始化
            if (!this.repoPath) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    throw new Error('No workspace folder open');
                }
                
                const rootPath = workspaceFolders[0]?.uri.fsPath;
                if (!rootPath) {
                    throw new Error('Root path is undefined');
                }
                
                // 获取当前的selectedCommit
                const currentCommit = this.selectedCommit;
                
                // 初始化仓库
                this.repoPath = rootPath;
                await this.gitService.setRepository(rootPath);
                
                // 恢复选定的commit
                if (currentCommit) {
                    this.selectedCommit = currentCommit;
                }
            } else {
                // 如果已有仓库路径但Git服务未初始化，则直接初始化Git服务 - 静默执行，不记录日志
                await this.gitService.setRepository(this.repoPath);
            }
            
            // 再次确认commit hash存在
            if (!this.selectedCommit || !this.selectedCommit.hash) {
                throw new Error('Commit hash is missing');
            }
            
            // 获取要审查的所有文件
            const files = await this.gitService.getCommitFiles(this.selectedCommit.hash);
            const totalFiles = files.length;
            console.timeEnd('[CodeSage] Get Commit Files');
            
            if (totalFiles === 0) {
                notificationManager.log(OUTPUT.FILE.NO_FILES, 'warning', true);
                return 'No files found in commit';
            }
            
            // Use progress bar to display review progress
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: 'Generating Code Review Report',
                cancellable: true
            }, async (progress, token) => {
                notificationManager.log(`${OUTPUT.FILE.FILES_TO_REVIEW} ${totalFiles}`, 'info', false);
                
                // Process all files in parallel
                console.time('[CodeSage] Step 1: File Review');
                notificationManager.log(`${OUTPUT.REVIEW.REVIEWING_FILES}`, 'info', false);
                const reviewResults = await this.reviewFilesParallel(files);
                console.timeEnd('[CodeSage] Step 1: File Review');
                
                // Process AI review in parallel
                console.time('[CodeSage] Step 2: AI Analysis');
                notificationManager.log(`${OUTPUT.REVIEW.AI_ANALYSIS}`, 'info', false);
                let processedAIFiles = 0;
                const aiAnalysisStartTime = new Date();
                let individualResults: (CodeReviewResult | null)[] = [];
                
                // Prepare batch review requests
                const reviewRequests = files.map(file => ({
                    filePath: file.path,
                    currentContent: file.content,
                    previousContent: file.previousContent
                }));
                
                try {
                    // Use batch processing for AI analysis
                    const batchResults = await aiService.batchReviewCode(reviewRequests);
                    
                    // 将 batchResults 转换为 individualResults 数组
                    individualResults = files.map(file => {
                        const result = batchResults.get(file.path);
                        return result || null;
                    });
                    
                    // Process results
                    for (const [filePath, result] of batchResults.entries()) {
                        if (token.isCancellationRequested) {
                            break;
                        }
                        
                        processedAIFiles++;
                        const percentage = (processedAIFiles / totalFiles) * 100;
                        const currentTime = new Date();
                        const elapsedTime = (currentTime.getTime() - aiAnalysisStartTime.getTime()) / 1000;
                        const estimatedTimeRemaining = (elapsedTime / processedAIFiles) * (totalFiles - processedAIFiles);
                        
                        progress.report({
                            increment: 0,
                            message: OUTPUT.REPORT.AI_ANALYSIS_PROGRESS(processedAIFiles, totalFiles, percentage)
                        });
                        
                        // Use internationalized strings with file name
                        const fileName = path.basename(filePath);
                        notificationManager.log(`[${OUTPUT.COMMON.FILE_PREFIX}${processedAIFiles}: ${fileName}] ${OUTPUT.REPORT.AI_ANALYSIS_PROGRESS(processedAIFiles, totalFiles, percentage)} - ${OUTPUT.PROCESS.ESTIMATED_TIME_REMAINING}: ${estimatedTimeRemaining.toFixed(1)} ${OUTPUT.COMMON.SECONDS}`, 'info', true);
                        
                        // Add AI suggestions to review data
                        const review = this.reviews.get(filePath);
                        if (review && result) {
                            // Add suggestions from the AI analysis
                            if (result.suggestions) {
                                result.suggestions.forEach((suggestion: string) => {
                                    this.addAISuggestion(filePath, suggestion);
                                });
                            }
                            
                            // Set a code quality score if available
                            if (result.score !== undefined) {
                                this.setCodeQualityScore(filePath, result.score);
                            }
                        }
                    }
                } catch (error) {
                    notificationManager.log(`[Error] Batch AI analysis failed: ${error}`, 'error', true);
                    // Fall back to individual processing if batch fails
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
                            const currentTime = new Date();
                            const elapsedTime = (currentTime.getTime() - aiAnalysisStartTime.getTime()) / 1000;
                            const estimatedTimeRemaining = (elapsedTime / processedAIFiles) * (totalFiles - processedAIFiles);
                            
                            progress.report({
                                increment: 0,
                                message: OUTPUT.REPORT.AI_ANALYSIS_PROGRESS(processedAIFiles, totalFiles, percentage)
                            });
                            
                            // Use internationalized strings with file name
                            const fileName = path.basename(file.path);
                            notificationManager.log(`[${OUTPUT.COMMON.FILE_PREFIX}${processedAIFiles}: ${fileName}] ${OUTPUT.REPORT.AI_ANALYSIS_PROGRESS(processedAIFiles, totalFiles, percentage)} - ${OUTPUT.PROCESS.ESTIMATED_TIME_REMAINING}: ${estimatedTimeRemaining.toFixed(1)} ${OUTPUT.COMMON.SECONDS}`, 'info', true);
                            
                            return result;
                        } catch (error) {
                            notificationManager.log(`[Error] AI analysis of file ${file.path} failed: ${error}`, 'error', true);
                            processedAIFiles++;
                            const percentage = (processedAIFiles / totalFiles) * 100;
                            progress.report({
                                increment: 0,
                                message: OUTPUT.REPORT.AI_ANALYSIS_PROGRESS(processedAIFiles, totalFiles, percentage)
                            });
                            return null;
                        }
                    });
                    
                    // Process individual results
                    individualResults = await Promise.all(aiPromises);
                    for (let i = 0; i < files.length; i++) {
                        const currentFile = files[i];
                        const result = individualResults[i];
                        
                        if (result && currentFile) {
                            // Add AI suggestions to review data
                            const review = this.reviews.get(currentFile.path);
                            if (review) {
                                // Add suggestions from the AI analysis
                                result.suggestions.forEach((suggestion: string) => {
                                    this.addAISuggestion(currentFile.path, suggestion);
                                });
                                
                                // Set a code quality score if available
                                if (result.score !== undefined) {
                                    this.setCodeQualityScore(currentFile.path, result.score);
                                }
                            }
                        }
                    }
                }
                console.timeEnd('[CodeSage] Step 2: AI Analysis');
                
                // Generate report
                console.time('[CodeSage] Step 3: Report Generation');
                notificationManager.log(OUTPUT.REPORT.REPORT_GENERATE, 'info', true);
                let reportContent = '';
                let processedFiles = 0;
                
                // 添加报告头部内容和提交信息
                if (this.selectedCommit) {
                    reportContent += `# Code Review Report\n\n`;
                    reportContent += `## Commit Information\n`;
                    reportContent += `- Commit Hash: ${this.selectedCommit.hash}\n`;
                    reportContent += `- Author: ${this.selectedCommit.author}\n`;
                    reportContent += `- Date: ${new Date(this.selectedCommit.date).toLocaleString()}\n`;
                    reportContent += `- Message: ${this.selectedCommit.message}\n\n`;
                    
                    // 添加文件统计信息
                    if (files && files.length > 0) {
                        let totalInsertions = 0;
                        let totalDeletions = 0;
                        let fileTypes = new Set<string>();
                        
                        files.forEach(file => {
                            if (file) {
                                totalInsertions += file.insertions || 0;
                                totalDeletions += file.deletions || 0;
                                
                                const ext = file.path.split('.').pop()?.toLowerCase();
                                if (ext) fileTypes.add(ext);
                            }
                        });
                        
                        reportContent += `## Changes Summary\n`;
                        reportContent += `- Total Files Changed: ${files.length}\n`;
                        reportContent += `- Lines Added: ${totalInsertions}\n`;
                        reportContent += `- Lines Removed: ${totalDeletions}\n`;
                        reportContent += `- File Types: ${Array.from(fileTypes).join(', ')}\n\n`;
                    }
                    
                    reportContent += `## File Analysis\n\n`;
                }
                
                // Batch update suggestions and scores
                const updatePromises: Promise<void>[] = [];
                
                // 添加调试日志，查看 individualResults 的状态
                console.log(`[DEBUG] individualResults length: ${individualResults.length}, files length: ${files.length}`);
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (!file) continue; // 跳过无效文件
                    
                    const review = reviewResults.get(file.path ?? '');
                    const aiResult = individualResults[i];
                    
                    // 添加调试日志
                    console.log(`[DEBUG] File ${i+1}/${files.length}: ${file.path}`, {
                        hasFile: !!file,
                        hasReview: !!review,
                        hasAiResult: !!aiResult,
                        aiResultContent: aiResult ? {
                            hasSuggestions: !!aiResult.suggestions,
                            suggestionCount: aiResult.suggestions?.length || 0,
                            hasDiffSuggestions: !!aiResult.diffSuggestions,
                            diffSuggestionCount: aiResult.diffSuggestions?.length || 0,
                            hasFullFileSuggestions: !!aiResult.fullFileSuggestions,
                            fullFileSuggestionCount: aiResult.fullFileSuggestions?.length || 0,
                            score: aiResult.score
                        } : 'No AI result'
                    });
                    
                    // Update progress
                    processedFiles++;
                    const percentage = (processedFiles / totalFiles) * 100;
                    progress.report({
                        increment: 0,
                        message: OUTPUT.REPORT.REPORT_GENERATION_PROGRESS(processedFiles, totalFiles, percentage)
                    });
                    const fileName = path.basename(file.path);
                    notificationManager.log(`[${OUTPUT.COMMON.FILE_PREFIX}${processedFiles}: ${fileName}] ${OUTPUT.REPORT.REPORT_GENERATION_PROGRESS(processedFiles, totalFiles, percentage)}`, 'info', true);
                    
                    // Collect all update operations - 只在 aiResult 存在时执行
                    if (aiResult) {
                        if (aiResult.suggestions) {
                            updatePromises.push(
                                ...aiResult.suggestions.map((suggestion: string) =>
                                    this.addAISuggestion(file.path, suggestion)
                                )
                            );
                        }
                        
                        if (aiResult.score !== undefined) {
                            updatePromises.push(
                                this.setCodeQualityScore(file.path, aiResult.score)
                            );
                        }
                    }
                    
                    // Generate report content
                    reportContent += `\n## File: ${file.path}\n`;
                    reportContent += `Code Quality Score: ${aiResult?.score || 'N/A'}\n\n`;
                    
                    // 如果没有 AI 结果，添加一个说明
                    if (!aiResult) {
                        reportContent += '### Note:\n';
                        reportContent += '- No AI analysis results available for this file.\n\n';
                    } else {
                        // Display diff analysis suggestions
                        if (aiResult.diffSuggestions && aiResult.diffSuggestions.length > 0) {
                            reportContent += '### Diff Analysis Suggestions:\n';
                            for (const suggestion of aiResult.diffSuggestions) {
                                reportContent += `- ${suggestion}\n`;
                            }
                        }

                        // Display full file analysis suggestions
                        if (aiResult.fullFileSuggestions && aiResult.fullFileSuggestions.length > 0) {
                            reportContent += '\n### Full File Analysis Suggestions:\n';
                            for (const suggestion of aiResult.fullFileSuggestions) {
                                reportContent += `- ${suggestion}\n`;
                            }
                        }

                        // Display overall suggestions
                        if (aiResult.suggestions && aiResult.suggestions.length > 0) {
                            reportContent += '\n### Overall Suggestions:\n';
                            for (const suggestion of aiResult.suggestions) {
                                reportContent += `- ${suggestion}\n`;
                            }
                        }
                    }
                    
                    if (review && review.comments.length > 0) {
                        reportContent += '\n### Comments:\n';
                        for (const comment of review.comments) {
                            reportContent += `- Line ${comment.lineNumber}: ${comment.content} (by ${comment.author})\n`;
                        }
                    }
                    
                    reportContent += '\n---\n';
                }
                
                // Process all update operations in parallel
                notificationManager.log(OUTPUT.REPORT.REVIEW_DATA_SAVED_IN_MEMORY, 'info', true);
                
                // Process all update operations in parallel
                await Promise.all(updatePromises);
                
                console.timeEnd('[CodeSage] Step 3: Report Generation');
                console.timeEnd('[CodeSage] Total Report Generation');
                const endTime = new Date();
                const totalTime = (endTime.getTime() - startTime.getTime()) / 1000;
                notificationManager.log(OUTPUT.REPORT.REPORT_COMPLETED(totalTime), 'info', true);
                
                // 修复报告生成完成后的日志
                if (this.selectedCommit && this.selectedCommit.hash) {
                    const shortCommitId = this.selectedCommit.hash.substring(0, 8);
                    notificationManager.log(OUTPUT.REPORT.REPORT_GENERATED_FOR_COMMIT(shortCommitId), 'info', true);
                }
                return reportContent;
            });

        } catch (error) {
            assert(error instanceof Error);
            const errorMessage = `Error generating code review report: ${error}`;
            notificationManager.log(errorMessage, 'error', true);
            this.logError(error, ErrorContext.generateReport);
            throw error;
        } finally {
            // 重置生成报告标志
            this.isGeneratingReport = false;
            // Delay 5 seconds before hiding status bar
            notificationManager.endSession(5000, false, true);  // Do not clear output, keep output panel visible
        }
    }

    public getNotificationManager(): NotificationManager {
        return this.notificationManager;
    }
}
