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
                timeout: 30 * 1000 // 30 秒超时
            });
        }
    }

    public static getInstance(): AIService {
        if (!AIService.instance) {
            AIService.instance = new AIService();
        }
        return AIService.instance;
    }

    public async reviewCode(params: { filePath: string; currentContent: string; previousContent: string }): Promise<CodeReviewResult> {
        try {
            if (!this.apiKey) {
                throw new Error('DeepSeek API key not set');
            }

            // 使用 DeepSeek API 进行代码审查
            const reviewId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
            const systemPrompt = this.language === 'zh' ?
                `你是一个代码审查专家。请用中文回复。审查编号：${reviewId}` :
                `You are a code review expert. Please reply in English. Review ID: ${reviewId}`;

            const prompt = this.language === 'zh' ?
                `请审查以下代码变更并提供：
1. 具体的问题、bug 或改进建议
2. 代码质量和可维护性的建议
3. 代码质量评分（0-10分）

重要规则：
1. 关注高层次的问题和改进点
2. 只在指出具体问题时引用相关代码片段，且只引用有问题的部分
3. 保持评论简洁和可操作性
4. 不要展示完整的代码文件

文件：${params.filePath}
语言：${this.detectLanguage(params.filePath)}

请按以下格式提供审查意见：
---问题评论---
(列出具体问题，只引用有问题的代码片段)

---改进建议---
(列出可操作的改进建议)

---评分---
(给出 0-10 分的评分)

代码变更：
${params.previousContent}
${params.currentContent}` :
                `Please review the following code changes and provide:
1. Specific comments about potential issues, bugs, or improvements
2. Suggestions for better code quality and maintainability
3. A code quality score from 0 to 10

IMPORTANT RULES:
1. Focus on high-level issues and improvements
2. Only include relevant code snippets when pointing out specific issues, and only show the problematic parts
3. Keep comments concise and actionable
4. DO NOT show the complete code files

File: ${params.filePath}
Language: ${this.detectLanguage(params.filePath)}

Please provide your review in the following format:
---COMMENTS---
(List specific issues, only include problematic code snippets)

---SUGGESTIONS---
(List actionable improvements)

---SCORE---
(Provide a score from 0-10)

Code changes:
${params.previousContent}
${params.currentContent}`;

            if (!this.client) {
                throw new Error('OpenAI client not initialized');
            }

            let response = await this.client.chat.completions.create({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1000
            });

            // 解析 AI 响应
            if (!response) {
                throw new Error('No response from API');
            }
            const aiResponse = response.choices[0].message.content || '';
            const comments: string[] = [];
            const suggestions: string[] = [];
            let score = 0;

            // 提取评论
            const commentsPattern = this.language === 'zh' ? /---问题评论---(.*?)(?=---改进建议---)/s : /---COMMENTS---(.*?)(?=---SUGGESTIONS---)/s;
            const commentsMatch = aiResponse.match(commentsPattern);
            if (commentsMatch) {
                comments.push(...commentsMatch[1].trim().split('\n').filter((c: string) => c.trim()));
            }

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
            console.error('Error reviewing code:', error);
            return {
                suggestions: ['Error: Unable to complete code review.'],
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
