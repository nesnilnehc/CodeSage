/**
 * AI Model Response Interface
 */
export interface AIModelResponse {
    /** Original content (for backward compatibility) */
    content: string;
    /** Processed text content (mainly for code review) */
    text: string;
    /** Model used */
    model: string;
    /** Usage statistics */
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
};

/**
 * AI model request parameters interface
 */
export interface AIModelRequestParams {
    messages: Array<{
        role: string;
        content: string;
    }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    compressLargeContent?: boolean; // Whether to compress large file content
    compressionThreshold?: number; // File size compression threshold, default is 10000 characters
    [key: string]: any; // Allow other model-specific parameters
}

/**
 * AI model service interface
 * Defines methods that all AI model services must implement
 */
export interface AIModelService {
    /**
     * Initialize the model service
     * @param options Other initialization options
     */
    initialize(options?: Record<string, any>): void;
    
    /**
     * Validate if the API key is valid
     * @param apiKey API key
     */
    validateApiKey(apiKey: string): Promise<boolean>;
    
    /**
     * Create chat completion request
     * @param params Request parameters
     */
    createChatCompletion(params: AIModelRequestParams): Promise<AIModelResponse>;
    
    /**
     * Get the model type
     */
    getModelType(): string;
}

/**
 * Abstract AI model service class
 * Provides common implementations and utility methods
 */
export abstract class AbstractAIModelService implements AIModelService {

    protected modelType: string | undefined;
    protected apiKey: string | undefined;
    protected baseURL: string | undefined;

    abstract initialize(options?: Record<string, any>): void;

    /**
     * Validate if the API key is valid
     * Subclasses should override this method to implement model-specific validation logic
     * @param apiKey API key
     */
    abstract validateApiKey(apiKey: string): Promise<boolean>;
    
    /**
     * Create chat completion request
     * Subclasses should override this method to implement model-specific request logic
     * @param params Request parameters
     */
    abstract createChatCompletion(params: AIModelRequestParams): Promise<AIModelResponse>;

    /**
     * Get the model type
     */
    getModelType(): string {
        return this.modelType ?? 'unknown';
    }

    /**
     * Common retry logic
     * @param operation Operation to retry
     * @param retries Number of retries
     * @param delay Delay between retries (ms)
     */
    protected async retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            console.error(`Operation failed (retries left: ${retries}):`, error);
            
            if (retries > 0) {
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.retryOperation(operation, retries - 1, delay * 2);
            }
            throw error;
        }
    }
}

/**
 * Model Factory Interface
 * Used to create different types of AI model services
 */
export interface AIModelFactory {
    /**
     * Create AI model service
     */
    createModelService(): AIModelService;
    
    /**
     * Get list of supported model types
     */
    getSupportedModelTypes(): string[];
    
    /**
     * Clear cached model service instances
     * @param type Optional, specify the model type to clear; if not specified, clear all.
     */
    clearModelServices(type?: string): void;
}

/**
 * Content Generation Request
 */
export interface ContentGenerationRequest {
    /** System prompt */
    systemPrompt?: string;
    /** User prompt */
    userPrompt: string;
    /** Generation options */
    options?: {
        /** Maximum token count */
        maxTokens?: number;
        /** Temperature */
        temperature?: number;
        /** Whether to compress large content */
        compressLargeContent?: boolean;
        /** Compression threshold */
        compressionThreshold?: number;
        /** Other options */
        [key: string]: any;
    };
}

/**
 * Model Interface
 * Provides high-level interface for interacting with AI models
 */
export interface ModelInterface {
    /**
     * Generate content
     * @param request Content generation request
     */
    generateContent(request: ContentGenerationRequest): Promise<AIModelResponse>;
    
    /**
     * Get model type
     */
    getModelType(): string;
    
    /**
     * Initialize model interface
     * @param options Initialization options
     */
    initialize(options?: Record<string, any>): void;
}