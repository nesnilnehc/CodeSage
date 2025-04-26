/**
 * 聊天消息类型定义
 */

import { OpenAI } from 'openai';
import { AIModelResponse } from './modelInterface';

/**
 * 聊天消息类型
 */
export interface ChatMessage {
    /**
     * 消息角色：system、user 或 assistant
     */
    role: 'system' | 'user' | 'assistant';
    
    /**
     * 消息内容
     */
    content: string;
    
    /**
     * 消息名称（可选）
     */
    name?: string;
}

/**
 * 聊天完成响应类型
 */
export interface ChatCompletionResponse {
    /**
     * 响应ID
     */
    id: string;
    
    /**
     * 模型名称
     */
    model: string;
    
    /**
     * 创建时间（UNIX时间戳）
     */
    created: number;
    
    /**
     * 对象类型
     */
    object: string;
    
    /**
     * 响应选项
     */
    choices: Array<{
        /**
         * 消息内容
         */
        message: {
            role: string;
            content: string | null;
        };
        
        /**
         * 完成原因
         */
        finish_reason: 'stop' | 'length' | 'content_filter' | 'null' | null;
        
        /**
         * 选项索引
         */
        index: number;
    }>;
    
    /**
     * 使用的令牌计数
     */
    usage?: {
        /**
         * 提示令牌数
         */
        prompt_tokens: number;
        
        /**
         * 完成令牌数
         */
        completion_tokens: number;
        
        /**
         * 总令牌数
         */
        total_tokens: number;
    };
}

/**
 * 从OpenAI库中导出的重命名类型
 * 这样做是为了让代码可以逐步迁移到直接使用OpenAI SDK类型
 */
export type OpenAIChatMessage = OpenAI.Chat.ChatCompletionMessage;
export type OpenAIChatCompletionResponse = OpenAI.Chat.ChatCompletion;

/**
 * 转换自定义ChatMessage到OpenAI ChatCompletionMessageParam
 */
export function convertToOpenAIMessage(message: ChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
    return {
        role: message.role,
        content: message.content,
        name: message.name
    };
}

/**
 * 转换ChatCompletionResponse到AIModelResponse
 */
export function convertToAIModelResponse(response: ChatCompletionResponse): AIModelResponse {
    const content = response.choices[0]?.message.content || '';
    
    return {
        content,
        text: content,
        model: response.model,
        usage: response.usage ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens
        } : undefined
    };
} 