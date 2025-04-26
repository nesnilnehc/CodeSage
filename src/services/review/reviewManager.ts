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
            // 检查是否是直接文件审查（非Git操作）
            const isDirectFileReview = !this.selectedCommit;
            const commitId = isDirectFileReview ? 'direct-review' : this.selectedCommit?.hash || 'unknown';
            
            // 检查文件类型是否可以进行代码审查
            if (!isReviewableFile(filePath)) {
                throw new Error(OUTPUT.REVIEW.FILE_TYPE_NOT_SUPPORTED(filePath));
            }

            const reviewKey = isDirectFileReview ? 
                `direct:${filePath}` : 
                `${commitId}:${filePath}`;
            
            if (!this.reviews.has(reviewKey)) {
                // Create a new review for this file
                this.reviews.set(reviewKey, {
                    commitId: commitId,
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
            // 允许直接文件审查模式，不依赖于选定的提交
            const isDirectFileReview = !this.selectedCommit;
            
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
            // 允许直接文件审查模式，不依赖于选定的提交
            const isDirectFileReview = !this.selectedCommit;
            
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
            // 允许直接文件审查模式，不依赖于选定的提交
            const isDirectFileReview = !this.selectedCommit;
            
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
            console.time('[CodeKarmic] Total Report Generation');
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
            
            console.time('[CodeKarmic] Get Commit Files');
            
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
            console.timeEnd('[CodeKarmic] Get Commit Files');
            
            if (totalFiles === 0) {
                notificationManager.log(OUTPUT.FILE.NO_FILES, 'warning', true);
                return 'No files found in commit';
            }

            // 创建结果WebView展示
            let reportWebView: vscode.WebviewPanel | undefined;
            try {
                // 创建或显示报告视图
                reportWebView = vscode.window.createWebviewPanel(
                    'codeReview',
                    `代码审核报告: ${shortCommitId}`,
                    vscode.ViewColumn.Two,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true
                    }
                );
                
                // 更新WebView显示进度信息
                reportWebView.webview.html = this.getReportProgressHtml(0, totalFiles);
            } catch (error) {
                console.error('Error creating report view:', error);
                notificationManager.log(`创建报告视图失败: ${error}`, 'error', true);
            }
            
            // Use progress bar to display review progress
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: 'Generating Code Review Report',
                cancellable: true
            }, async (progress, token) => {
                notificationManager.log(`${OUTPUT.FILE.FILES_TO_REVIEW} ${totalFiles}`, 'info', false);
                
                // Process all files in parallel
                console.time('[CodeKarmic] Step 1: File Review');
                notificationManager.log(`${OUTPUT.REVIEW.REVIEWING_FILES}`, 'info', false);
                const reviewResults = await this.reviewFilesParallel(files);
                console.timeEnd('[CodeKarmic] Step 1: File Review');
                
                // Process AI review in parallel
                console.time('[CodeKarmic] Step 2: AI Analysis');
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
                
                // 如果有WebView，更新进度
                if (reportWebView) {
                    reportWebView.webview.html = this.getReportProgressHtml(processedAIFiles, totalFiles);
                }
                
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
                        
                        // 更新WebView进度
                        if (reportWebView) {
                            reportWebView.webview.html = this.getReportProgressHtml(processedAIFiles, totalFiles);
                        }
                        
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
                    
                    // 生成最终报告后更新WebView
                    console.time('[CodeKarmic] Step 3: Report Generation');
                    notificationManager.log(`生成Markdown报告`, 'info', false);
                    
                    // 生成Markdown格式的报告
                    const mdReport = this.generateMarkdownReport(files, individualResults);
                    console.timeEnd('[CodeKarmic] Step 3: Report Generation');
                    
                    // 更新WebView显示最终报告
                    if (reportWebView) {
                        reportWebView.webview.html = this.getReportHtml(mdReport);
                    }
                    
                    return mdReport;
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
                    
                    // 生成最终报告后更新WebView
                    console.time('[CodeKarmic] Step 3: Report Generation');
                    notificationManager.log(`生成Markdown报告`, 'info', false);
                    
                    // 生成Markdown格式的报告
                    const mdReport = this.generateMarkdownReport(files, individualResults);
                    console.timeEnd('[CodeKarmic] Step 3: Report Generation');
                    
                    // 更新WebView显示最终报告
                    if (reportWebView) {
                        reportWebView.webview.html = this.getReportHtml(mdReport);
                    }
                    
                    return mdReport;
                }
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

    /**
     * 获取报告进度HTML
     */
    private getReportProgressHtml(current: number, total: number): string {
        const percentage = Math.round((current / total) * 100);
        
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>代码审核报告生成中</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                }
                .progress-container {
                    margin: 30px 0;
                }
                .progress-bar {
                    height: 20px;
                    background-color: var(--vscode-progressBar-background);
                    border-radius: 10px;
                    width: ${percentage}%;
                    transition: width 0.3s ease;
                }
                .progress-text {
                    margin-top: 10px;
                    text-align: center;
                }
                h1 {
                    color: var(--vscode-editor-foreground);
                }
                .file-status {
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>代码审核报告生成中</h1>
                <div class="progress-container">
                    <div class="progress-bar"></div>
                    <div class="progress-text">进度: ${current}/${total} 文件 (${percentage}%)</div>
                </div>
                <div class="file-status">
                    <p>当前已处理: <strong>${current}</strong> 个文件</p>
                    <p>总文件数: <strong>${total}</strong> 个文件</p>
                    <p>请耐心等待，审核报告正在生成中...</p>
                </div>
            </div>
        </body>
        </html>`;
    }

    /**
     * 获取报告HTML
     */
    private getReportHtml(markdownContent: string): string {
        // 使用marked库转换Markdown到HTML
        // 这里简化处理，实际可能需要更复杂的Markdown解析
        const htmlContent = markdownContent
            .replace(/\n/g, '<br>')
            .replace(/# (.*)/g, '<h1>$1</h1>')
            .replace(/## (.*)/g, '<h2>$1</h2>')
            .replace(/### (.*)/g, '<h3>$1</h3>')
            .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*)\*/g, '<em>$1</em>')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>代码审核报告</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                }
                h1, h2, h3 {
                    color: var(--vscode-editor-foreground);
                }
                pre {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 10px;
                    border-radius: 5px;
                    overflow-x: auto;
                }
                code {
                    font-family: 'Courier New', Courier, monospace;
                }
                .file-section {
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
            </style>
        </head>
        <body>
            <div class="container">
                ${htmlContent}
            </div>
        </body>
        </html>`;
    }

    /**
     * 生成Markdown格式的报告
     */
    public generateMarkdownReport(files: CommitFile[], results: (CodeReviewResult | null)[]): string {
        // 检查参数是否有效
        if (!this.selectedCommit) {
            return '# 错误：没有选择提交';
        }
        
        const { hash, message, author, date } = this.selectedCommit;
        const commitDate = new Date(date).toLocaleString();
        
        let report = `# 代码审核报告

## 提交信息
- 提交 ID: \`${hash.substring(0, 8)}\`
- 提交信息: ${message}
- 作者: ${author}
- 日期: ${commitDate}

## 文件总览
- 审核的文件总数: ${files.length}
- 有建议的文件: ${results.filter(r => r && r.suggestions && r.suggestions.length > 0).length}

`;

        // 添加每个文件的审核结果
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const result = results[i];
            
            if (!result) {
                continue;
            }
            
            const fileName = path.basename(file.path);
            report += `## 文件: ${file.path}

`;

            if (result.score !== undefined) {
                report += `- 代码质量评分: ${result.score}/10

`;
            }
            
            if (result.suggestions && result.suggestions.length > 0) {
                report += `### 建议

`;
                
                for (const suggestion of result.suggestions) {
                    report += `- ${suggestion}\n`;
                }
                
                report += '\n';
            } else {
                report += `文件 \`${fileName}\` 没有建议。

`;
            }
        }
        
        return report;
    }

    public getNotificationManager(): NotificationManager {
        return this.notificationManager;
    }
}
