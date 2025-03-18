/**
 * Large File Processor
 * 
 * This module provides specialized processing for large files in code reviews,
 * using compression and summarization techniques to make them manageable
 * for AI models while avoiding token limits.
 */

import { Logger } from '../../utils/logger';
import { CodeReviewRequest, CodeReviewResult } from '../review/reviewTypes';
import { 
    LargeFileProcessorOptions,
    DEFAULT_LARGE_FILE_OPTIONS,
    TOKENS_PER_CHAR,
    MAX_BATCH_TOKENS
} from './compressionTypes';
import { compressContent, calculateContentFingerprint } from './contentCompressor';
import { PROMPTS } from '../../i18n';

/**
 * Responsible for handling large files in code review
 */
export class LargeFileProcessor {
    private static instance: LargeFileProcessor;
    private options: LargeFileProcessorOptions;
    private logger = new Logger('LargeFileProcessor');
    
    private constructor() {
        this.options = DEFAULT_LARGE_FILE_OPTIONS;
        // Options can be loaded from settings in the future
        // For now, we use default options
    }
    
    /**
     * Get singleton instance
     */
    public static getInstance(): LargeFileProcessor {
        if (!LargeFileProcessor.instance) {
            LargeFileProcessor.instance = new LargeFileProcessor();
        }
        return LargeFileProcessor.instance;
    }
    
    /**
     * Check if file should be treated as large file
     */
    public isLargeFile(request: CodeReviewRequest): boolean {
        if (!this.options.enabled) return false;
        return request.currentContent.length > this.options.sizeThreshold;
    }
    
    /**
     * Process large file for review
     */
    public async processLargeFile(request: CodeReviewRequest): Promise<CodeReviewResult> {
        if (!this.isLargeFile(request)) {
            throw new Error('文件不够大，不需要特殊处理');
        }
        
        this.logger.info(`处理大文件: ${request.filePath} (${request.currentContent.length} 字符)`);
        
        // Compress file content
        const { compressed, stats } = compressContent(
            request.currentContent, 
            this.options.compressionOptions
        );
        
        // Create specialized prompt for large file
        const prompt = this.getLargeFilePrompt(request.filePath, compressed, stats);
        
        try {
            const response = await this.makeSpecificApiRequest(prompt);
            return this.processResponse(response);
        } catch (error) {
            this.logger.error('大文件处理错误:', error);
            return {
                suggestions: [`处理大文件时出错: ${error}`],
                score: 0
            };
        }
    }
    
    /**
     * Generate specialized prompt for large file
     */
    private getLargeFilePrompt(filePath: string, contentSummary: string, stats: any): string {
        const fileType = filePath.split('.').pop() || '';
        // Use statistics for debugging if needed
        if (stats) {
            this.logger.debug(`处理具有压缩统计信息的文件`, stats);
        }
        return PROMPTS.CODE_REVIEW_TEMPLATES.LARGE_FILE_PROMPT(filePath, fileType, contentSummary);
    }
    
    /**
     * Process raw AI response into CodeReviewResult
     */
    private processResponse(response: string): CodeReviewResult {
        const suggestions = this.extractSuggestions(response);
        return {
            suggestions,
            score: suggestions.length > 0 ? 1 : 0
        };
    }
    
    /**
     * Calculate content fingerprint/hash
     * Used for caching and comparing file versions
     */
    public calculateFingerprint(content: string): string {
        const fingerprint = calculateContentFingerprint(content);
        return fingerprint.contentHash as string;
    }
    
    /**
     * Extract suggestions from AI response text
     */
    private extractSuggestions(text: string): string[] {
        // Split by newlines and filter out empty lines
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        
        // Extract suggestions (lines that appear to contain suggestions)
        // This is a simple heuristic approach that can be improved
        const suggestions = lines.filter(line => {
            // Look for lines that might be suggestions
            return (
                // Lines starting with common suggestion markers
                /^[-*•]|^\d+\.|^Suggestion:|^Consider:|^Recommendation:/.test(line) ||
                // Lines containing suggestion language
                /\bconsider\b|\bshould\b|\bmight\b|\bcould\b|\brecommend\b|\bbetter\b|\bimprove\b/i.test(line)
            );
        });
        
        return suggestions.length > 0 ? suggestions : lines.slice(0, 3);
    }
    
    /**
     * Make API request for large file processing
     * (In actual implementation, this will call AI service)
     */
    private async makeSpecificApiRequest(prompt: string): Promise<string> {
        // This is a placeholder - in actual implementation,
        // this will call external AI service
        // In actual implementation, this will be injected or imported
        
        // For demonstration, we return a mock response
        // This should be replaced with actual AI service call
        this.logger.info(`使用提示长度处理大文件: ${prompt.length}`);
        return `
大文件分析:
- 考虑将大函数分解为更小、更易管理的部分
- 通过分离关注点可以改进文件结构
- 检测到一些可以重构的重复代码模式
`;
    }
    
    /**
     * Process multiple large files in batch
     */
    public async batchProcessLargeFiles(requests: CodeReviewRequest[]): Promise<Map<string, CodeReviewResult>> {
        const results = new Map<string, CodeReviewResult>();
        const batches: CodeReviewRequest[][] = [[]];
        
        let currentBatchSize = 0;
        let currentBatchIndex = 0;
        
        this.logger.info(`批处理 ${requests.length} 个文件`);
        
        // Group files into batches
        for (const request of requests) {
            if (!this.isLargeFile(request)) continue;
            
            const { compressed } = compressContent(
                request.currentContent, 
                this.options.compressionOptions
            );
            
            // Estimate token count for this compressed file
            const estimatedTokens = compressed.length * TOKENS_PER_CHAR;
            
            // Create new batch if adding this file would exceed token limit
            if (currentBatchSize + estimatedTokens > MAX_BATCH_TOKENS) {
                currentBatchIndex++;
                batches[currentBatchIndex] = [];
                currentBatchSize = 0;
            }
            
            // Ensure batch array index exists
            if (!batches[currentBatchIndex]) {
                batches[currentBatchIndex] = [];
            }
            
            batches[currentBatchIndex].push(request);
            currentBatchSize += estimatedTokens;
        }
        
        this.logger.info(`创建了 ${batches.length} 个批次进行处理`);
        
        // Process each batch
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            if (batch) {
                this.logger.info(`处理批次 ${i+1}/${batches.length}，包含 ${batch.length} 个文件`);
            } else {
                this.logger.warn(`批次 ${i+1} 为空，跳过处理`);
                continue;
            }
            
            // Process each file in the batch
            for (const request of batch) {
                try {
                    const result = await this.processLargeFile(request);
                    results.set(request.filePath, result);
                } catch (error) {
                    this.logger.error(`处理文件时出错 ${request.filePath}:`, error);
                    results.set(request.filePath, {
                        suggestions: [`处理文件时出错: ${error}`],
                        score: 0
                    });
                }
            }
        }
        
        return results;
    }
    
    /**
     * Update processor options
     */
    public updateOptions(options: Partial<LargeFileProcessorOptions>): void {
        this.options = {
            ...this.options,
            ...options,
            compressionOptions: {
                ...this.options.compressionOptions,
                ...(options.compressionOptions || {})
            }
        };
        this.logger.info('更新了大文件处理器选项', this.options);
    }
}
