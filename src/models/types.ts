/**
 * AI模型类型定义
 * 
 * 本文件包含与AI模型交互相关的所有类型定义。
 */

/**
 * 模型类型枚举
 */
export enum ModelType {
    DEEPSEEK_V3 = 'deepseek-chat',
    DEEPSEEK_R1 = 'deepseek-reasoner',
    OPENAI = 'openai'
}

// 模型显示名称映射
export const ModelDisplayNames = {
    [ModelType.DEEPSEEK_V3]: 'DeepSeek V3',
    [ModelType.DEEPSEEK_R1]: 'DeepSeek R1',
    [ModelType.OPENAI]: 'OpenAI'
};

// 便捷的转换函数
export function getModelTypeDisplayName(type: ModelType): string {
    return ModelDisplayNames[type] || type;
}

// 反向查询函数
export function getModelTypeFromDisplayName(displayName: string): ModelType {
    for (const [key, value] of Object.entries(ModelDisplayNames)) {
        if (value === displayName) return key as ModelType;
    }
    
    // 如果找不到匹配项，则返回默认模型类型
    return ModelType.DEEPSEEK_R1;
}

// 获取所有支持的模型类型
export function getAllModelTypes(): ModelType[] {
    return Object.values(ModelType);
}

/**
 * 模型配置
 */
export interface ModelConfig {
    /** 模型类型 */
    type: ModelType;
    /** 模型名称 */
    name: string;
    /** 模型版本 */
    version?: string;
    /** Maximum token count */
    maxTokens?: number;
    /** Temperature */
    temperature?: number;
    /** 其他模型特定配置 */
    [key: string]: any;
}

/**
 * 模型请求选项
 */
export interface ModelRequestOptions {
    /** Maximum token count */
    maxTokens?: number;
    /** Temperature */
    temperature?: number;
    /** 是否流式输出 */
    stream?: boolean;
    /** 停止序列 */
    stopSequences?: string[];
    /** 超时时间（毫秒） */
    timeoutMs?: number;
}

/**
 * 模型请求
 */
export interface ModelRequest {
    /** 系统提示 */
    systemPrompt?: string;
    /** 用户提示 */
    userPrompt: string;
    /** 请求选项 */
    options?: ModelRequestOptions;
}

/**
 * 模型响应
 */
export interface ModelResponse {
    /** 响应文本 */
    text: string;
    /** 使用的令牌数 */
    usedTokens?: number;
    /** 是否被截断 */
    truncated?: boolean;
    /** 完成原因 */
    finishReason?: 'stop' | 'length' | 'content_filter' | 'timeout' | 'error';
    /** 错误信息 */
    error?: string;
}