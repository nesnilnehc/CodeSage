/**
 * Utility functions for retry operations
 */

/**
 * Configuration options for retry operations
 */
export interface RetryOptions {
    maxRetries: number;
    initialDelay: number;
    backoffFactor: number;
    retryableErrors?: (string | RegExp)[];
    onRetry?: (error: any, attempt: number) => void;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 2,       // 减少最大重试次数
    initialDelay: 500,   // 减少初始延迟到500ms
    backoffFactor: 1.5,  // 降低退避因子，加速重试
};

/**
 * Executes an operation with automatic retry capabilities
 * 
 * @param operation The async operation to execute and potentially retry
 * @param options Retry configuration options
 * @returns The result of the operation if successful
 * @throws The last error encountered if all retries fail
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
): Promise<T> {
    const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: any;
    
    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            // Check if we should retry this error
            if (config.retryableErrors && !isRetryableError(error, config.retryableErrors)) {
                throw error; // Don't retry if error doesn't match retryable patterns
            }
            
            if (attempt <= config.maxRetries) {
                // Calculate delay with exponential backoff
                const delay = config.initialDelay * Math.pow(config.backoffFactor, attempt - 1);
                
                // Call the onRetry callback if provided
                if (config.onRetry) {
                    config.onRetry(error, attempt);
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw lastError; // Re-throw the last error when all retries are exhausted
            }
        }
    }
    
    // This should never be reached due to the throw in the loop
    throw lastError;
}

/**
 * Checks if an error should be retried based on patterns
 * 
 * @param error The error to check
 * @param patterns Array of string or RegExp patterns to match against the error
 * @returns True if the error matches any of the retryable patterns
 */
function isRetryableError(error: any, patterns: (string | RegExp)[]): boolean {
    const errorString = error instanceof Error 
        ? error.message 
        : String(error);
    
    return patterns.some(pattern => {
        if (pattern instanceof RegExp) {
            return pattern.test(errorString);
        }
        return errorString.includes(pattern);
    });
}

/**
 * Common retryable error patterns for network requests
 */
export const NETWORK_RETRYABLE_ERRORS = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'socket hang up',
    'network error',
    'timeout',
    'request timed out',
    /^5\d\d$/, // 500-level status codes
    'rate limit',
    'too many requests',
    'Service Unavailable',
];

/**
 * Common retryable error patterns for API requests
 */
export const API_RETRYABLE_ERRORS = [
    ...NETWORK_RETRYABLE_ERRORS,
    'internal server error',
    'backend error',
];
