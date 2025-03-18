/**
 * 代码审查类型定义
 * 
 * 本文件包含与代码审查相关的所有类型定义，用于整个应用程序中的类型一致性。
 */

/**
 * 代码审查模式
 */
export enum ReviewMode {
    /** 基于Git提交的审查 */
    GIT_COMMIT = 'git_commit',
    /** 基于VS Code Explorer的文件/文件夹审查 */
    EXPLORER = 'explorer',
    /** 实时编辑审查 */
    REAL_TIME = 'real_time',
    /** 特定领域审查 */
    DOMAIN_SPECIFIC = 'domain_specific'
}

/**
 * 代码审查请求参数
 */
export interface CodeReviewRequest {
    /** 文件路径 */
    filePath: string;
    /** 当前文件内容 */
    currentContent: string;
    /** 之前的文件内容 */
    previousContent: string;
    /** 是否使用压缩 */
    useCompression?: boolean;
    /** 编程语言 */
    language?: string;
    /** 差异内容（用于批处理） */
    diffContent?: string;
    /** 审查模式 */
    reviewMode?: ReviewMode;
    
    // Git提交模式特定字段
    /** Git提交哈希值（用于Git提交模式） */
    commitHash?: string;
    /** 提交信息（用于Git提交模式） */
    commitMessage?: string;
    /** 提交作者（用于Git提交模式） */
    commitAuthor?: string;
    
    // Explorer模式特定字段
    /** 文件夹路径（用于Explorer模式） */
    folderPath?: string;
    /** 是否包含子文件夹（用于Explorer模式） */
    includeSubfolders?: boolean;
    /** 文件过滤器（用于Explorer模式，如*.ts,*.js） */
    fileFilter?: string[];
    
    // 实时编辑模式特定字段
    /** 实时编辑内容（用于实时编辑模式） */
    editingContent?: string;
    /** 光标位置（用于实时编辑模式） */
    cursorPosition?: number;
    /** 编辑历史（用于实时编辑模式） */
    editHistory?: string[];
    /** 上下文窗口大小（用于实时编辑模式） */
    contextWindowSize?: number;
    
    // 特定领域审查特定字段
    /** 特定领域类型（用于特定领域审查） */
    domainType?: DomainType;
    /** 领域特定规则集（用于特定领域审查） */
    domainRules?: string[];
    /** 领域特定上下文（用于特定领域审查） */
    domainContext?: string;
}

/**
 * 代码审查结果
 */
export interface CodeReviewResult {
    /** 建议列表 */
    suggestions: string[];
    /** 评分 */
    score?: number;
    /** 审查模式 */
    reviewMode?: ReviewMode;
    
    // Git提交模式特定结果
    /** 差异内容相关建议 */
    diffSuggestions?: string[];
    /** 整个文件的建议 */
    fullFileSuggestions?: string[];
    /** 差异内容 */
    diffContent?: string;
    /** 提交相关建议 */
    commitSuggestions?: string[];
    
    // Explorer模式特定结果
    /** 文件夹审查结果（用于Explorer模式） */
    folderResults?: Map<string, CodeReviewResult>;
    /** 项目结构建议（用于Explorer模式） */
    structureSuggestions?: string[];
    /** 文件间关系建议（用于Explorer模式） */
    fileRelationSuggestions?: string[];
    
    // 实时编辑模式特定结果
    /** 实时编辑建议 */
    realtimeSuggestions?: string[];
    /** 代码补全建议（用于实时编辑模式） */
    completionSuggestions?: string[];
    /** 重构建议（用于实时编辑模式） */
    refactoringSuggestions?: string[];
    /** 上下文相关建议（用于实时编辑模式） */
    contextualSuggestions?: string[];
    
    // 特定领域审查特定结果
    /** 特定领域建议 */
    domainSpecificSuggestions?: string[];
    /** 领域合规性结果（用于特定领域审查） */
    domainComplianceResults?: {
        compliant: boolean;
        issues: string[];
        recommendations: string[];
    };
    /** 领域特定指标（用于特定领域审查） */
    domainMetrics?: Record<string, number>;
}

/**
 * 代码审查响应
 */
export interface CodeReviewResponse {
    /** 评论列表 */
    comments: string[];
    /** 建议列表 */
    suggestions: string[];
    /** 评分 */
    score: number;
}

/**
 * 代码分析选项
 */
export interface CodeAnalysisOptions {
    /** 是否使用压缩 */
    useCompression: boolean;
    /** 最大令牌数 */
    maxTokens?: number;
    /** 审查模式 */
    reviewMode?: ReviewMode;
    
    // Git提交模式特定选项
    /** 是否包含差异分析，配置参数，默认为false */
    includeDiffAnalysis?: boolean;
    /** 是否包含完整文件分析 */
    includeFullFileAnalysis?: boolean;
    /** 是否分析提交信息 */
    includeCommitMessageAnalysis?: boolean;
    /** 是否分析提交历史 */
    includeCommitHistoryAnalysis?: boolean;
    
    // Explorer模式特定选项
    /** 是否包含项目结构分析 */
    includeStructureAnalysis?: boolean;
    /** 是否包含文件间关系分析 */
    includeFileRelationAnalysis?: boolean;
    /** 是否包含代码重复分析 */
    includeCodeDuplicationAnalysis?: boolean;
    /** 最大分析文件数 */
    maxFilesToAnalyze?: number;
    
    // 实时编辑模式特定选项
    /** 是否包含实时分析 */
    includeRealtimeAnalysis?: boolean;
    /** 是否包含代码补全分析 */
    includeCompletionAnalysis?: boolean;
    /** 是否包含重构分析 */
    includeRefactoringAnalysis?: boolean;
    /** 实时分析延迟（毫秒） */
    realtimeAnalysisDelay?: number;
    
    // 特定领域审查特定选项
    /** 是否包含特定领域分析 */
    includeDomainSpecificAnalysis?: boolean;
    /** 特定领域类型 */
    domainType?: DomainType;
    /** 领域特定规则集 */
    domainRules?: string[];
    /** 领域合规性级别 */
    domainComplianceLevel?: 'strict' | 'moderate' | 'relaxed';
}

/**
 * 特定领域类型
 */
export enum DomainType {
    /** 安全敏感代码 */
    SECURITY = 'security',
    /** 性能关键代码 */
    PERFORMANCE = 'performance',
    /** 可访问性代码 */
    ACCESSIBILITY = 'accessibility',
    /** 国际化代码 */
    INTERNATIONALIZATION = 'internationalization',
    /** 数据处理代码 */
    DATA_PROCESSING = 'data_processing'
}
