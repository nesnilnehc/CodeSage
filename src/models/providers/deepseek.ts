import { OpenAI } from 'openai';
import { AbstractAIModelService, AIModelRequestParams, AIModelResponse } from '../modelInterface';
import { ChatCompletionMessageParam } from 'openai/resources';
import { withRetry, API_RETRYABLE_ERRORS } from '../../utils/retryUtils';
import { OUTPUT } from '../../i18n';

/**
 * DeepSeek model service implementation
 */
export class DeepSeekModelService extends AbstractAIModelService {
    private client: OpenAI | undefined;
    private static readonly TIMEOUT = 60 * 1000; // 60 seconds timeout
    
    constructor(modelType: string, baseURL: string, apiKey: string | undefined ) {
        super();
        this.modelType = modelType;
        this.baseURL = baseURL;
        this.apiKey = apiKey;
    }
    
    /**
     * Initialize DeepSeek client
     * @param options Additional initialization options
     */
    initialize(options?: Record<string, any>): void {
        if (!this.apiKey) {
            throw new Error(OUTPUT.MODEL.NO_API_KEY);
        }
        
        this.client = new OpenAI({
            baseURL: this.baseURL,
            apiKey: this.apiKey,
            maxRetries: 0, // We'll handle retries manually
            timeout: DeepSeekModelService.TIMEOUT,
            defaultHeaders: {
                'Content-Type': 'application/json'
            },
            defaultQuery: options?.['defaultQuery']
        });
    }
    
    /**
     * Validate DeepSeek API key
     * @param apiKey API key to validate
     */
    async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const client = new OpenAI({
                baseURL: this.baseURL,
                apiKey: apiKey
            });

            await withRetry(async () => {
                return await client.chat.completions.create({
                    model: this.modelType as string,
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
            }, {
                maxRetries: 2,
                onRetry: (error, attempt) => {
                    console.log(`API key validation retry attempt ${attempt}:`, error);
                }
            });

            return true;
        } catch (error) {
            console.error('DeepSeek API key validation error:', error);
            return false;
        }
    }
    
    /**
     * Create DeepSeek chat completion request
     * @param params Request parameters
     */
    async createChatCompletion(params: AIModelRequestParams): Promise<AIModelResponse> {
        if (!this.client) {
            if (!this.apiKey) {
                throw new Error(OUTPUT.MODEL.NO_API_KEY);
            }
            this.initialize();
        }

        try {
            const response = await this.retryOperation(async () => {
                const messages: ChatCompletionMessageParam[] = params.messages.map(msg => ({
                    role: msg.role as 'user' | 'assistant' | 'system',
                    content: msg.content
                }));
                
                if (!this.client) {
                    throw new Error('DeepSeek client not initialized');
                }
                
                // 检查是否需要处理大文件内容
                if (params.compressLargeContent === true && params.messages && params.messages.some(msg => msg.content && msg.content.length > 10000)) {
                    for (let i = 0; i < messages.length; i++) {
                        const msg = messages[i];
                        if (!msg) continue;
                        
                        const content = msg.content;
                        if (content && typeof content === 'string' && content.length > 10000) {
                            messages[i]!.content = this.compressLargeContent(content);
                        }
                    }
                }
                
                return await this.client.chat.completions.create({
                    model: this.modelType || '',
                    messages,
                    temperature: params.temperature || null,
                    max_tokens: params.max_tokens || null
                });
            });

            return {
                content: response.choices[0].message.content || '',
                text: response.choices[0].message.content || '',
                model: response.model,
                usage: {
                    promptTokens: response.usage?.prompt_tokens,
                    completionTokens: response.usage?.completion_tokens,
                    totalTokens: response.usage?.total_tokens
                }
            };
        } catch (error) {
            console.error('DeepSeek API error:', error);
            throw new Error(`API request failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Compress large content for better processing of large files
     * @param content Content to compress
     * @returns Compressed content
     */
    private compressLargeContent(content: string): string {
        // 实现大文件压缩算法
        if (!content || content.length <= 10000) return content;
        
        const lines = content.split('\n');
        
        // 提取文件头信息（前10行）
        const header = lines.slice(0, Math.min(10, lines.length)).join('\n');
        
        // 提取文件尾信息（后10行）
        const footer = lines.slice(Math.max(0, lines.length - 10)).join('\n');
        
        // 计算代码统计信息
        const totalLines = lines.length;
        const emptyLines = lines.filter(line => line.trim() === '').length;
        const commentLines = lines.filter(line => 
            line.trim().startsWith('//') || 
            line.trim().startsWith('/*') || 
            line.trim().startsWith('*')
        ).length;
        
        // 从文件主体均匀采样100行
        const samplingRate = Math.max(1, Math.floor(lines.length / 100));
        const sampledLines = [];
        for (let i = 10; i < lines.length - 10; i += samplingRate) {
            sampledLines.push(lines[i]);
        }
        const body = sampledLines.join('\n');
        
        // 组合压缩后的内容
        return `[FILE HEADER]\n${header}\n\n[FILE STATISTICS]\nTotal lines: ${totalLines}\nEmpty lines: ${emptyLines}\nComment lines: ${commentLines}\nEffective code lines: ${totalLines - emptyLines - commentLines}\n\n[SAMPLED CONTENT]\n${body}\n\n[FILE FOOTER]\n${footer}`;
    }
    
    /**
     * Get the model type
     */
    override getModelType(): string {
        return this.modelType || '';
    }
    
    /**
     * Retry operation with error handling
     * @param operation Operation to retry
     */
    protected override async retryOperation(operation: () => Promise<any>): Promise<any> {
        try {
            return await withRetry(operation, {
                retryableErrors: API_RETRYABLE_ERRORS,
                onRetry: (error, attempt) => {
                    console.log(`API request retry attempt ${attempt}:`, error);
                }
            });
        } catch (error) {
            console.error('API request failed:', error);
            throw new Error(`API request failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}