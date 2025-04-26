/**
 * Logger utility for CodeKarmic
 * 
 * Provides consistent logging functionality throughout the application
 * with support for different log levels and contexts.
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

/**
 * Logger class for consistent logging throughout the application
 */
export class Logger {
    private context: string;
    private static logLevel: LogLevel = LogLevel.INFO;
    
    /**
     * Create a new logger with the specified context
     * @param context The context for this logger (usually the class or module name)
     */
    constructor(context: string) {
        this.context = context;
    }
    
    /**
     * Set the global log level
     * @param level The minimum log level to display
     */
    public static setLogLevel(level: LogLevel): void {
        Logger.logLevel = level;
    }
    
    /**
     * Get the current global log level
     */
    public static getLogLevel(): LogLevel {
        return Logger.logLevel;
    }
    
    /**
     * Log a debug message
     * @param message The message to log
     * @param data Optional data to include with the log
     */
    public debug(message: string, data?: any): void {
        if (Logger.logLevel <= LogLevel.DEBUG) {
            console.debug(`[${this.context}] ${message}`, data !== undefined ? data : '');
        }
    }
    
    /**
     * Log an info message
     * @param message The message to log
     * @param data Optional data to include with the log
     */
    public info(message: string, data?: any): void {
        if (Logger.logLevel <= LogLevel.INFO) {
            console.log(`[${this.context}] ${message}`, data !== undefined ? data : '');
        }
    }
    
    /**
     * Log a warning message
     * @param message The message to log
     * @param data Optional data to include with the log
     */
    public warn(message: string, data?: any): void {
        if (Logger.logLevel <= LogLevel.WARN) {
            console.warn(`[${this.context}] ${message}`, data !== undefined ? data : '');
        }
    }
    
    /**
     * Log an error message
     * @param message The message to log
     * @param error Optional error to include with the log
     */
    public error(message: string, error?: any): void {
        if (Logger.logLevel <= LogLevel.ERROR) {
            console.error(`[${this.context}] ${message}`, error !== undefined ? error : '');
        }
    }
}