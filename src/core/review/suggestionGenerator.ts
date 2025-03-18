/**
 * Suggestion Generator
 * 
 * This module is responsible for generating and formatting code review suggestions, converting raw analysis results into structured suggestions.
 */

import { CodeReviewResult } from './reviewTypes';
import { Logger } from '../../utils/logger';
import { PROMPTS } from '../../i18n';
import { ModelInterface } from '../../models/modelInterface';

/**
 * Suggestion Categories
 */
export enum SuggestionCategory {
    STRUCTURE = 'structure',
    PERFORMANCE = 'performance',
    SECURITY = 'security',
    READABILITY = 'readability',
    MAINTAINABILITY = 'maintainability',
    BEST_PRACTICE = 'best_practice',
    OTHER = 'other'
}

/**
 * Suggestion Severity
 */
export enum SuggestionSeverity {
    CRITICAL = 'critical',
    HIGH = 'high',
    MEDIUM = 'medium',
    LOW = 'low',
    INFO = 'info'
}

/**
 * Structured Suggestion
 */
export interface StructuredSuggestion {
    /** Suggestion content */
    content: string;
    /** Related code lines */
    lines?: string | number[] | undefined;
    /** Suggestion category */
    category: SuggestionCategory;
    /** Severity */
    severity: SuggestionSeverity;
    /** Fix example */
    fixExample?: string;
}

/**
 * Suggestion Generator Class
 * Responsible for generating and formatting code review suggestions
 */
export class SuggestionGenerator {
    private logger = new Logger('SuggestionGenerator');
    
    /**
     * Constructor
     * @param modelService AI model service for generating suggestions
     */
    constructor(private modelService: ModelInterface) {}
    
    /**
     * Generate final suggestions
     * @param diffSuggestions Diff analysis suggestions
     * @param fullFileSuggestions Full file analysis suggestions
     * @returns Final suggestions and score
     */
    public async generateFinalSuggestions(
        diffSuggestions: string[] = [], 
        fullFileSuggestions: string[] = []
    ): Promise<{ suggestions: string[], score: number }> {
        try {
            this.logger.info('生成最终建议');
            
            // If there aren't enough suggestions, return merged results directly
            if (diffSuggestions.length + fullFileSuggestions.length <= 5) {
                const allSuggestions = [...new Set([...diffSuggestions, ...fullFileSuggestions])];
                return {
                    suggestions: allSuggestions,
                    score: this.estimateScore(allSuggestions)
                };
            }
            
            // Create final suggestion prompt
            const prompt = PROMPTS.CODE_REVIEW_TEMPLATES.FINAL_PROMPT(
                diffSuggestions,
                fullFileSuggestions
            );
            
            // Call AI model service
            const response = await this.modelService.generateContent({
                userPrompt: prompt,
                options: {
                    maxTokens: 2000,
                    temperature: 0.3
                }
            });
            
            // Parse response
            const { suggestions, score } = this.parseFinalResponse(response.text);
            
            this.logger.info(`生成了 ${suggestions.length} 条最终建议，评分: ${score}`);
            return { suggestions, score };
        } catch (error) {
            this.logger.error(`生成最终建议时出错: ${error}`);
            
            // Return merged original suggestions on error
            const allSuggestions = [...new Set([...diffSuggestions, ...fullFileSuggestions])];
            return {
                suggestions: allSuggestions,
                score: this.estimateScore(allSuggestions)
            };
        }
    }
    
    /**
     * Parse final response
     * @param responseText AI response text
     * @returns Suggestions and score
     */
    private parseFinalResponse(responseText: string): { suggestions: string[], score: number } {
        // Initialize results
        let suggestions: string[] = [];
        let score = 0;
        
        // Find suggestions section
        const suggestionsMatch = responseText.match(/---OVERALL SUGGESTIONS---\s*([\s\S]*?)(?:---SCORE---|$)/i);
        if (suggestionsMatch && suggestionsMatch[1]) {
            suggestions = suggestionsMatch[1]
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && /^-|^•|^\d+\./.test(line));
        }
        
        // Find score section
        const scoreMatch = responseText.match(/---SCORE---\s*(\d+)/i);
        if (scoreMatch && scoreMatch[1]) {
            score = parseInt(scoreMatch[1], 10);
            if (isNaN(score) || score < 1 || score > 10) {
                score = 5; // Default medium score
            }
        } else {
            // If no score found, estimate based on suggestion count
            score = this.estimateScore(suggestions);
        }
        
        return { suggestions, score };
    }
    
    /**
     * Estimate score based on suggestion count
     * @param suggestions List of suggestions
     * @returns Score from 1-10, where 10 is highest
     */
    private estimateScore(suggestions: string[]): number {
        const count = suggestions.length;
        
        if (count === 0) {
            return 10; // No suggestions, code is perfect
        } else if (count <= 2) {
            return 9; // Very few suggestions, code is very good
        } else if (count <= 5) {
            return 8; // Few suggestions, code is good
        } else if (count <= 10) {
            return 7; // Moderate suggestions, code is decent
        } else if (count <= 15) {
            return 6; // More suggestions, code is average
        } else if (count <= 20) {
            return 5; // Many suggestions, code needs improvement
        } else {
            return 4; // Lots of suggestions, code needs significant improvement
        }
    }
    
    /**
     * Convert raw suggestions to structured suggestions
     * @param suggestions Raw suggestion list
     * @returns List of structured suggestions
     */
    public structureSuggestions(suggestions: string[]): StructuredSuggestion[] {
        return suggestions.map(suggestion => {
            // Try to extract line numbers
            const lineMatch = suggestion.match(/^\[(\d+(?:-\d+)?)\]/);
            let lines: string | number[] | undefined;
            let content = suggestion;
            
            if (lineMatch && lineMatch[1]) {
                const lineInfo = lineMatch[1];
                content = suggestion.substring(lineMatch[0].length).trim();
                
                if (lineInfo.includes('-')) {
                    // Line range
                    const parts = lineInfo.split('-').map(Number);
                    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        const start = parts[0];
                        const end = parts[1];
                        if (start !== undefined && end !== undefined && typeof start === 'number' && typeof end === 'number' && !isNaN(start) && !isNaN(end)) {
                            lines = Array.from({ length: end - start + 1 }, (_, i) => start + i);
                        }
                    }
                } else {
                    // Single line
                    const lineNum = parseInt(lineInfo, 10);
                    if (!isNaN(lineNum)) {
                        lines = [lineNum];
                    }
                }
            }
            
            // Try to determine category
            let category = SuggestionCategory.OTHER;
            if (/结构|组织|架构|模块|分层|依赖|structure|organization|architecture/i.test(content)) {
                category = SuggestionCategory.STRUCTURE;
            } else if (/性能|效率|优化|速度|内存|资源|performance|efficiency|optimization/i.test(content)) {
                category = SuggestionCategory.PERFORMANCE;
            } else if (/安全|漏洞|注入|验证|加密|security|vulnerability|injection|validation/i.test(content)) {
                category = SuggestionCategory.SECURITY;
            } else if (/可读性|命名|注释|格式|readability|naming|comment|format/i.test(content)) {
                category = SuggestionCategory.READABILITY;
            } else if (/可维护性|重复|复杂度|测试|maintainability|duplication|complexity|testing/i.test(content)) {
                category = SuggestionCategory.MAINTAINABILITY;
            } else if (/最佳实践|约定|标准|模式|best practice|convention|standard|pattern/i.test(content)) {
                category = SuggestionCategory.BEST_PRACTICE;
            }
            
            // Try to determine severity
            let severity = SuggestionSeverity.MEDIUM;
            if (/严重|critical|crash|崩溃|安全漏洞|security vulnerability/i.test(content)) {
                severity = SuggestionSeverity.CRITICAL;
            } else if (/高|重要|high|important|major/i.test(content)) {
                severity = SuggestionSeverity.HIGH;
            } else if (/低|minor|低优先级|low priority/i.test(content)) {
                severity = SuggestionSeverity.LOW;
            } else if (/信息|提示|info|hint|suggestion/i.test(content)) {
                severity = SuggestionSeverity.INFO;
            }
            
            return {
                content,
                lines,
                category,
                severity
            };
        });
    }
    
    /**
     * Generate report for code review result
     * @param result Code review result
     * @param filePath File path
     * @returns Formatted report
     */
    public generateReport(result: CodeReviewResult, filePath: string): string {
        const { suggestions, score } = result;
        
        // Convert suggestions to structured format
        const structuredSuggestions = this.structureSuggestions(suggestions);
        
        // Group by category
        const categorizedSuggestions = this.categorizeSuggestions(structuredSuggestions);
        
        // Generate report
        let report = `# 代码审查报告: ${filePath}\n\n`;
        report += `## 总体评分: ${score}/10\n\n`;
        
        // Add summary
        report += `## 摘要\n\n`;
        report += this.generateSummary(structuredSuggestions, score || 0);
        report += '\n\n';
        
        // Add categorized suggestions
        for (const [category, suggestions] of Object.entries(categorizedSuggestions)) {
            if (suggestions.length > 0) {
                report += `## ${this.getCategoryTitle(category as SuggestionCategory)}\n\n`;
                
                suggestions.forEach(suggestion => {
                    const lineInfo = suggestion.lines 
                        ? `[行: ${Array.isArray(suggestion.lines) ? suggestion.lines.join(', ') : suggestion.lines}] ` 
                        : '';
                    const severityIcon = this.getSeverityIcon(suggestion.severity);
                    
                    report += `${severityIcon} ${lineInfo}${suggestion.content}\n\n`;
                });
            }
        }
        
        return report;
    }
    
    /**
     * Group suggestions by category
     */
    private categorizeSuggestions(suggestions: StructuredSuggestion[]): Record<string, StructuredSuggestion[]> {
        const result: Record<string, StructuredSuggestion[]> = {};
        
        // Initialize all categories
        Object.values(SuggestionCategory).forEach(category => {
            result[category] = [];
        });
        
        // Group suggestions
        suggestions.forEach(suggestion => {
            if (suggestion && suggestion.category && result[suggestion.category]) {
                result[suggestion.category]?.push(suggestion);
            }
        });
        
        return result;
    }
    
    /**
     * Generate summary
     */
    private generateSummary(suggestions: StructuredSuggestion[], score: number): string {
        // Calculate suggestion count by category
        const categoryCounts: Record<string, number> = {};
        Object.values(SuggestionCategory).forEach(category => {
            categoryCounts[category] = 0;
        });
        
        suggestions.forEach(suggestion => {
            if (suggestion && suggestion.category) {
                categoryCounts[suggestion.category] = (categoryCounts[suggestion.category] || 0) + 1;
            }
        });
        
        // Calculate suggestion count by severity level
        const severityCounts: Record<string, number> = {};
        Object.values(SuggestionSeverity).forEach(severity => {
            severityCounts[severity] = 0;
        });
        
        suggestions.forEach(suggestion => {
            if (suggestion && suggestion.severity) {
                severityCounts[suggestion.severity] = (severityCounts[suggestion.severity] || 0) + 1;
            }
        });
        
        // Generate summary text
        let summary = '';
        
        if (score >= 9) {
            summary += '代码质量非常高，只有少量改进建议。\n';
        } else if (score >= 7) {
            summary += '代码质量良好，有一些改进空间。\n';
        } else if (score >= 5) {
            summary += '代码质量一般，需要多方面改进。\n';
        } else {
            summary += '代码质量需要显著改进，请关注以下建议。\n';
        }
        
        summary += '\n### 建议分布\n\n';
        
        // Add category distribution
        summary += '**按类别:**\n';
        Object.entries(categoryCounts)
            .filter(([_, count]) => count > 0)
            .sort(([_, countA], [__, countB]) => (countB || 0) - (countA || 0))
            .forEach(([category, count]) => {
                if (category && count !== undefined) {
                    summary += `- ${this.getCategoryTitle(category as SuggestionCategory)}: ${count}条建议\n`;
                }
            });
        
        summary += '\n**按严重性:**\n';
        Object.entries(severityCounts)
            .filter(([_, count]) => count !== undefined && count > 0)
            .sort(([severityA, _], [severityB, __]) => {
                // Sort by severity
                const order: Record<string, number> = {
                    [SuggestionSeverity.CRITICAL]: 0,
                    [SuggestionSeverity.HIGH]: 1,
                    [SuggestionSeverity.MEDIUM]: 2,
                    [SuggestionSeverity.LOW]: 3,
                    [SuggestionSeverity.INFO]: 4
                };
                return (severityA && severityB) ? (order[severityA] || 0) - (order[severityB] || 0) : 0;
            })
            .forEach(([severity, count]) => {
                if (severity && count !== undefined) {
                    const icon = this.getSeverityIcon(severity as SuggestionSeverity);
                    summary += `- ${icon} ${this.getSeverityTitle(severity as SuggestionSeverity)}: ${count}条建议\n`;
                }
            });
        
        return summary;
    }
    
    /**
     * Get category title
     */
    private getCategoryTitle(category: SuggestionCategory): string {
        switch (category) {
            case SuggestionCategory.STRUCTURE:
                return '代码结构与组织';
            case SuggestionCategory.PERFORMANCE:
                return '性能考虑';
            case SuggestionCategory.SECURITY:
                return '安全性';
            case SuggestionCategory.READABILITY:
                return '可读性';
            case SuggestionCategory.MAINTAINABILITY:
                return '可维护性';
            case SuggestionCategory.BEST_PRACTICE:
                return '最佳实践';
            case SuggestionCategory.OTHER:
                return '其他建议';
            default:
                return '其他建议';
        }
    }
    
    /**
     * Get severity icon
     */
    private getSeverityIcon(severity: SuggestionSeverity): string {
        switch (severity) {
            case SuggestionSeverity.CRITICAL:
                return '🔴';
            case SuggestionSeverity.HIGH:
                return '🟠';
            case SuggestionSeverity.MEDIUM:
                return '🟡';
            case SuggestionSeverity.LOW:
                return '🟢';
            case SuggestionSeverity.INFO:
                return '🔵';
            default:
                return '⚪';
        }
    }
    
    /**
     * Get severity title
     */
    private getSeverityTitle(severity: SuggestionSeverity): string {
        switch (severity) {
            case SuggestionSeverity.CRITICAL:
                return '严重';
            case SuggestionSeverity.HIGH:
                return '高';
            case SuggestionSeverity.MEDIUM:
                return '中';
            case SuggestionSeverity.LOW:
                return '低';
            case SuggestionSeverity.INFO:
                return '信息';
            default:
                return '未知';
        }
    }
}
