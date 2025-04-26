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
import { ModelRequestOptions } from '../../models/types';
import { getFileLanguage } from '../../utils/fileUtils';
import { CodeAnalysisOptions } from '../../core/review/reviewTypes';

export interface CodeReviewRequest {
    filePath: string;
    currentContent: string;
    previousContent: string;
    useCompression?: boolean;
    language?: string;
    diffContent?: string; // Added for batch processing
    includeDiffAnalysis?: boolean; // 控制是否执行差异分析
    useStreamingOutput?: boolean;
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

            // 检查是否为直接文件审查（非Git变更）- 显式设置为false表示直接文件审查
            const isDirectFileReview = params.includeDiffAnalysis === false;
            
            let diffContent = '';
            // 默认不进行diff分析，除非明确要求
            let includeDiffAnalysis = false;
            
            if (!isDirectFileReview) {
                // 只有在需要分析Git差异时才获取差异内容
                diffContent = await this.generateDiffContent(params);
                includeDiffAnalysis = true;
                
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
            }
            
            // 分析代码 - 明确设置includeDiffAnalysis而不使用params中的值
            const analysisOptions: CodeAnalysisOptions = { 
                useCompression: !!params.useCompression,
                includeDiffAnalysis: includeDiffAnalysis 
            };
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

    private async performCodeAnalysis(
        params: CodeReviewRequest, 
        diffContent: string, 
        options: CodeAnalysisOptions
    ): Promise<CodeReviewResult> {
        const filePath = params.filePath;
        const language = getFileLanguage(filePath);
        const notificationManager = NotificationManager.getInstance();
        
        // 添加流式输出支持
        const modelRequestOptions: ModelRequestOptions = {
            maxTokens: options.maxTokens || 4000,
            temperature: 0.1,
            stream: true,  // 启用流式输出
            timeoutMs: 180000, // 3分钟超时
        };
        
        // 确定是否使用压缩
        if (params.useCompression) {
            return await this.performCompressedCodeAnalysis(params);
        }
        
        console.time('performCodeAnalysis:total');
        const startTime = new Date();
        
        console.log(`[${startTime.toISOString()}] 开始代码分析流程，文件: ${path.basename(filePath)}`);
        
        if (!this.modelService) {
            console.timeEnd('performCodeAnalysis:total');
            throw new Error(OUTPUT.REVIEW.AI_SERVICE_NOT_INITIALIZED);
        }

        // 记录文件大小并展示更详细的进度信息
        const fileSize = params.currentContent.length;
        const diffSize = options.includeDiffAnalysis ? diffContent.length : 0;
        
        if (options.includeDiffAnalysis) {
            console.log(`[${new Date().toISOString()}] 文件大小: ${fileSize} 字符, Diff大小: ${diffSize} 字符`);
            notificationManager.log(`文件大小: ${fileSize} 字符, Diff大小: ${diffSize} 字符`, 'info', false);
        } else {
            console.log(`[${new Date().toISOString()}] 文件大小: ${fileSize} 字符`);
            notificationManager.log(`文件大小: ${fileSize} 字符`, 'info', false);
        }
        
        // 显示分析进度
        notificationManager.log(`(1/5) 准备分析文件...`, 'info', false);
        
        // 优化点1: 将多个API调用合并为一个
        // 创建统一的提示词 - 合并全文分析和差异分析到一个请求中
        const fileType = filePath.split('.').pop() || '';
        const fileBaseName = path.basename(filePath);
        
        notificationManager.log(`(2/5) 构建分析提示...`, 'info', false);
        console.log(`[${new Date().toISOString()}] 准备单一综合分析请求...`);
        
        // 构建合并的提示词
        let combinedPrompt = `分析以下${fileType}文件: ${fileBaseName}\n\n`;
        combinedPrompt += `文件内容:\n\`\`\`${fileType}\n${params.currentContent}\n\`\`\`\n\n`;
        
        // 如果需要差异分析，添加差异信息
        if (options.includeDiffAnalysis && diffContent && diffContent.trim().length > 10) {
            combinedPrompt += `\n差异内容:\n\`\`\`diff\n${diffContent}\n\`\`\`\n\n`;
        }
        
        combinedPrompt += `请执行代码审查并提供以下信息:
1. 代码质量评分 (1-10)
2. 主要发现和建议
3. 可能的改进点
4. 最佳实践应用情况
5. 潜在的问题或漏洞\n\n`;

        combinedPrompt += `请保持简洁、具体并提供有用的建议。`;
        
        // 请求开始
        console.time('singleApiRequest');
        notificationManager.log(`(3/5) 发送AI分析请求，长度: ${combinedPrompt.length}字符...`, 'info', true);
        console.log(`[${new Date().toISOString()}] 开始发送单一综合分析请求，提示长度: ${combinedPrompt.length}字符`);

        try {
            // 发送单一分析请求
            const messages = [
                {
                    role: 'system' as 'system',
                    content: PROMPTS.CODE_REVIEW_TEMPLATES.SYSTEM_PROMPT
                },
                { role: 'user' as 'user', content: combinedPrompt }
            ];
            
            // 增加超时处理和压缩选项
            const response = await this.modelService.createChatCompletion({
                messages,
                temperature: 0.1,
                max_tokens: 8192,
                compressLargeContent: fileSize > 50000, // 对大文件启用自动压缩
                compressionThreshold: 50000 // 压缩阈值
            });
            
            console.timeEnd('singleApiRequest');
            const endTime = new Date();
            const duration = (endTime.getTime() - startTime.getTime()) / 1000;
            
            console.log(`[${endTime.toISOString()}] 综合分析完成，耗时: ${duration.toFixed(2)}秒，响应长度: ${response.content.length}字符`);
            notificationManager.log(`(4/5) 分析完成，耗时: ${duration.toFixed(2)}秒`, 'info', true);
            
            // 提取建议
            notificationManager.log(`(5/5) 处理分析结果...`, 'info', false);
            const suggestions = this.extractSuggestions(response.content);
            console.log(`[${new Date().toISOString()}] 已提取 ${suggestions.length} 条建议`);
            
            // 尝试提取评分
            let score = 0;
            const scoreMatch = response.content.match(/评分.*?(\d+(?:\.\d+)?)/);
            if (scoreMatch) {
                score = parseFloat(scoreMatch[1]);
                score = Math.min(Math.max(score, 0), 10); // 确保分数在0-10之间
            }
            
            console.timeEnd('performCodeAnalysis:total');
            
            return {
                suggestions,
                score,
                diffContent: response.content,
                // 仍然保留这些字段以保持接口兼容性
                diffSuggestions: [],
                fullFileSuggestions: suggestions
            };
        } catch (error: any) {
            console.timeEnd('singleApiRequest');
            console.timeEnd('performCodeAnalysis:total');
            
            // 增强错误处理
            const errorMessage = error.message || String(error);
            const errorTime = new Date().toISOString();
            console.error(`[${errorTime}] 分析请求失败: ${errorMessage}`);
            
            // 添加重试逻辑
            if (errorMessage.includes('timeout') || errorMessage.includes('rate limit')) {
                notificationManager.log(`分析请求超时或达到速率限制，请稍后再试`, 'warning', true);
            } else {
                notificationManager.log(`分析请求失败: ${errorMessage}`, 'error', true);
            }
            
            return {
                suggestions: [`分析失败 (${errorTime}): ${errorMessage}`],
                score: 0,
                diffContent: '',
                diffSuggestions: [],
                fullFileSuggestions: []
            };
        }
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
        
        // Process normal files in batches based on size
        if (normalFiles.length > 0) {
            // Sort files by size (smallest to largest for easier batching)
            normalFiles.sort((a, b) => a.currentContent.length - b.currentContent.length);
            
            // Prepare different types of analyses
            const fullFileBatches: CodeReviewRequest[][] = [];
            let currentBatch: CodeReviewRequest[] = [];
            let currentBatchSize = 0;
            
            // Group files for full file analysis
            for (const request of normalFiles) {
                const fileSize = request.currentContent.length;
                const estimatedTokens = fileSize * TOKENS_PER_CHAR;
                
                // 设置流式输出参数
                request.useStreamingOutput = true;
                
                // Check if adding this file would exceed the batch limit
                if (currentBatchSize + estimatedTokens > MAX_BATCH_TOKENS && currentBatch.length > 0) {
                    fullFileBatches.push(currentBatch);
                    currentBatch = [request];
                    currentBatchSize = estimatedTokens;
                } else {
                    currentBatch.push(request);
                    currentBatchSize += estimatedTokens;
                }
            }
            
            // Add the last batch if not empty
            if (currentBatch.length > 0) {
                fullFileBatches.push(currentBatch);
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
                
                // Make a single API request for the entire batch with streaming enabled
                notificationManager.log(`${OUTPUT.REVIEW.FULL_FILE_ANALYSIS_START} (Batch ${i+1}/${fullFileBatches.length}, ${batchSize} files)`, 'info', false);
                console.time(`fullFileBatchApiRequest-${i}`);
                
                const fullFileResponse = await this.makeSpecificApiRequest(
                    combinedFullFilePrompt, 
                    PROMPTS.CODE_REVIEW_TEMPLATES.SYSTEM_PROMPT,
                    true // 启用流式输出
                );
                
                console.timeEnd(`fullFileBatchApiRequest-${i}`);
                notificationManager.log(`${OUTPUT.REVIEW.FULL_FILE_ANALYSIS_COMPLETE(fullFileResponse.length)} (Batch ${i+1}/${fullFileBatches.length})`, 'info', false);
                
                // Split the response by file markers and extract suggestions for each file
                const fileResponses = this.splitBatchResponse(fullFileResponse, batch.map(r => r.filePath));
                
                // Merge the results
                for (let j = 0; j < batch.length; j++) {
                    const request = batch[j];
                    const filePath = request.filePath;
                    const fileResponse = fileResponses[j] || '';
                    
                    // Parse the response to extract suggestions
                    const suggestions = this.extractSuggestions(fileResponse);
                    const score = this.extractScoreFromAnalysis(fileResponse);
                    
                    // Create review result
                    results.set(filePath, {
                        suggestions,
                        score,
                        diffContent: '',
                    });
                }
            }
        }
        
        return results;
    }
    
    /**
     * Split a batch response into individual file responses
     * @param batchResponse The combined response from the AI
     * @param filePaths Array of file paths in the same order as in the request
     * @returns Array of file responses in the same order as file paths
     */
    private splitBatchResponse(batchResponse: string, filePaths: string[]): string[] {
        const result: string[] = [];
        
        // 为每个文件路径创建标记模式
        for (let i = 0; i < filePaths.length; i++) {
            const filePath = filePaths[i];
            const fileMarker = `--- FILE: ${filePath} ---`;
            
            // 查找当前文件的起始位置
            const startIdx = batchResponse.indexOf(fileMarker);
            if (startIdx === -1) {
                // 如果找不到文件标记，尝试使用更复杂的模式
                const fileName = path.basename(filePath);
                
                // 尝试不同的模式来定位文件特定内容
                const patterns = [
                    new RegExp(`---\\s*FILE:\\s*${this.escapeRegExp(filePath)}\\s*---([\\s\\S]*?)(?=---\\s*FILE:|$)`, 'i'),
                    new RegExp(`File:\\s*${this.escapeRegExp(filePath)}([\\s\\S]*?)(?=File:|$)`, 'i'),
                    new RegExp(`${this.escapeRegExp(fileName)}([\\s\\S]*?)(?=\\w+\\.\\w+:|$)`, 'i')
                ];
                
                let fileContent = '';
                
                // 尝试每个模式，直到找到匹配项
                for (const pattern of patterns) {
                    const match = batchResponse.match(pattern);
                    if (match && match[1]) {
                        fileContent = match[1].trim();
                        break;
                    }
                }
                
                // 如果找不到特定部分，查找任何提到该文件的内容
                if (!fileContent) {
                    // 作为后备，只是搜索提到该文件的任何段落
                    const fileNamePattern = new RegExp(`(\\b${this.escapeRegExp(fileName)}\\b[\\s\\S]*?)(?=\\n\\n|$)`, 'gi');
                    const matches = batchResponse.match(fileNamePattern);
                    if (matches && matches.length > 0) {
                        fileContent = matches.join('\n\n');
                    }
                }
                
                // 如果仍然找不到任何内容，分配空响应
                if (!fileContent) {
                    fileContent = `No specific analysis found for ${filePath}`;
                }
                
                result.push(fileContent);
                continue;
            }
            
            // 计算内容的起始位置（跳过文件标记）
            const contentStart = startIdx + fileMarker.length;
            
            // 查找下一个文件标记或使用字符串结束
            let nextFileIdx = -1;
            if (i < filePaths.length - 1) {
                const nextFileMarker = `--- FILE: ${filePaths[i + 1]} ---`;
                nextFileIdx = batchResponse.indexOf(nextFileMarker, contentStart);
            }
            
            // 提取当前文件的内容
            const fileContent = nextFileIdx === -1 ? 
                batchResponse.substring(contentStart) : 
                batchResponse.substring(contentStart, nextFileIdx);
            
            result.push(fileContent.trim());
        }
        
        return result;
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

    /**
     * 从分析文本中提取评分
     * @param text 分析文本
     * @returns 评分（0-10）
     */
    private extractScoreFromAnalysis(text: string): number {
        // 尝试从文本中匹配分数，格式通常是"评分：8/10"或"分数：8"
        const scorePattern = /(?:评分|分数|评估|Score|Rating|Quality Score)[:：]\s*(\d+(?:\.\d+)?)[\/\s]*(?:10)?/i;
        const match = text.match(scorePattern);
        
        if (match && match[1]) {
            const scoreValue = parseFloat(match[1]);
            if (!isNaN(scoreValue)) {
                // 确保分数在0-10范围内
                return Math.min(Math.max(scoreValue, 0), 10);
            }
        }
        
        // 如果找不到明确的分数，尝试从文本中推断
        if (/优秀|excellent|outstanding|perfect/i.test(text)) {
            return 9;
        } else if (/良好|good|well|solid/i.test(text)) {
            return 7;
        } else if (/中等|average|moderate|fair/i.test(text)) {
            return 5;
        } else if (/差|poor|bad|problematic/i.test(text)) {
            return 3;
        }
        
        // 默认返回中等分数
        return 5;
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
        
        console.error('[CodeKarmic] Code review error details:', {
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

    private makeSpecificApiRequest(prompt: string, systemPrompt: string, useStreaming: boolean = false): Promise<string> {
        if (!this.modelService) {
            throw new Error(OUTPUT.REVIEW.AI_SERVICE_NOT_INITIALIZED);
        }
        
        const messages = [
            {
                role: 'system' as 'system',
                content: systemPrompt
            },
            { role: 'user' as 'user', content: prompt }
        ];
        
        // 添加请求开始日志
        const notificationManager = NotificationManager.getInstance();
        const startTime = new Date();
        console.log(`[${startTime.toISOString()}] 开始发送AI请求，提示长度: ${prompt.length}字符`);
        notificationManager.log(`正在发送AI请求，请等待响应...`, 'info', false);
        
        // 设置请求参数，添加流式输出支持
        const requestParams = {
            messages,
            temperature: 0.1,
            max_tokens: 8192,
            stream: useStreaming // 启用或禁用流式输出
        };
        
        // 如果启用流式输出，显示进度指示
        if (useStreaming) {
            notificationManager.updateStatusBar('AI分析中...', '流式响应处理中', 'sync~spin');
        }
        
        return this.modelService.createChatCompletion(requestParams).then(response => {
            // 计算请求耗时
            const endTime = new Date();
            const duration = (endTime.getTime() - startTime.getTime()) / 1000;
            console.log(`[${endTime.toISOString()}] AI请求完成，耗时: ${duration.toFixed(2)}秒，响应长度: ${response.content.length}字符`);
            notificationManager.log(`AI请求完成，耗时: ${duration.toFixed(2)}秒`, 'info', false);
            return response.content;
        }).catch((error: any) => {
            // 错误日志
            const endTime = new Date();
            const duration = (endTime.getTime() - startTime.getTime()) / 1000;
            console.error(`[${endTime.toISOString()}] AI请求失败，耗时: ${duration.toFixed(2)}秒，错误: ${error.message}`);
            notificationManager.log(`AI请求失败，错误: ${error.message}`, 'error', true);
            throw error;
        });
    }

}