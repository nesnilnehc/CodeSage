import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAI } from 'openai';
import axios from 'axios';

export interface CodeReviewRequest {
    filePath: string;
    currentContent: string;
    previousContent: string;
    language?: string;
}

export interface CodeReviewResult {
    suggestions: string[];
    score?: number;
}

export interface CodeReviewResponse {
    comments: string[];
    suggestions: string[];
    score: number;
}

export class AIService {
    private static instance: AIService;
    private apiKey: string | undefined;
    private selectedModel: string = 'deepseek-r1';
    private language: string = 'zh';
    private client: OpenAI | undefined;

    private constructor() {
        // 获取配置
        const config = vscode.workspace.getConfiguration('codesage');
        this.apiKey = config.get('deepseekApiKey');
        this.selectedModel = config.get('selectedModel') || 'deepseek-r1';
        this.language = config.get('language') || 'zh';

        // 初始化 OpenAI 客户端
        if (this.apiKey) {
            this.client = new OpenAI({
                baseURL: 'https://api.deepseek.com/v1',
                apiKey: this.apiKey,
                maxRetries: 3,
                timeout: AIService.TIMEOUT,
                defaultHeaders: {
                    'Content-Type': 'application/json'
                },
                defaultQuery: undefined
            });
        }
    }

    public static getInstance(): AIService {
        if (!AIService.instance) {
            AIService.instance = new AIService();
        }
        return AIService.instance;
    }

    private static readonly TIMEOUT = 20 * 1000; // 20 seconds timeout
    private static readonly MAX_CONTENT_LENGTH = 4000; // Maximum content length
    private static readonly RETRY_DELAY = 1000; // 1 second delay between retries
    private static readonly MAX_RETRIES = 2; // Maximum number of retries

    private async retryWithDelay<T>(operation: () => Promise<T>, retries = AIService.MAX_RETRIES): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, AIService.RETRY_DELAY));
                return this.retryWithDelay(operation, retries - 1);
            }
            throw error;
        }
    }

    private truncateContent(content: string): string {
        if (content.length <= AIService.MAX_CONTENT_LENGTH) {
            return content;
        }
        return content.slice(0, AIService.MAX_CONTENT_LENGTH) + '\n... (content truncated for performance)\n';
    }

    private async analyzeCode(filePath: string, content: string, isCurrentContent: boolean): Promise<string> {
        const systemPrompt = this.language === 'zh' ?
            '你是一个代码审查专家。请用中文回复。' :
            'You are a code review expert. Please reply in English.';

        const prompt = this.language === 'zh' ?
            `请审查以下${isCurrentContent ? '当前' : '之前的'}代码，并提供问题和建议。
文件：${filePath}
代码：
${content}` :
            `Please review the ${isCurrentContent ? 'current' : 'previous'} code and provide issues and suggestions.
File: ${filePath}
Code:
${content}`;

        const response = await this.retryWithDelay(async () => {
            if (!this.client) {
                throw new Error('OpenAI client not initialized');
            }

            return await this.client.chat.completions.create({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 500
            });
        });

        return response.choices[0].message.content || '';
    }

    public async reviewCode(params: { filePath: string; currentContent: string; previousContent: string }): Promise<CodeReviewResult> {
        try {
            if (!this.apiKey) {
                throw new Error('DeepSeek API key not set');
            }

            // 分别分析当前和之前的代码
            const [currentAnalysis, previousAnalysis] = await Promise.all([
                this.analyzeCode(params.filePath, this.truncateContent(params.currentContent), true),
                this.analyzeCode(params.filePath, this.truncateContent(params.previousContent), false)
            ]);

            // 生成最终分析
            const finalPrompt = this.language === 'zh' ?
                `请基于以下分析结果，提供最终的代码审查报告。

当前代码分析：
${currentAnalysis}

之前代码分析：
${previousAnalysis}

请按以下格式回复：
---改进建议---
(列出具体的改进建议)

---评分---
(0-10分)` :
                `Based on the following analysis results, provide a final code review report.

Current code analysis:
${currentAnalysis}

Previous code analysis:
${previousAnalysis}

Please reply in the following format:
---SUGGESTIONS---
(List specific improvement suggestions)

---SCORE---
(0-10)`;

            const finalResponse = await this.retryWithDelay(async () => {
                if (!this.client) {
                    throw new Error('OpenAI client not initialized');
                }

                return await this.client.chat.completions.create({
                    model: 'deepseek-chat',
                    messages: [
                        {
                            role: 'system',
                            content: this.language === 'zh' ?
                                '你是一个代码审查专家。请基于之前的分析给出最终的审查意见。' :
                                'You are a code review expert. Please provide final review based on previous analysis.'
                        },
                        { role: 'user', content: finalPrompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 500
                });
            });

            const aiResponse = finalResponse.choices[0].message.content || '';
            const suggestions: string[] = [];
            let score = 0;

            // 提取建议
            const suggestionsPattern = this.language === 'zh' ? /---改进建议---(.*?)(?=---评分---)/s : /---SUGGESTIONS---(.*?)(?=---SCORE---)/s;
            const suggestionsMatch = aiResponse.match(suggestionsPattern);
            if (suggestionsMatch) {
                suggestions.push(...suggestionsMatch[1].trim().split('\n').filter((s: string) => s.trim()));
            }

            // 提取分数
            const scorePattern = this.language === 'zh' ? /---评分---(.*)/s : /---SCORE---(.*)/s;
            const scoreMatch = aiResponse.match(scorePattern);
            if (scoreMatch) {
                const scoreStr = scoreMatch[1].trim();
                const scoreNum = parseFloat(scoreStr);
                if (!isNaN(scoreNum)) {
                    score = Math.min(Math.max(scoreNum, 0), 10);
                }
            }

            return {
                suggestions,
                score
            };
        } catch (error) {
            const errorDetails = error instanceof Error ? error.stack || error.message : String(error);
            console.error('[CodeSage] Code review error details:', {
                error: errorDetails,
                request: {
                    filePath: params.filePath,
                    language: this.detectLanguage(params.filePath),
                    modelUsed: this.selectedModel,
                    apiKeyConfigured: !!this.apiKey,
                    clientInitialized: !!this.client
                }
            });
            
            return {
                suggestions: [`Error: Unable to complete code review. Details: ${errorDetails}`],
                score: undefined
            };
        }
    }

    public async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const client = new OpenAI({
                baseURL: 'https://api.deepseek.com',
                apiKey: apiKey
            });

            const response = await client.chat.completions.create({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant.'
                    },
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 5
            });

            return true;
        } catch (error) {
            console.error('API key validation error:', error);
            return false;
        }
    }

    public setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        // Save to configuration
        vscode.workspace.getConfiguration('codesage').update('deepseekApiKey', apiKey, true);
        // Initialize OpenAI client
        this.client = new OpenAI({
            baseURL: 'https://api.deepseek.com',
            apiKey: apiKey
        });
    }

    public getModel(): string {
        return this.selectedModel;
    }

    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: { [key: string]: string } = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.go': 'go',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.rs': 'rust',
            '.kt': 'kotlin',
            '.scala': 'scala',
            '.m': 'objective-c',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.less': 'less',
            '.json': 'json',
            '.xml': 'xml',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.md': 'markdown',
            '.sh': 'shell',
            '.bash': 'shell',
            '.zsh': 'shell',
            '.sql': 'sql'
        };
        return languageMap[ext] || 'plaintext';
    }
}
