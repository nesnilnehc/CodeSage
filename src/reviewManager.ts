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

    public async generateReport(): Promise<string> {
        // Get notification manager instance
        const notificationManager = NotificationManager.getInstance();
        notificationManager.startSession(true);
        
        try {
            // Check if a commit is selected
            if (!this.selectedCommit) {
                notificationManager.log('No commit selected', 'error', true);
                throw new Error('No commit selected');
            }
            
            notificationManager.log(`Starting code review report generation...`, 'info', true);
            notificationManager.log(`Selected commit: ${this.selectedCommit.hash} (${this.selectedCommit.message})`, 'info', false);
            
            let reportContent = '';
            const { AIService } = await import('./aiService');
            const aiService = AIService.getInstance();
            
            // Define in outer scope to make it available throughout the function
            let totalFiles = 0;
            
            // Use window progress bar
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: 'Generating code review report',
                cancellable: false
            }, async (progress) => {
                // Step 1: Collect commit information (5%)
                const step1Message = 'Step 1/4: Collecting commit information';
                progress.report({ message: step1Message, increment: 5 });
                notificationManager.log('Collecting commit information...', 'info', true);
                
                const commit = this.selectedCommit!;
                
                // Generate basic report structure
                reportContent = `# Code Review Report\n\n`;
                reportContent += `## Commit Information\n`;
                reportContent += `\n`;
                reportContent += `- Commit Hash: ${commit.hash}\n`;
                reportContent += `- Author: ${commit.author} <${commit.authorEmail}>\n`;
                reportContent += `- Date: ${commit.date}\n`;
                reportContent += `- Commit Message: ${commit.message}\n\n`;
                
                notificationManager.log('Commit information collection completed', 'info', true);
                
                // Step 2: Get file changes (15%)
                const step2Message = 'Step 2/4: Getting file changes';
                progress.report({ message: step2Message, increment: 15 });
                notificationManager.updateStatusBar(step2Message, 'Getting file changes...');
                
                // Get files from git
                notificationManager.log('Getting file changes from Git...', 'info', true);
                const files = await this.gitService.getCommitFiles(this.selectedCommit!.hash);
                totalFiles = files.length;
                
                if (totalFiles === 0) {
                    notificationManager.log('No file changes found', 'warning', true);
                    throw new Error('No file changes found');
                }
                
                notificationManager.log(`Found ${totalFiles} files to review`, 'info', true);
                notificationManager.updateStatusBar(step2Message, `Found ${totalFiles} file changes`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Step 3: AI code review (60%)
                reportContent += `## File Review\n\n`;
                const incrementPerFile = 60 / totalFiles; // 60% progress allocated to file review
                let fileCount = 0;
                
                for (const file of files) {
                    fileCount++;
                    const fileProgress = `(${fileCount}/${totalFiles})`;
                    const fileMessage = `Step 3/4: Reviewing file ${fileProgress}`;
                    
                    progress.report({
                        message: fileMessage,
                        increment: incrementPerFile
                    });
                    
                    notificationManager.updateStatusBar(fileMessage, `File: ${file.path}`);
                    notificationManager.log(`Reviewing file ${fileProgress}: ${file.path}`, 'info', true);
                    reportContent += `### ${file.path}\n\n`;
                    
                    try {
                        // Call AI service for code review
                        notificationManager.log(`Analyzing file content...`, 'info', false);
                        const review = await aiService.reviewCode({
                            filePath: file.path,
                            currentContent: file.content || '',
                            previousContent: file.previousContent || ''
                        });
                        
                        // Store and display review results
                        notificationManager.log(`AI analysis completed, processing suggestions...`, 'info', false);
                        await this.addAISuggestion(file.path, review.suggestions.join('\n'));
                        
                        reportContent += `#### AI Review Suggestions\n`;
                        for (const suggestion of review.suggestions) {
                            reportContent += `- ${suggestion}\n`;
                        }
                        
                        if (review.score !== undefined) {
                            await this.setCodeQualityScore(file.path, review.score);
                            reportContent += `\nCode Quality Score: ${review.score}/100\n`;
                            notificationManager.log(`File ${file.path} code quality score: ${review.score}/100`, 'info', true);
                            notificationManager.updateStatusBar(fileMessage, `File: ${file.path} (Score: ${review.score}/100)`);
                        }
                        
                        reportContent += '\n---\n\n';
                        notificationManager.log(`File ${file.path} review completed`, 'info', true);
                    } catch (error) {
                        const errorMessage = `Error reviewing file ${file.path}: ${error}`;
                        notificationManager.log(errorMessage, 'error', true);
                        this.logError(error as Error, errorMessage);
                        reportContent += `⚠️ ${errorMessage}\n\n`;
                        notificationManager.updateStatusBar(fileMessage, `Error: ${errorMessage}`);
                    }
                    
                    // Add delay between each file
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // Step 4: Complete report (20%)
                const step4Message = 'Step 4/4: Completing report';
                progress.report({ message: step4Message, increment: 20 });
                notificationManager.updateStatusBar(step4Message, 'Completing report summary...');
                notificationManager.log('Completing report summary...', 'info', true);
                
                // Add summary
                reportContent += `## Summary\n\n`;
                reportContent += `- Total files reviewed: ${totalFiles}\n`;
                reportContent += `- Completion time: ${new Date().toLocaleString()}\n\n`;
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                notificationManager.log('Report summary completed', 'info', true);
            });
            
            // Complete
            notificationManager.complete('AI code review completed');
            notificationManager.showPersistentNotification(`Reviewed ${totalFiles} files`, 'info');
            notificationManager.showPersistentNotification('Report generated, view detailed content in editor', 'info');
            
            return reportContent;
        } catch (error) {
            const errorMessage = `Error generating code review report: ${error}`;
            notificationManager.error(errorMessage);
            this.logError(error as Error, errorMessage);
            throw error;
        } finally {
            // Delay 5 seconds before hiding status bar
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
