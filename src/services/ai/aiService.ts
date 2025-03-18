import * as vscode from 'vscode';
import * as path from 'path';
import { OpenAI } from 'openai';
import { GitService } from '../git/gitService';
import { NotificationManager } from '../notification/notificationManager';
import { AIModelService } from '../../models/modelInterface';
import { AIModelFactoryImpl } from '../../models/modelFactory';
import { OUTPUT, PROMPTS } from '../../i18n';
import { AppConfig } from '../../config/appConfig';
import { LargeFileProcessor } from '../../core/compression/largeFileProcessor';

export interface CodeReviewRequest {
    filePath: string;
    currentContent: string;
    previousContent: string;
    useCompression?: boolean;
    language?: string;
    diffContent?: string; // Added for batch processing
    includeDiffAnalysis?: boolean; // 控制是否执行差异分析
}

export interface CodeReviewResult {
    suggestions: string[];
    diffSuggestions?: string[];
    fullFileSuggestions?: string[];
    score?: number;
    diffContent?: string;
}

export interface CodeReviewResponse {
    comments: string[];
    suggestions: string[];
    score: number;
}

export class AIService {
    private static instance: AIService;
    private modelService: AIModelService | undefined;
    private client: OpenAI | undefined;
    private apiKey: string | undefined;
    private modelType: string;
    private gitService: GitService | undefined;
    private diffCache: Map<string, string> = new Map();
    private largeFileProcessor: LargeFileProcessor;

    private constructor() {
        const modelFactory = AIModelFactoryImpl.getInstance();
        const config = AppConfig.getInstance();
        const apiKey = config.getApiKey();
        const modelType = config.getModelType();
        
        // Language configuration
        this.modelType = modelType;

        if (apiKey) {
            this.modelService = modelFactory.createModelService();
        }
        
        // Initialize large file handler
        this.largeFileProcessor = LargeFileProcessor.getInstance();
    }

    public static getInstance(): AIService {
        if (!AIService.instance) {
            AIService.instance = new AIService();
        }
        return AIService.instance;
    }

    public async reviewCode(params: CodeReviewRequest): Promise<CodeReviewResult> {
        try {
            if (!this.modelService) {
                throw new Error(OUTPUT.REVIEW.AI_SERVICE_NOT_INITIALIZED);
            }

            const notificationManager = NotificationManager.getInstance();
            notificationManager.log(`${OUTPUT.REVIEW.REVIEW_START} ${params.filePath}`, 'info', true);

            const diffContent = await this.generateDiffContent(params);
            
            // Log successful diff generation
            console.log(OUTPUT.GIT.GETTING_FILE_DIFF(params.filePath, 'current'));
            notificationManager.log(OUTPUT.GIT.GETTING_FILE_DIFF(params.filePath, 'current'), 'info', false);
            
            // 调试输出：显示差异内容
            if (diffContent) {
                const diffPreview = diffContent.length > 300 
                    ? diffContent.substring(0, 300) 
                    : diffContent;
                console.log('DEBUG:', OUTPUT.GIT.DIFF_CONTENT_PREVIEW(diffPreview, diffContent.length));
            } else {
                console.log('DEBUG:', OUTPUT.GIT.NO_DIFF_CONTENT);
            }
            
            // 默认不进行差异分析，除非明确指定
            const analysisOptions = { includeDiffAnalysis: params.includeDiffAnalysis || false };
            const analysis = await this.performCodeAnalysis(params, diffContent, analysisOptions);
            
            notificationManager.log(`${OUTPUT.REVIEW.REVIEW_COMPLETE} ${params.filePath}`, 'info', true);
            return analysis;

        } catch (error) {
            return this.handleReviewError(error, params.filePath);
        }
    }

    private async generateDiffContent(params: CodeReviewRequest): Promise<string> {
        console.time('PERF: generateDiffContent - Total');
        const notificationManager = NotificationManager.getInstance();
        
        console.time('PERF: generateDiffContent - Create cache key');
        // Generate a cache key based on file path and content
        const cacheKey = `${params.filePath}:${this.largeFileProcessor.calculateFingerprint(params.currentContent)}`;
        console.timeEnd('PERF: generateDiffContent - Create cache key');
        
        console.time('PERF: generateDiffContent - Check cache');
        // Check if we have a cached diff for this file
        if (this.diffCache.has(cacheKey)) {
            console.log('DEBUG: Using cached diff content for', params.filePath);
            const cachedResult = this.diffCache.get(cacheKey) as string;
            console.timeEnd('PERF: generateDiffContent - Check cache');
            console.timeEnd('PERF: generateDiffContent - Total');
            return cachedResult;
        }
        console.timeEnd('PERF: generateDiffContent - Check cache');
        
        try {
            console.time('PERF: generateDiffContent - Workspace check');
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                console.timeEnd('PERF: generateDiffContent - Workspace check');
                throw new Error('No workspace folder open');
            }
            console.timeEnd('PERF: generateDiffContent - Workspace check');

            console.time('PERF: generateDiffContent - GitService init');
            // Initialize gitService if needed (once per instance)
            if (!this.gitService) {
                console.log('DEBUG: Initializing new GitService');
                this.gitService = new GitService();
                await this.gitService.setRepository(workspaceFolders[0]?.uri.fsPath || '');
            }
            console.timeEnd('PERF: generateDiffContent - GitService init');
            
            console.time('PERF: generateDiffContent - VS Code Git API');
            // Use VS Code's Git extension API if available (faster)
            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (gitExtension) {
                console.log('DEBUG: VS Code Git extension found');
                const api = gitExtension.getAPI(1);
                if (api) {
                    console.log('DEBUG: VS Code Git API available');
                    try {
                        const repo = api.repositories[0];
                        if (repo) {
                            console.log('DEBUG: VS Code Git repository found');
                            // Get current file version
                            const uri = vscode.Uri.file(params.filePath);
                            console.time('PERF: generateDiffContent - VS Code diffWithHEAD');
                            console.log('DEBUG: Calling repo.diffWithHEAD for', params.filePath);
                            const diffResult = await repo?.diffWithHEAD?.(uri);
                            console.timeEnd('PERF: generateDiffContent - VS Code diffWithHEAD');
                            
                            // 添加类型检查和错误处理
                            if (diffResult && typeof diffResult === 'string' && diffResult.length > 10) {
                                console.log('DEBUG: Got valid diff result from VS Code Git API, length:', diffResult.length);
                                // Cache the result
                                this.diffCache.set(cacheKey, diffResult);
                                console.timeEnd('PERF: generateDiffContent - VS Code Git API');
                                console.timeEnd('PERF: generateDiffContent - Total');
                                return diffResult;
                            }
                            console.log('DEBUG: Invalid or empty diff result from VS Code Git API');
                        }
                    } catch (vsCodeGitError) {
                        console.log('DEBUG: VS Code Git API error, falling back:', vsCodeGitError);
                        // Continue with our implementation below
                    }
                }
            }
            console.timeEnd('PERF: generateDiffContent - VS Code Git API');
            
            console.log('DEBUG: Falling back to custom Git implementation');
            // Fall back to our implementation if VS Code Git API is not available
            console.time('PERF: generateDiffContent - getCommits');
            console.log('DEBUG: Calling gitService.getCommits');
            const commits = await this.gitService.getCommits({ maxCount: 1 });
            console.timeEnd('PERF: generateDiffContent - getCommits');
            
            const currentCommit = commits && commits.length > 0 && commits[0] && commits[0].hash ? commits[0].hash : 'HEAD';
            console.log('DEBUG: Using commit hash:', currentCommit);
            
            console.time('PERF: generateDiffContent - getFileDiff');
            console.log('DEBUG: Calling gitService.getFileDiff for', params.filePath);
            const diffContent = await this.gitService?.getFileDiff(currentCommit, params.filePath);
            console.timeEnd('PERF: generateDiffContent - getFileDiff');
            
            if (!diffContent || diffContent.trim().length < 10) {
                console.log('DEBUG: Empty or invalid diff content received');
                throw new Error('Empty or invalid diff content');
            }
            
            console.log('DEBUG: Successfully got diff content, length:', diffContent.length);
            // Cache the result
            this.diffCache.set(cacheKey, diffContent);
            console.timeEnd('PERF: generateDiffContent - Total');
            return diffContent;

        } catch (error) {
            console.log('DEBUG: Error in generateDiffContent:', error);
            notificationManager.log(OUTPUT.FILE.FILE_DIFF_ERROR, 'warning', true);
            
            console.time('PERF: generateDiffContent - generateSimpleDiff');
            const simpleDiff = this.generateSimpleDiff(params);
            console.timeEnd('PERF: generateDiffContent - generateSimpleDiff');
            
            // Cache even the simple diff to avoid regenerating it
            this.diffCache.set(cacheKey, simpleDiff);
            console.timeEnd('PERF: generateDiffContent - Total');
            return simpleDiff;
        }
    }

    private generateSimpleDiff(params: CodeReviewRequest): string {
        const diffContent = `--- a/${params.filePath}\n+++ b/${params.filePath}\n`;
        const previousLines = params.previousContent.split('\n');
        const currentLines = params.currentContent.split('\n');

        let result = diffContent;
        for (let i = 0; i < Math.max(previousLines.length, currentLines.length); i++) {
            if (i >= previousLines.length) {
                result += `+${currentLines[i]}\n`;
            } else if (i >= currentLines.length) {
                result += `-${previousLines[i]}\n`;
            } else if (previousLines[i] !== currentLines[i]) {
                result += `-${previousLines[i]}\n+${currentLines[i]}\n`;
            }
        }
        return result;
    }

    private async performCodeAnalysis(params: CodeReviewRequest, diffContent: string, options = { includeDiffAnalysis: false }): Promise<CodeReviewResult> {
        console.time('performCodeAnalysis:total');
        const notificationManager = NotificationManager.getInstance();
        
        if (!this.modelService) {
            console.timeEnd('performCodeAnalysis:total');
            throw new Error(OUTPUT.REVIEW.AI_SERVICE_NOT_INITIALIZED);
        }

        // 记录文件大小
        console.log(`文件大小: ${params.currentContent.length} 字符, Diff大小: ${diffContent.length} 字符`);
        notificationManager.log(`文件大小: ${params.currentContent.length} 字符, Diff大小: ${diffContent.length} 字符`, 'info', false);
        
        // Check if compression is required for large files
        if (params.useCompression || params.currentContent.length > 100000) {
            console.log('文件过大，使用压缩分析方法');
            notificationManager.log('文件过大，使用压缩分析方法', 'info', false);
            console.timeEnd('performCodeAnalysis:total');
            return this.performCompressedCodeAnalysis(params);
        }

        // Handle normal code review
        console.time('createPrompts');
        // Use the separate diff and full file prompts for more precise analysis
        const fullFilePrompt = this.createFullFilePrompt(params.filePath, params.currentContent);
        const diffPrompt = this.createDiffPrompt(params.filePath, diffContent);
        console.timeEnd('createPrompts');
        console.log('提示创建完成，提示长度:', fullFilePrompt.length, diffPrompt.length);
        
        // Get responses for both prompts
        console.time('fullFileApiRequest');
        console.log(OUTPUT.REVIEW.FULL_FILE_ANALYSIS_START);
        notificationManager.log(OUTPUT.REVIEW.FULL_FILE_ANALYSIS_START, 'info', false);
        const fullFileResponse = await this.makeSpecificApiRequest(fullFilePrompt, 
            PROMPTS.CODE_REVIEW_TEMPLATES.SYSTEM_PROMPT);
        console.timeEnd('fullFileApiRequest');
        console.log(OUTPUT.REVIEW.FULL_FILE_ANALYSIS_COMPLETE(fullFileResponse.length));
        
        // 只有当includeDiffAnalysis为true时才执行差异分析
        let diffResponse = '';
        let diffSuggestions: string[] = [];
        
        if (options.includeDiffAnalysis && diffContent && diffContent.trim().length > 10) {
            console.time('diffApiRequest');
            console.log(OUTPUT.REVIEW.DIFF_ANALYSIS_START);
            notificationManager.log(OUTPUT.REVIEW.DIFF_ANALYSIS_START, 'info', false);
            diffResponse = await this.makeSpecificApiRequest(diffPrompt, 
                PROMPTS.CODE_REVIEW_TEMPLATES.DIFF_SYSTEM_PROMPT);
            console.timeEnd('diffApiRequest');
            console.log(OUTPUT.REVIEW.DIFF_ANALYSIS_COMPLETE(diffResponse.length));
            
            // 提取差异分析建议
            diffSuggestions = this.extractSuggestions(diffResponse);
        } else {
            console.log('跳过差异分析，因为includeDiffAnalysis设置为false或没有有效的差异内容');
        }
        
        // Extract suggestions from full file response
        console.time('extractSuggestions');
        console.log('提取建议中...');
        const fullFileSuggestions = this.extractSuggestions(fullFileResponse);
        console.timeEnd('extractSuggestions');
        console.log('建议提取完成，全文件建议数:', fullFileSuggestions.length, '差异建议数:', diffSuggestions.length);
        
        // Create final review combining both analyses
        console.time('createFinalPrompt');
        console.log('创建最终提示中...');
        const finalPrompt = this.createFinalPrompt(diffSuggestions, fullFileSuggestions);
        console.timeEnd('createFinalPrompt');
        console.log('最终提示创建完成，长度:', finalPrompt.length);
        
        console.log(OUTPUT.PROCESS.PROC_AI_ANALYSIS(params.filePath));
        notificationManager.log(OUTPUT.PROCESS.PROC_AI_ANALYSIS(params.filePath), 'info', false);
        
        console.time('finalApiRequest');
        console.log('开始最终分析请求...');
        notificationManager.log('开始最终分析请求...', 'info', false);
        const finalResponse = await this.makeApiRequest(finalPrompt);
        console.timeEnd('finalApiRequest');
        console.log('最终分析完成，响应长度:', finalResponse.length);
        
        console.log(OUTPUT.PROCESS.PROC_COMMENT_ADD);
        notificationManager.log(OUTPUT.PROCESS.PROC_COMMENT_ADD, 'info', false);
        
        console.timeEnd('performCodeAnalysis:total');
        console.log('代码分析完成，总耗时显示在上面');
        notificationManager.log('代码分析完成', 'info', false);
        
        const result = this.parseAnalysisResponse(finalResponse);
        result.diffSuggestions = diffSuggestions;
        result.fullFileSuggestions = fullFileSuggestions;
        
        return result;
    }

    private async performCompressedCodeAnalysis(params: CodeReviewRequest): Promise<CodeReviewResult> {
        // For large files, use the dedicated LargeFileProcessor
        if (!this.modelService) {
            throw new Error(OUTPUT.REVIEW.AI_SERVICE_NOT_INITIALIZED);
        }
        
        const notificationManager = NotificationManager.getInstance();
        notificationManager.log(OUTPUT.REVIEW.LARGE_FILE_COMPRESSION, 'info', true);
        
        // Use the LargeFileProcessor to process the large file
        return await this.largeFileProcessor.processLargeFile(params);
    }

    /**
     * Batch process multiple files for code review by grouping similar analysis types
     * @param requests Array of code review requests for multiple files
     * @returns Map of file paths to their review results
     */
    public async batchReviewCode(requests: CodeReviewRequest[]): Promise<Map<string, CodeReviewResult>> {
        if (!this.modelService) {
            throw new Error(OUTPUT.REVIEW.AI_SERVICE_NOT_INITIALIZED);
        }

        const notificationManager = NotificationManager.getInstance();
        const results = new Map<string, CodeReviewResult>();
        
        // Group files by size category
        const largeFiles: CodeReviewRequest[] = [];
        const normalFiles: CodeReviewRequest[] = [];
        
        // Maximum token size for a single batch request (adjust based on your AI model's limits)
        const MAX_BATCH_TOKENS = 8000;
        // Approximate tokens per character (this is an estimate, adjust as needed)
        const TOKENS_PER_CHAR = 0.25;
        
        // Categorize files by size
        for (const request of requests) {
            if (request.useCompression || request.currentContent.length > 100000) {
                largeFiles.push(request);
            } else {
                normalFiles.push(request);
            }
        }
        
        // Process large files using the LargeFileProcessor
        if (largeFiles.length > 0) {
            notificationManager.log(`${OUTPUT.REVIEW.LARGE_FILE_COMPRESSION} (${largeFiles.length} files)`, 'info', false);
            const largeFileResults = await this.largeFileProcessor.batchProcessLargeFiles(largeFiles);
            
            // Merge the results
            for (const [filePath, result] of largeFileResults) {
                results.set(filePath, result);
            }
        }
        
        // Group normal files into batches for full file analysis
        if (normalFiles.length > 0) {
            const fullFileBatches: CodeReviewRequest[][] = [[]];
            let currentBatchSize = 0;
            let currentBatchIndex = 0;
            
            // Group files for full file analysis
            for (const request of normalFiles) {
                // Calculate estimated tokens for the current file
                const contentLength = request.currentContent ? request.currentContent.length : 0;
                const estimatedTokens = contentLength * TOKENS_PER_CHAR;
                
                // If adding this file would exceed the token limit, create a new batch
                if (currentBatchSize + estimatedTokens > MAX_BATCH_TOKENS) {
                    currentBatchIndex++;
                    // Initialize the new batch array
                    fullFileBatches[currentBatchIndex] = [];
                    currentBatchSize = 0;
                }
                
                // Make sure the batch at current index exists
                if (!fullFileBatches[currentBatchIndex]) {
                    fullFileBatches[currentBatchIndex] = [];
                }
                
                // Now it's safe to push and update the batch size
                if (fullFileBatches[currentBatchIndex]) {
                    fullFileBatches[currentBatchIndex].push(request);
                    // Ensure estimatedTokens is treated as a number
                    currentBatchSize += (estimatedTokens as number);
                }
            }
            
            // Process each batch of full file analyses
            for (let i = 0; i < fullFileBatches.length; i++) {
                const batch = fullFileBatches[i];
                if (!batch || batch.length === 0) continue;
                const batchSize = batch.length;
                    
                // Create a combined prompt for all files in this batch
                let combinedFullFilePrompt = "I need you to review multiple files. For each file, provide a separate analysis:\n\n";
                
                for (const request of batch) {
                    const filePrompt = this.createFullFilePrompt(request.filePath, request.currentContent);
                    combinedFullFilePrompt += `\n--- FILE: ${request.filePath} ---\n${filePrompt}\n\n`;
                }
                
                // Make a single API request for the entire batch
                notificationManager.log(`${OUTPUT.REVIEW.FULL_FILE_ANALYSIS_START} (Batch ${i+1}/${fullFileBatches.length}, ${batchSize} files)`, 'info', false);
                console.time(`fullFileBatchApiRequest-${i}`);
                
                const fullFileResponse = await this.makeSpecificApiRequest(
                    combinedFullFilePrompt, 
                    PROMPTS.CODE_REVIEW_TEMPLATES.SYSTEM_PROMPT
                );
                
                console.timeEnd(`fullFileBatchApiRequest-${i}`);
                notificationManager.log(`${OUTPUT.REVIEW.FULL_FILE_ANALYSIS_COMPLETE(fullFileResponse.length)} (Batch ${i+1}/${fullFileBatches.length})`, 'info', false);
                
                // Split the response by file markers and extract suggestions for each file
                const fileResponses = this.splitBatchResponse(fullFileResponse, batch.map(r => r.filePath));
                
                // Store the results for each file
                for (const [filePath, response] of fileResponses) {
                    const suggestions = this.extractSuggestions(response);
                    
                    // Create a preliminary result (will be merged with diff analysis later)
                    if (!results.has(filePath)) {
                        results.set(filePath, {
                            suggestions: suggestions,
                            fullFileSuggestions: suggestions
                        });
                    } else {
                        const existingResult = results.get(filePath) ?? { suggestions: [], fullFileSuggestions: [] };
                        existingResult.fullFileSuggestions = suggestions;
                        existingResult.suggestions = [...(existingResult.suggestions || []), ...suggestions];
                        results.set(filePath, existingResult);
                    }
                }
            }
            
            // Group files for diff analysis
            const diffBatches: CodeReviewRequest[][] = [[]];
            currentBatchSize = 0;
            currentBatchIndex = 0;
            
            // Group files for diff analysis
            for (const request of normalFiles) {
                // Generate diff content
                const diffContent = await this.generateDiffContent(request);
                // Calculate estimated tokens safely
                const contentLength = diffContent ? diffContent.length : 0;
                const estimatedTokens = contentLength * TOKENS_PER_CHAR;
                
                // Store the diff content with the request for later use
                request.diffContent = diffContent;
                
                // If adding this file would exceed the token limit, create a new batch
                if (currentBatchSize + estimatedTokens > MAX_BATCH_TOKENS) {
                    currentBatchIndex++;
                    // Initialize the new batch array
                    diffBatches[currentBatchIndex] = [];
                    currentBatchSize = 0;
                }
                
                // Make sure the batch at current index exists
                if (!diffBatches[currentBatchIndex]) {
                    diffBatches[currentBatchIndex] = [];
                }
                
                // Now it's safe to push and update the batch size
                if (diffBatches[currentBatchIndex]) {
                    diffBatches[currentBatchIndex].push(request);
                    // Ensure estimatedTokens is treated as a number
                    currentBatchSize += (estimatedTokens as number);
                }
            }
            
            // Process each batch of diff analyses
            for (let i = 0; i < diffBatches.length; i++) {
                const batch = diffBatches[i];
                if (!batch || batch.length === 0) continue;
                const batchSize = batch.length;
                    
                // Create a combined prompt for all diffs in this batch
                let combinedDiffPrompt = "I need you to review multiple file diffs. For each file, provide a separate analysis:\n\n";
                
                for (const request of batch) {
                    if (request.diffContent) {
                        const diffPrompt = this.createDiffPrompt(request.filePath, request.diffContent);
                        combinedDiffPrompt += `\n--- FILE: ${request.filePath} ---\n${diffPrompt}\n\n`;
                    }
                }
                
                // Make a single API request for the entire batch
                notificationManager.log(`${OUTPUT.REVIEW.DIFF_ANALYSIS_START} (Batch ${i+1}/${diffBatches.length}, ${batchSize} files)`, 'info', false);
                console.time(`diffBatchApiRequest-${i}`);
                
                const diffResponse = await this.makeSpecificApiRequest(
                    combinedDiffPrompt, 
                    PROMPTS.CODE_REVIEW_TEMPLATES.DIFF_SYSTEM_PROMPT
                );
                
                console.timeEnd(`diffBatchApiRequest-${i}`);
                notificationManager.log(`${OUTPUT.REVIEW.DIFF_ANALYSIS_COMPLETE(diffResponse.length)} (Batch ${i+1}/${diffBatches.length})`, 'info', false);
                
                // Split the response by file markers and extract suggestions for each file
                const fileResponses = this.splitBatchResponse(diffResponse, batch.map(r => r.filePath));
                
                // Store the results for each file
                for (const [filePath, response] of fileResponses) {
                    const suggestions = this.extractSuggestions(response);
                    
                    // Merge with full file analysis results
                    if (!results.has(filePath)) {
                        results.set(filePath, {
                            suggestions: suggestions,
                            diffSuggestions: suggestions
                        });
                    } else {
                        const existingResult = results.get(filePath) ?? { suggestions: [], diffSuggestions: [] };
                        existingResult.diffSuggestions = suggestions;
                        
                        // Combine suggestions from both analyses
                        const allSuggestions = [
                            ...(existingResult.fullFileSuggestions || []),
                            ...suggestions
                        ];
                        
                        // Remove duplicates
                        existingResult.suggestions = Array.from(new Set(allSuggestions));
                        results.set(filePath, existingResult);
                    }
                }
            }
        }
        
        return results;
    }
    
    /**
     * Split a batch response into individual file responses
     * @param batchResponse The combined response from the AI
     * @param filePaths Array of file paths in the same order as in the request
     * @returns Map of file paths to their individual responses
     */
    private splitBatchResponse(batchResponse: string, filePaths: string[]): Map<string, string> {
        const results = new Map<string, string>();
        
        // Create regex patterns to find file sections in the response
        for (const filePath of filePaths) {
            const fileName = path.basename(filePath);
            
            // Try different patterns to locate file-specific content
            const patterns = [
                new RegExp(`---\\s*FILE:\\s*${this.escapeRegExp(filePath)}\\s*---([\\s\\S]*?)(?=---\\s*FILE:|$)`, 'i'),
                new RegExp(`File:\\s*${this.escapeRegExp(filePath)}([\\s\\S]*?)(?=File:|$)`, 'i'),
                new RegExp(`${this.escapeRegExp(fileName)}([\\s\\S]*?)(?=\\w+\\.\\w+:|$)`, 'i')
            ];
            
            let fileContent = '';
            
            // Try each pattern until we find a match
            for (const pattern of patterns) {
                const match = batchResponse.match(pattern);
                if (match && match[1]) {
                    fileContent = match[1].trim();
                    break;
                }
            }
            
            // If no specific section found, look for any mention of the file
            if (!fileContent) {
                // As a fallback, just search for any paragraph mentioning the file
                const fileNamePattern = new RegExp(`(\\b${this.escapeRegExp(fileName)}\\b[\\s\\S]*?)(?=\\n\\n|$)`, 'gi');
                const matches = batchResponse.match(fileNamePattern);
                if (matches && matches.length > 0) {
                    fileContent = matches.join('\n\n');
                }
            }
            
            // If we still couldn't find anything, assign an empty response
            if (!fileContent) {
                fileContent = `No specific analysis found for ${filePath}`;
            }
            
            results.set(filePath, fileContent);
        }
        
        return results;
    }
    
    /**
     * Helper function to escape special characters in strings for regex
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private createFullFilePrompt(filePath: string, content: string): string {
        const fileType = filePath.split('.').pop() || '';
        return PROMPTS.CODE_REVIEW_TEMPLATES.FULL_FILE_PROMPT(filePath, fileType, content);
    }

    private createDiffPrompt(filePath: string, diffContent: string): string {
        return PROMPTS.CODE_REVIEW_TEMPLATES.DIFF_PROMPT(filePath, diffContent);
    }

    private createFinalPrompt(diffSuggestions: string[], fullFileSuggestions: string[]): string {
        return PROMPTS.CODE_REVIEW_TEMPLATES.FINAL_PROMPT(diffSuggestions, fullFileSuggestions);
    }

    private makeSpecificApiRequest(prompt: string, systemPrompt: string): Promise<string> {
        if (!this.modelService) {
            throw new Error(OUTPUT.REVIEW.AI_SERVICE_NOT_INITIALIZED);
        }
        
        const messages = [
            {
                role: 'system',
                content: systemPrompt
            },
            { role: 'user', content: prompt }
        ];
        
        return this.modelService.createChatCompletion({
            messages,
            temperature: 0.1,
            max_tokens: 8192
        }).then(response => response.content);
    }

    private async makeApiRequest(prompt: string): Promise<any> {
        if (!this.modelService) {
            throw new Error(OUTPUT.REVIEW.AI_SERVICE_NOT_INITIALIZED);
        }

        const messages = [
            {
                role: 'system',
                content: PROMPTS.SYSTEM_ROLE
            },
            { role: 'user', content: prompt }
        ];

        const response = await this.modelService.createChatCompletion({
            messages,
            temperature: 0.1,
            max_tokens: 8192
        });

        return {
            choices: [{
                message: {
                    content: response.content
                }
            }],
            model: response.model
        };
    }

    private parseAnalysisResponse(response: any): CodeReviewResult {
        const aiResponse = response.choices[0].message.content || '';
        const suggestions: string[] = [];
        let score = 0;
        let fullFileSuggestions: string[] = [];
        let diffSuggestions: string[] = [];

        // 记录AI响应内容长度，用于调试
        console.log(`[DEBUG] AI Response content length: ${aiResponse.length}`);
        console.log(`[DEBUG] AI Response first 100 chars: ${aiResponse.substring(0, 100)}...`);

        // Define patterns for full analysis based on language
        const fullAnalysisSection = PROMPTS.ANALYSIS_SECTIONS.FULL;
        const diffAnalysisSection = PROMPTS.ANALYSIS_SECTIONS.DIFF;
        const suggestionsSection = PROMPTS.ANALYSIS_SECTIONS.SUGGESTIONS;
        const scoreSection = PROMPTS.ANALYSIS_SECTIONS.SCORE;
        
        // 记录使用的节点标记，用于调试
        console.log(`[DEBUG] Section markers - Full: "${fullAnalysisSection}", Diff: "${diffAnalysisSection}", Suggestions: "${suggestionsSection}", Score: "${scoreSection}"`);
        
        // Create regex patterns using the language-specific section headers
        const fullAnalysisPattern = new RegExp(`${fullAnalysisSection}(.*?)(?=${diffAnalysisSection})`, 's');
        const fullAnalysisMatch = aiResponse.match(fullAnalysisPattern);
        if (fullAnalysisMatch) {
            fullFileSuggestions = this.extractSuggestions(fullAnalysisMatch[1]);
            console.log(`[DEBUG] Extracted ${fullFileSuggestions.length} full file suggestions`);
        } else {
            console.log(`[DEBUG] Failed to match full analysis section with pattern`);
        }

        // Define patterns for diff analysis based on language
        const diffAnalysisPattern = new RegExp(`${diffAnalysisSection}(.*?)(?=${suggestionsSection})`, 's');
        const diffAnalysisMatch = aiResponse.match(diffAnalysisPattern);
        if (diffAnalysisMatch) {
            diffSuggestions = this.extractSuggestions(diffAnalysisMatch[1]);
            console.log(`[DEBUG] Extracted ${diffSuggestions.length} diff suggestions`);
        } else {
            console.log(`[DEBUG] Failed to match diff analysis section with pattern`);
        }
        
        // Define patterns for suggestions based on language
        const suggestionsPattern = new RegExp(`${suggestionsSection}(.*?)(?=${scoreSection})`, 's');
        const suggestionsMatch = aiResponse.match(suggestionsPattern);
        if (suggestionsMatch) {
            suggestions.push(...this.extractSuggestions(suggestionsMatch[1]));
        }

        // Define patterns for scoring based on language
        const scorePattern = new RegExp(`${scoreSection}(.*)`, 's');
        const scoreMatch = aiResponse.match(scorePattern);
        if (scoreMatch) {
            const scoreNum = parseFloat(scoreMatch[1].trim());
            if (!isNaN(scoreNum)) {
                score = Math.min(Math.max(scoreNum, 0), 10);
            }
        }

        return {
            suggestions,
            diffSuggestions,
            fullFileSuggestions,
            score,
            diffContent: aiResponse
        };
    }

    private extractSuggestions(text: string): string[] {
        return text.trim()
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && line.length > 5)
            .map(line => line.replace(/^[0-9]+\.\s*/, '').replace(/^-\s*/, '').trim())
            .filter(Boolean);
    }

    private handleReviewError(error: any, filePath: string): CodeReviewResult {
        const notificationManager = NotificationManager.getInstance();
        const errorDetails = error instanceof Error ? error.stack || error.message : String(error);
        
        console.error('[CodeSage] Code review error details:', {
            error: errorDetails,
            filePath,
            modelUsed: this.modelType,
            apiKeyConfigured: !!this.apiKey,
            clientInitialized: !!this.client
        });
        
        notificationManager.log(`${OUTPUT.REVIEW.CODE_ANALYSIS_FAILED} ${errorDetails}`, 'error', true);
        
        return {
            suggestions: [`Error: Failed to complete code review. Details: ${errorDetails}`],
            score: 0,
            diffContent: ''
        };
    }

    public async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const modelFactory = AIModelFactoryImpl.getInstance();
            const modelService = modelFactory.createModelService();
            return await modelService.validateApiKey(apiKey);
        } catch (error) {
            const notificationManager = NotificationManager.getInstance();
            const errorDetails = error instanceof Error ? error.message : String(error);
            console.error('API key validation error:', error);
            notificationManager.log(`API key validation failed: ${errorDetails}`, 'error', true);
            return false;
        }
    }

    public setApiKey(apiKey: string): void {
        const config = AppConfig.getInstance();
        config.setApiKey(apiKey);
        
        const modelFactory = AIModelFactoryImpl.getInstance();
        this.modelService = modelFactory.createModelService();
    }

    public getModel(): string {
        return this.modelType;
    }

}