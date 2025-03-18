/**
 * Compression Feature Type Definitions
 * 
 * This file contains all type definitions related to content compression, used for handling large file compression and summary generation.
 */

/**
 * Compression Options Configuration
 */
export interface CompressionOptions {
    /** Maximum content length before compression (in characters) */
    maxContentLength: number;
    /** Number of lines to keep at the beginning of the file */
    headerLines: number;
    /** Number of lines to keep at the end of the file */
    footerLines: number;
    /** Sample rate (0-1) for sampling from remaining lines */
    sampleRate: number;
    /** Whether to include compression statistics */
    includeStats: boolean;
    /** Programming language of the file content (for language-specific optimizations) */
    language?: string;
    /** Whether to perform function-level compression */
    functionLevelCompression?: boolean;
    /** Maximum number of context lines around important code blocks */
    contextLines?: number;
}

/**
 * Default Compression Options
 */
export const DEFAULT_COMPRESSION_OPTIONS: CompressionOptions = {
    maxContentLength: 20000,
    headerLines: 30,
    footerLines: 20,
    sampleRate: 0.2,
    includeStats: true,
    language: 'auto',
    functionLevelCompression: true,
    contextLines: 2,
};

/**
 * Compression Statistics
 */
export interface CompressionStats {
    /** Original file size (in characters) */
    originalSize: number;
    /** Compressed file size (in characters) */
    compressedSize: number;
    /** Compression ratio (compressed/original) */
    compressionRatio: number;
    /** Total number of lines in original file */
    totalLines: number;
    /** Number of lines kept in compressed version */
    keptLines: number;
    /** Percentage of lines retained */
    lineRetentionRate: number;
}

/**
 * Large File Processor Options
 */
export interface LargeFileProcessorOptions {
    /** Whether to enable large file processing */
    enabled: boolean;
    /** File size threshold (in characters), files larger than this are considered large */
    sizeThreshold: number;
    /** Compression options */
    compressionOptions: CompressionOptions;
}

/**
 * Default Large File Processor Options
 */
export const DEFAULT_LARGE_FILE_OPTIONS: LargeFileProcessorOptions = {
    enabled: true,
    sizeThreshold: 20000,
    compressionOptions: DEFAULT_COMPRESSION_OPTIONS
};

/**
 * Batch Processing Constants
 */
export const TOKENS_PER_CHAR = 0.25; // Estimated tokens per character
export const MAX_BATCH_TOKENS = 4000; // Maximum tokens per batch
