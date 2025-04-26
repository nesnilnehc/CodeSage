import { AbstractAIModelService, AIModelRequestParams, AIModelResponse } from './modelInterface';
import { BaseModel, ChatCompletionOptions } from './baseModel';
import { convertToAIModelResponse } from './chatTypes';

/**
 * 基础模型适配器
 * 将BaseModel适配为AIModelService接口
 */
export class BaseModelAdapter extends AbstractAIModelService {
    private baseModel: BaseModel;
    
    constructor(model: BaseModel, modelType: string) {
        super();
        this.baseModel = model;
        this.modelType = modelType;
    }
    
    /**
     * 初始化模型服务
     */
    initialize(_options?: Record<string, any>): void {
        // BaseModel不需要初始化
        // 这里可以保存一些特定选项
    }
    
    /**
     * 验证API密钥
     * @param _apiKey API密钥
     */
    async validateApiKey(_apiKey: string): Promise<boolean> {
        try {
            // 尝试发送一个简单请求来验证API密钥
            await this.baseModel.createChatCompletion({
                messages: [
                    { role: 'system', content: '你是一个有用的助手。' },
                    { role: 'user', content: '你好' }
                ],
                max_tokens: 5
            });
            return true;
        } catch (error) {
            console.error('API密钥验证失败:', error);
            return false;
        }
    }
    
    /**
     * 创建聊天完成请求
     * @param params 请求参数
     */
    async createChatCompletion(params: AIModelRequestParams): Promise<AIModelResponse> {
        // 转换参数格式
        const options: ChatCompletionOptions = {
            messages: params.messages,
            temperature: params.temperature,
            max_tokens: params.max_tokens,
            compressLargeContent: params.compressLargeContent,
            compressionThreshold: params.compressionThreshold
        };
        
        // 调用基础模型的方法
        const response = await this.baseModel.createChatCompletion(options);
        
        // 转换响应格式
        return convertToAIModelResponse(response);
    }
    
    /**
     * 获取模型类型
     */
    override getModelType(): string {
        return this.modelType || 'base';
    }
} 