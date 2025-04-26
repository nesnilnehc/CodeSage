/**
 * 全局常量定义
 */

/**
 * 日志级别类型
 */
export type LOG_LEVEL = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'debug' | 'info' | 'warning' | 'error' | 'warn';

/**
 * 日志级别映射（用于比较日志级别）
 */
export const LOG_LEVEL: Record<string, number> = {
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
    debug: 0,
    info: 1,
    warning: 2,
    warn: 2,
    error: 3
};

/**
 * 默认日志级别
 */
export const DEFAULT_LOG_LEVEL: LOG_LEVEL = 'INFO';

/**
 * 扩展名称
 */
export const EXTENSION_NAME = 'codekarmic'; 