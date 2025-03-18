import { AIModelFactory, AIModelService } from './modelInterface';
import { DeepSeekModelService } from './providers/deepseek';
import { AppConfig } from '../config/appConfig';
import { OUTPUT } from '../i18n/index';
import { ModelType } from './types';

/**
 * Factory configuration interface
 */
export interface ModelFactoryConfig {
    enableLargeFileCompression?: boolean;
    compressionThreshold?: number;
}

/**
 * AI Model Factory Implementation
 * Responsible for creating instances of different types of AI model services.
 */
export class AIModelFactoryImpl implements AIModelFactory {
    private static instance: AIModelFactoryImpl;
    private modelServices: Map<string, AIModelService>;
    private factoryConfig: ModelFactoryConfig;
    
    private constructor(config?: ModelFactoryConfig) {
        this.modelServices = new Map<string, AIModelService>();
        this.factoryConfig = config || { 
            enableLargeFileCompression: true,
            compressionThreshold: 10000 
        };
    }
    
    /**
     * Get factory singleton
     * @param config Optional factory configuration
     */
    public static getInstance(config?: ModelFactoryConfig): AIModelFactoryImpl {
        if (!AIModelFactoryImpl.instance) {
            AIModelFactoryImpl.instance = new AIModelFactoryImpl(config);
        } else if (config) {
            // 更新配置
            AIModelFactoryImpl.instance.updateConfig(config);
        }
        return AIModelFactoryImpl.instance;
    }
    
    /**
     * Update factory configuration
     * @param config New configuration
     */
    public updateConfig(config: Partial<ModelFactoryConfig>): void {
        this.factoryConfig = { ...this.factoryConfig, ...config };
    }
    
    /**
     * Create AI model service
     * Uses cached instances when available
     */
    createModelService(): AIModelService {
        const config = AppConfig.getInstance();
        const modelType = config.getModelType();
        const baseURL = config.getBaseURL();
        const apiKey = config.getApiKey();
        
        if (!modelType) {
            throw new Error(OUTPUT.MODEL.NO_MODEL_TYPE);
        }
        
        if (!baseURL) {
            throw new Error(OUTPUT.MODEL.NO_BASE_URL);
        }
        
        // Create cache key combining model type and base URL
        const cacheKey = `${modelType}:${baseURL}`;
        
        // Check if we have a cached instance
        if (this.modelServices.has(cacheKey) && apiKey) {
            const cachedService = this.modelServices.get(cacheKey);
            if (cachedService) {
                return cachedService;
            }
        }

        // Create a new service instance if not cached
        let service: AIModelService;
        switch (modelType.toLowerCase()) {
            case ModelType.DEEPSEEK_V3:
            case ModelType.DEEPSEEK_R1:
                service = new DeepSeekModelService(modelType, baseURL, apiKey);
                break;
            default:
                const errorMessage = OUTPUT.MODEL.UNSUPPORTED_MODEL_TYPE + modelType;
                throw new Error(errorMessage);
        }
        
        // Initialize the service
        try {
            service.initialize({
                defaultQuery: {
                    compressLargeContent: this.factoryConfig.enableLargeFileCompression,
                    compressionThreshold: this.factoryConfig.compressionThreshold
                }
            });
            
            // Cache the service if API key is available
            if (apiKey) {
                this.modelServices.set(cacheKey, service);
            }
            
            return service;
        } catch (error) {
            console.error(`Failed to initialize model service: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(`Failed to initialize model service: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Get a list of supported model types
     */
    getSupportedModelTypes(): string[] {
        return Object.values(ModelType);
    }
    
    /**
     * Clear cached model service instances
     * @param type Optional, specify the model type to clear; if not specified, clear all.
     */
    clearModelServices(type?: string): void {
        if (type) {
            // Clear specific model type
            for (const [key, _] of this.modelServices.entries()) {
                if (key.startsWith(type)) {
                    this.modelServices.delete(key);
                }
            }
        } else {
            // Clear all cached services
            this.modelServices.clear();
        }
    }
}