/**
 * 代码分析器
 * 
 * 本模块提供代码分析功能，用于代码审查过程中分析代码质量、结构和潜在问题。
 */

import { CodeReviewRequest, CodeReviewResult, CodeAnalysisOptions } from './reviewTypes';
import { Logger } from '../../utils/logger';
import { PROMPTS } from '../../i18n';
import { ModelInterface } from '../../models/modelInterface';
import { LargeFileProcessor } from '../compression/largeFileProcessor';

/**
 * 代码分析器类
 * 负责分析代码并生成审查结果
 */
export class CodeAnalyzer {
    private logger = new Logger('CodeAnalyzer');
    private largeFileProcessor: LargeFileProcessor;
    
    /**
     * 构造函数
     * @param modelService AI模型服务，用于执行代码分析
     */
    constructor(private modelService: ModelInterface) {
        this.largeFileProcessor = LargeFileProcessor.getInstance();
    }
    
    /**
     * Analyze code
     * @param request Code review request
     * @param options Analysis options
     * @returns Code review result
     */
    public async analyzeCode(
        request: CodeReviewRequest, 
        options: CodeAnalysisOptions = { 
            includeDiffAnalysis: false, 
            includeFullFileAnalysis: true,
            useCompression: true
        }
    ): Promise<CodeReviewResult> {
        this.logger.info(`开始分析代码: ${request.filePath}`);
        
        try {
            // 检查是否是大文件且需要压缩
            if (options.useCompression && this.largeFileProcessor.isLargeFile(request)) {
                this.logger.info(`检测到大文件，使用压缩处理: ${request.filePath}`);
                return await this.largeFileProcessor.processLargeFile(request);
            }
            
            // 正常处理流程
            const result: CodeReviewResult = {
                suggestions: [],
                score: 0
            };
            
            // 分析差异（如果有）
            if (options.includeDiffAnalysis && request.diffContent) {
                this.logger.info(`执行差异分析: ${request.filePath}`);
                const diffSuggestions = await this.analyzeDiff(request);
                result.diffSuggestions = diffSuggestions;
                result.suggestions.push(...diffSuggestions);
            }
            
            // 分析整个文件
            if (options.includeFullFileAnalysis) {
                this.logger.info(`执行完整文件分析: ${request.filePath}`);
                const fullFileSuggestions = await this.analyzeFullFile(request);
                result.fullFileSuggestions = fullFileSuggestions;
                
                // 如果没有差异分析，或者差异分析没有产生建议，使用完整文件分析的建议
                if (!result.diffSuggestions || result.diffSuggestions.length === 0) {
                    result.suggestions.push(...fullFileSuggestions);
                }
            }
            
            // 计算总体评分
            result.score = this.calculateScore(result);
            
            this.logger.info(`代码分析完成: ${request.filePath}, 评分: ${result.score}`);
            return result;
        } catch (error) {
            this.logger.error(`代码分析错误: ${error}`);
            return {
                suggestions: [`分析代码时出错: ${error}`],
                score: 0
            };
        }
    }
    
    /**
     * 分析代码差异
     * @param request 代码审查请求
     * @returns 基于差异的建议列表
     */
    private async analyzeDiff(request: CodeReviewRequest): Promise<string[]> {
        try {
            if (!request.diffContent || request.diffContent.trim().length < 10) {
                return ['没有有效的差异内容可供分析'];
            }
            
            // 创建差异分析提示
            const prompt = PROMPTS.CODE_REVIEW_TEMPLATES.DIFF_PROMPT(
                request.filePath,
                request.diffContent
            );
            
            // Use system prompt
            const systemPrompt = PROMPTS.CODE_REVIEW_TEMPLATES.DIFF_SYSTEM_PROMPT;
            
            // Call AI model service
            const response = await this.modelService.generateContent({
                systemPrompt,
                userPrompt: prompt,
                options: {
                    maxTokens: 2000,
                    temperature: 0.3
                }
            });
            
            // Parse response
            return this.parseSuggestions(response.text);
        } catch (error) {
            this.logger.error(`差异分析错误: ${error}`);
            return [`差异分析时出错: ${error}`];
        }
    }
    
    /**
     * 分析完整文件
     * @param request 代码审查请求
     * @returns 基于完整文件的建议列表
     */
    private async analyzeFullFile(request: CodeReviewRequest): Promise<string[]> {
        try {
            const fileType = request.filePath.split('.').pop() || '';
            
            // 创建完整文件分析提示
            const prompt = PROMPTS.CODE_REVIEW_TEMPLATES.FULL_FILE_PROMPT(
                request.filePath,
                fileType,
                request.currentContent
            );
            
            // 使用系统提示
            const systemPrompt = PROMPTS.CODE_REVIEW_TEMPLATES.SYSTEM_PROMPT;
            
            // Call AI model service
            const response = await this.modelService.generateContent({
                systemPrompt,
                userPrompt: prompt,
                options: {
                    maxTokens: 3000,
                    temperature: 0.3
                }
            });
            
            // Parse response
            return this.parseSuggestions(response.text);
        } catch (error) {
            this.logger.error(`完整文件分析错误: ${error}`);
            return [`完整文件分析时出错: ${error}`];
        }
    }
    
    /**
     * 解析AI响应中的建议
     * @param responseText AI响应文本
     * @returns 建议列表
     */
    private parseSuggestions(responseText: string): string[] {
        // 按行分割并过滤空行
        const lines = responseText.split('\n').filter(line => line.trim().length > 0);
        
        // 提取建议（以行号或部分标记开头的行）
        const suggestions = lines.filter(line => {
            return /^\\[.*?\\]|^-|^•|^\\d+\\./.test(line.trim());
        });
        
        // 如果没有找到符合格式的建议，返回前几行作为建议
        if (suggestions.length === 0 && lines.length > 0) {
            return lines.slice(0, Math.min(5, lines.length));
        }
        
        return suggestions;
    }
    
    /**
     * 计算代码审查评分
     * @param result 代码审查结果
     * @returns 1-10的评分，10为最高
     */
    private calculateScore(result: CodeReviewResult): number {
        // 从响应中提取评分（如果有）
        const scorePattern = /评分[:：]?\s*(\d+)\/10|评分[:：]?\s*(\d+)/i;
        
        for (const suggestion of result.suggestions) {
            const match = suggestion.match(scorePattern);
            if (match) {
                const scoreText = match[1] || match[2] || '0';
                const score = parseInt(scoreText, 10);
                if (!isNaN(score) && score >= 1 && score <= 10) {
                    return score;
                }
            }
        }
        
        // If no explicit score, calculate score based on suggestion count
        // Fewer suggestions means higher score (assuming suggestions point out issues)
        const suggestionCount = result.suggestions.length;
        
        if (suggestionCount === 0) {
            return 10; // No suggestions, code is perfect
        } else if (suggestionCount <= 2) {
            return 9; // Very few suggestions, code is very good
        } else if (suggestionCount <= 5) {
            return 8; // Few suggestions, code is good
        } else if (suggestionCount <= 10) {
            return 7; // Moderate suggestions, code is decent
        } else if (suggestionCount <= 15) {
            return 6; // More suggestions, code is average
        } else if (suggestionCount <= 20) {
            return 5; // Many suggestions, code needs improvement
        } else {
            return 4; // Numerous suggestions, code needs significant improvement
        }
    }
}
