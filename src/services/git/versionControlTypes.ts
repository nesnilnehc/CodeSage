/**
 * 版本控制类型定义
 * 
 * 本文件包含与版本控制（主要是Git）相关的所有类型定义。
 */

/**
 * Git提交信息
 */
export interface Commit {
    /** 提交哈希值 */
    hash: string;
    /** 提交消息 */
    message: string;
    /** 作者名称 */
    author: string;
    /** 作者邮箱 */
    email: string;
    /** 提交日期 */
    date: Date;
    /** Whether reviewed */
    reviewed?: boolean;
}

/**
 * 获取提交的选项
 */
export interface GetCommitsOptions {
    /** 最大提交数量 */
    maxCount?: number;
    /** 起始日期 */
    since?: Date;
    /** 结束日期 */
    until?: Date;
    /** 作者 */
    author?: string;
    /** 特定提交哈希 */
    commitHash?: string;
    /** 是否包含合并提交 */
    includeMerges?: boolean;
}

/**
 * 文件变更信息
 */
export interface FileChange {
    /** 文件路径 */
    path: string;
    /** 变更类型（新增、修改、删除等） */
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unchanged';
    /** 旧文件路径（仅适用于重命名） */
    oldPath?: string;
    /** Whether reviewed */
    reviewed?: boolean;
}

/**
 * 差异生成选项
 */
export interface DiffOptions {
    /** 是否忽略空白变更 */
    ignoreWhitespace?: boolean;
    /** 上下文行数 */
    contextLines?: number;
    /** 是否包含统计信息 */
    includeStats?: boolean;
}

/**
 * 差异统计信息
 */
export interface DiffStats {
    /** 添加的行数 */
    additions: number;
    /** 删除的行数 */
    deletions: number;
    /** 修改的文件数 */
    changedFiles: number;
}
