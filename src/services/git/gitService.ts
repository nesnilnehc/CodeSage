import simpleGit, { SimpleGit, DiffResultTextFile } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { NotificationManager } from '../notification/notificationManager';
import { OUTPUT } from '../../i18n';

const execAsync = promisify(exec);

export interface CommitFilter {
    since?: string;
    until?: string;
    maxCount?: number;
    branch?: string;
}

export interface CommitFile {
    path: string;
    content: string;
    previousContent: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'binary';
    insertions: number;
    deletions: number;
}

export interface CommitInfo {
    hash: string;
    date: string;
    message: string;
    author: string;
    authorEmail: string;
    files: string[];
}

interface Commit {
    hash: string;
    date: string;
    message: string;
    author_name: string;
    author_email: string;
}

export class GitService {
    private git: SimpleGit | null = null;
    private repoPath: string = '';
    private commits: CommitInfo[] = [];
    private currentFilter: CommitFilter = {};

    constructor() {
        // 不再记录初始化消息，因为setRepository方法中已经有相关日志
        // 避免重复输出"已初始化服务"
    }
    
    /**
     * Check if the GitService is initialized with a valid repository
     * @returns true if initialized with a repository and git instance
     */
    public isInitialized(): boolean {
        return this.repoPath !== '' && this.git !== null;
    }

    public async setRepository(repoPath: string): Promise<void> {
        try {
            // 检查是否与当前仓库路径相同，如果相同则跳过初始化
            if (this.repoPath === repoPath && this.git !== null) {
                // 如果路径相同，且git实例已创建，则不需要重新初始化 - 也不需要记录日志
                return;
            }
            
            // 设置新仓库路径时输出日志
            this.logDebug(`${OUTPUT.DEBUG.SETTING_REPO_PATH} ${repoPath}`);
            
            // 使用同步操作检查路径是否存在，这是快速操作
            if (!fs.existsSync(repoPath)) {
                const errorMsg = `Repository path does not exist: ${repoPath}`;
                this.logError(new Error(errorMsg), OUTPUT.GIT.FAILED_TO_SET_REPOSITORY);
                throw new Error(errorMsg);
            }
            
            // 检查.git目录是否存在，这也是快速操作
            const gitDir = path.join(repoPath, '.git');
            if (!fs.existsSync(gitDir)) {
                const errorMsg = `Not a git repository - .git directory not found in ${repoPath}`;
                this.logError(new Error(errorMsg), OUTPUT.GIT.FAILED_TO_SET_REPOSITORY);
                throw new Error(errorMsg);
            }
            
            // 设置仓库路径和初始化simple-git
            this.repoPath = repoPath;
            this.git = simpleGit({
                baseDir: repoPath,
                binary: 'git',
                maxConcurrentProcesses: 6, // 增加并发进程数
                trimmed: true, // 自动修剪输出
            });
            
            // 重置过滤器和缓存
            this.currentFilter = {};
            this.commits = [];
            
            // 移除不必要的日志输出
        } catch (error) {
            this.logError(error as Error, OUTPUT.GIT.FAILED_TO_SET_REPOSITORY);
            throw error;
        }
    }

    public async getCommitFiles(commitId: string): Promise<CommitFile[]> {
        try {
            if (!this.git) {
                throw new Error('Git service not initialized');
            }

            // Get the list of changed files
            const diffSummary = await this.git.diffSummary([`${commitId}^`, commitId]);
            const files: CommitFile[] = [];

            for (const file of diffSummary.files) {
                try {
                    let currentContent = '';
                    let previousContent = '';
                    let status: CommitFile['status'];
                    
                    // 根据文件状态获取内容
                    if (file.binary) {
                        // 二进制文件
                        currentContent = '(Binary File)';
                        previousContent = '(Binary File)';
                        status = 'binary';
                    } else if (file.deletions === 0) {
                        // 新文件
                        currentContent = await this.git.show([`${commitId}:${file.file}`]).catch(() => '(Empty File)');
                        previousContent = '(New File)';
                        status = 'added';
                    } else if (file.insertions === 0) {
                        // 删除的文件
                        currentContent = '(Deleted File)';
                        previousContent = await this.git.show([`${commitId}^:${file.file}`]).catch(() => '(Empty File)');
                        status = 'deleted';
                    } else {
                        // 修改的文件
                        currentContent = await this.git.show([`${commitId}:${file.file}`]).catch(() => '(Empty File)');
                        previousContent = await this.git.show([`${commitId}^:${file.file}`]).catch(() => '(Empty File)');
                        status = 'modified';
                    }
                    
                    const stats = (file as DiffResultTextFile);
                    files.push({
                        path: file.file,
                        content: currentContent,
                        previousContent: previousContent,
                        status,
                        insertions: 'binary' in file ? 0 : stats.insertions || 0,
                        deletions: 'binary' in file ? 0 : stats.deletions || 0
                    });
                } catch (error) {
                    this.logError(error as Error, OUTPUT.GIT.ERROR_GETTING_COMMIT_FILE_CONTENT(file.file));
                    // 即使出错也添加文件，只是内容为空
                    const stats = (file as DiffResultTextFile);
                    files.push({
                        path: file.file,
                        content: '(Error: Unable to load file content)',
                        previousContent: '(Error: Unable to load file content)',
                        status: 'binary' in file ? 'binary' : 'modified',
                        insertions: 'binary' in file ? 0 : stats.insertions || 0,
                        deletions: 'binary' in file ? 0 : stats.deletions || 0
                    });
                }
            }

            return files;
        } catch (error) {
            this.logError(error as Error, OUTPUT.GIT.ERROR_GETTING_COMMIT_FILES);
            return [];
        }
    }

    public async isGitRepository(): Promise<boolean> {
        try {
            // 首先检查Git服务是否已初始化
            if (!this.git) {
                // 不再记录错误，只是返回false
                return false;
            }
            
            // Try to run a simple git command to verify
            const result = await this.git.raw(['rev-parse', '--is-inside-work-tree']);
            return result.trim() === 'true';
        } catch (error) {
            this.logError(error as Error, OUTPUT.GIT.ERROR_CHECKING_GIT_REPOSITORY);
            return false;
        }
    }

    public async getCommits(filter?: CommitFilter): Promise<CommitInfo[]> {
        try {
            // 移除不必要的日志输出
            
            if (!this.git) {
                this.logError(new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED), OUTPUT.GIT.FAILED_TO_GET_COMMITS);
                throw new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED);
            }
            
            // Apply filter if provided, otherwise use current filter
            const activeFilter = filter || this.currentFilter;
            
            // If we have cached commits and no new filter is provided, return cached commits
            if (this.commits.length > 0 && !filter) {
                return this.commits;
            }
            
            // Try different methods to get commits
            try {
                // Method 1: Use simple-git
                const commits = await this.getCommitsWithSimpleGit(activeFilter);
                
                // Cache commits if successful and using current filter
                if (!filter) {
                    this.commits = commits;
                }
                
                return commits;
            } catch (error) {
                this.logError(error as Error, OUTPUT.GIT.ERROR_GETTING_COMMITS_SIMPLE_GIT);
                
                // Method 2: Use direct git command
                const commits = await this.getCommitsWithDirectCommand(activeFilter);
                
                // Cache commits if successful and using current filter
                if (!filter) {
                    this.commits = commits;
                }
                
                return commits;
            }
        } catch (error) {
            this.logError(error as Error, OUTPUT.GIT.ERROR_GETTING_COMMITS);
            throw error;
        }
    }

    public async getCommitById(commitId: string): Promise<CommitInfo[]> {
        try {
            this.logDebug(OUTPUT.GIT.GETTING_COMMIT_BY_ID(commitId));
            
            if (!this.git) {
                this.logError(new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED), OUTPUT.GIT.FAILED_TO_GET_COMMIT);
                throw new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED);
            }
            
            // First check if the commit is in the cache
            const cachedCommit = this.commits.find(c => c.hash.startsWith(commitId));
            if (cachedCommit) {
                this.logDebug(OUTPUT.GIT.FOUND_COMMIT_IN_CACHE(commitId));
                return [cachedCommit];
            }
            
            // Try different methods to get the commit
            try {
                // Method 1: Use simple-git
                this.logDebug(OUTPUT.GIT.TRYING_GET_COMMIT_SIMPLE_GIT);
                return await this.getCommitByIdWithSimpleGit(commitId);
            } catch (error) {
                this.logError(error as Error, OUTPUT.GIT.ERROR_GETTING_COMMIT_SIMPLE_GIT);
                
                // Method 2: Use direct git command
                this.logDebug(OUTPUT.GIT.TRYING_GET_COMMIT_DIRECT);
                return await this.getCommitByIdWithDirectCommand(commitId);
            }
        } catch (error) {
            this.logError(error as Error, OUTPUT.GIT.ERROR_GETTING_COMMIT_BY_ID);
            throw error;
        }
    }

    public async getBranches(): Promise<string[]> {
        try {
            this.logDebug(OUTPUT.GIT.GETTING_BRANCHES);
            
            if (!this.git) {
                this.logError(new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED), OUTPUT.GIT.FAILED_TO_GET_BRANCHES);
                throw new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED);
            }
            
            // Try different methods to get branches
            try {
                // Method 1: Use simple-git
                this.logDebug(OUTPUT.GIT.TRYING_GET_BRANCHES_SIMPLE_GIT);
                const branchSummary = await this.git.branch();
                return Object.keys(branchSummary.branches);
            } catch (error) {
                this.logError(error as Error, OUTPUT.GIT.ERROR_GETTING_BRANCHES_SIMPLE_GIT);
                
                // Method 2: Use direct git command
                this.logDebug(OUTPUT.GIT.TRYING_GET_BRANCHES_DIRECT);
                const { stdout } = await execAsync('git branch', { cwd: this.repoPath });
                
                return stdout
                    .split('\n')
                    .filter(line => line.trim() !== '')
                    .map(line => line.replace('*', '').trim());
            }
        } catch (error) {
            this.logError(error as Error, OUTPUT.GIT.ERROR_GETTING_BRANCHES);
            throw error;
        }
    }

    public async getFileContent(commitHash: string, filePath: string): Promise<string> {
        try {
            console.log(OUTPUT.GIT.GETTING_FILE_CONTENT(filePath, commitHash));
            
            if (!this.git) {
                console.error('Git not initialized');
                throw new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED);
            }
            
            try {
                // Try to get the file content at the specified commit
                const content = await this.git.show([`${commitHash}:${filePath}`]);
                return content;
            } catch (error) {
                // If the file doesn't exist at this commit, return empty string
                const err = error as Error;
                if (err.message.includes('exists on disk, but not in')) {
                    return '';
                }
                throw error;
            }
        } catch (error) {
            console.error(OUTPUT.GIT.ERROR_GETTING_FILE_CONTENT(String(error)));
            // Return empty string if file doesn't exist
            return '';
        }
    }

    /**
     * 获取文件在指定提交中的大小
     * @param commitHash 提交哈希
     * @param filePath 文件路径
     * @returns 文件大小（字节）
     */

    
    /**
     * 检查文件是否存在于指定的提交中
     * @param commitHash 提交哈希
     * @param filePath 文件路径
     * @returns 文件是否存在
     */
    private async doesFileExistInCommit(commitHash: string, filePath: string): Promise<boolean> {
        try {
            const { stdout } = await execAsync(
                `git ls-tree -r ${commitHash} -- "${filePath}"`,
                { cwd: this.repoPath }
            );
            
            return stdout.trim().length > 0;
        } catch (error) {
            console.error(`检查文件 ${filePath} 在提交 ${commitHash} 中是否存在时出错:`, error);
            throw error;
        }
    }

    /**
     * 使用VS Code Git API获取差异（最快的方法）
     */
    private async getVSCodeGitDiff(filePath: string): Promise<string | null> {
        try {
            // 使用VS Code的Git扩展API获取差异
            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (!gitExtension) return null;
            
            const api = gitExtension.getAPI(1);
            if (!api || !api.repositories || api.repositories.length === 0) return null;
            
            const repo = api.repositories[0];
            const uri = vscode.Uri.file(path.resolve(this.repoPath, filePath));
            
            // 防止类型错误：确保 diffResult 是字符串
            let diffResult: string | null = null;
            try {
                const result = await repo.diffWithHEAD(uri);
                // 确保结果是字符串
                if (typeof result === 'string') {
                    diffResult = result;
                } else if (result && typeof result.toString === 'function') {
                    // 如果结果是对象但有 toString 方法
                    diffResult = result.toString();
                }
            } catch (diffError) {
                console.log('VS Code Git diffWithHEAD error:', diffError);
                return null;
            }
            
            if (diffResult && typeof diffResult === 'string' && diffResult.trim().length > 10) {
                return diffResult;
            }
            return null;
        } catch (error) {
            console.log('VS Code Git API error:', error);
            return null;
        }
    }

    /**
     * 使用直接的Git命令获取差异（速度中等）
     * @param commitHash 提交哈希
     * @param filePath 文件路径
     * @param ignoreWhitespace 是否忽略空白符变更
     * @param fileExtensionFilter 文件类型过滤器（例如 *.py）
     */
    private async getDirectCommandDiff(
        commitHash: string, 
        filePath: string, 
        ignoreWhitespace: boolean = true,
        fileTypeFilter?: string
    ): Promise<string | null> {
        const execAsync = promisify(exec);
        try {
            // 准备多种命令尝试获取差异
            const commands: Array<{cmd: string}> = [];
            
            // 方法1: 使用show命令（对新增文件和单文件历史查看有效）
            // 这种方法对于某些文件类型更可靠，如SQL文件
            const showDiffCommand = `git show ${commitHash} -- "${filePath}"`;
            commands.push({ cmd: showDiffCommand });
            
            // 方法2: 标准diff命令
            let standardCommand = `git diff --unified=3`;
            if (ignoreWhitespace) standardCommand += ` -b`;
            
            // 添加文件类型过滤器（如果有）
            if (fileTypeFilter) {
                standardCommand += ` --diff-filter=${fileTypeFilter}`;
            }
            
            // 精确指定提交范围，只显示当前提交的变更
            standardCommand += ` ${commitHash}^ ${commitHash} -- "${filePath}"`;
            commands.push({ cmd: standardCommand });
            
            // 方法3: 使用无前缀的diff命令（备用方案）
            let alternativeCommand = `git diff --unified=3 --no-prefix`;
            if (ignoreWhitespace) alternativeCommand += ` -b`;
            alternativeCommand += ` ${commitHash}^ ${commitHash} -- "${filePath}"`;
            commands.push({ cmd: alternativeCommand });
            
            // 方法4: 直接比较文件内容（对于标准diff命令失败的情况）
            commands.push({ cmd: `git show ${commitHash}^:"${filePath}"` }); // 获取父提交版本
            commands.push({ cmd: `git show ${commitHash}:"${filePath}"` });  // 获取当前提交版本
            
            // 依次尝试所有命令
            let parentContent: string | null = null;
            let currentContent: string | null = null;
            
            for (const { cmd } of commands) {                
                try {
                    const { stdout } = await execAsync(
                        cmd,
                        { cwd: this.repoPath, maxBuffer: 10 * 1024 * 1024 }
                    );
                    
                    if (stdout && stdout.trim().length > 0) {
                        // 检查是否是获取单个文件内容的命令
                        if (cmd.includes(`git show ${commitHash}^:`)) {
                            parentContent = stdout;
                            continue; // 继续处理其他命令
                        } else if (cmd.includes(`git show ${commitHash}:`)) {
                            currentContent = stdout;
                            continue; // 继续处理其他命令
                        }
                        
                        // 如果是diff命令，直接返回结果
                        return stdout;
                    }
                } catch (error) {
                    // 继续尝试下一个命令
                }
            }
            
            // 如果我们成功获取了两个版本的文件内容，智能生成只包含实际变更的diff
            if (parentContent !== null && currentContent !== null) {
                const parentLines = parentContent.split('\n');
                const currentLines = currentContent.split('\n');
                
                // 找出实际变更的行
                const changedLines: Array<{type: 'add' | 'remove' | 'change', oldIndex: number, newIndex: number, content: string}> = [];
                
                // 使用最长公共子序列算法的简化版本找出差异
                let i = 0;
                let j = 0;
                
                while (i < parentLines.length || j < currentLines.length) {
                    if (i < parentLines.length && j < currentLines.length && parentLines[i] === currentLines[j]) {
                        // 相同的行，跳过
                        i++;
                        j++;
                    } else {
                        // 找到不同的行，尝试向前看是否可以匹配
                        let foundMatch = false;
                        
                        // 向前看最多5行，尝试匹配
                        for (let lookAhead = 1; lookAhead <= 5 && i + lookAhead < parentLines.length && j < currentLines.length; lookAhead++) {
                            if (parentLines[i + lookAhead] === currentLines[j]) {
                                // 找到匹配，这意味着有行被删除
                                for (let k = 0; k < lookAhead; k++) {
                                    // 确保 content 不会是 undefined
                                    const lineContent = parentLines[i + k] || '';
                                    changedLines.push({type: 'remove', oldIndex: i + k, newIndex: -1, content: lineContent});
                                }
                                i += lookAhead;
                                foundMatch = true;
                                break;
                            }
                        }
                        
                        if (!foundMatch) {
                            // 尝试在新文件中向前看
                            for (let lookAhead = 1; lookAhead <= 5 && j + lookAhead < currentLines.length && i < parentLines.length; lookAhead++) {
                                if (currentLines[j + lookAhead] === parentLines[i]) {
                                    // 找到匹配，这意味着有行被添加
                                    for (let k = 0; k < lookAhead; k++) {
                                        // 确保 content 不会是 undefined
                                        const lineContent = currentLines[j + k] || '';
                                        changedLines.push({type: 'add', oldIndex: -1, newIndex: j + k, content: lineContent});
                                    }
                                    j += lookAhead;
                                    foundMatch = true;
                                    break;
                                }
                            }
                        }
                        
                        if (!foundMatch) {
                            // 如果仍然没有匹配，则认为是行被修改
                            // 确保行内容不会是 undefined
                            const oldLine = parentLines[i] || '';
                            const newLine = currentLines[j] || '';
                            changedLines.push({type: 'change', oldIndex: i, newIndex: j, 
                                content: `- ${oldLine}\n+ ${newLine}`});
                            i++;
                            j++;
                        }
                    }
                }
                
                // 处理剩余的行
                while (i < parentLines.length) {
                    // 确保 content 不会是 undefined
                    const lineContent = parentLines[i] || '';
                    changedLines.push({type: 'remove', oldIndex: i, newIndex: -1, content: lineContent});
                    i++;
                }
                
                while (j < currentLines.length) {
                    // 确保 content 不会是 undefined
                    const lineContent = currentLines[j] || '';
                    changedLines.push({type: 'add', oldIndex: -1, newIndex: j, content: lineContent});
                    j++;
                }
                
                // 如果变更很少（少于总行数的10%），只显示变更的部分
                if (changedLines.length < Math.min(parentLines.length, currentLines.length) * 0.1) {
                    // 合并相邻的变更区域
                    const regions: Array<{start: number, end: number, lines: string[]}> = [];
                    let currentRegion: {start: number, end: number, lines: string[]} | null = null;
                    
                    for (const change of changedLines) {
                        // 确保 lineNum 始终是数字，不会是 undefined
                        const lineNum = change.type === 'remove' ? change.oldIndex : (change.newIndex !== -1 ? change.newIndex : 0);
                        // 确保 content 始终是字符串
                        const content = change.type === 'change' ? change.content : 
                                        (change.type === 'add' ? `+ ${change.content}` : `- ${change.content}`);
                        
                        if (currentRegion === null) {
                            currentRegion = {start: lineNum, end: lineNum, lines: [content]};
                        } else if (lineNum <= currentRegion.end + 3) { // 如果行距离当前区域不超过3行，合并
                            currentRegion.end = lineNum;
                            currentRegion.lines.push(content);
                        } else { // 否则创建新区域
                            regions.push(currentRegion);
                            currentRegion = {start: lineNum, end: lineNum, lines: [content]};
                        }
                    }
                    
                    if (currentRegion !== null) {
                        regions.push(currentRegion);
                    }
                    
                    // 生成精简的diff格式，只包含变更区域
                    let diffContent = `--- a/${filePath}\n+++ b/${filePath}\n`;
                    
                    for (const region of regions) {
                        // 添加上下文行（最多3行）
                        const contextStart = Math.max(0, region.start - 3);
                        const contextEnd = Math.min(Math.max(parentLines.length, currentLines.length) - 1, region.end + 3);
                        
                        diffContent += `@@ -${contextStart+1},${contextEnd-contextStart+1} +${contextStart+1},${contextEnd-contextStart+1} @@\n`;
                        
                        // 添加上下文行
                        for (let k = contextStart; k <= contextEnd; k++) {
                            if (k < region.start || k > region.end) {
                                // 上下文行
                                if (k < parentLines.length) {
                                    diffContent += ` ${parentLines[k]}\n`;
                                }
                            } else {
                                // 变更行
                                const changeIndex = changedLines.findIndex(c => 
                                    (c.type === 'remove' && c.oldIndex === k) || 
                                    (c.type === 'add' && c.newIndex === k) || 
                                    (c.type === 'change' && (c.oldIndex === k || c.newIndex === k)));
                                
                                if (changeIndex >= 0) {
                                    const change = changedLines[changeIndex];
                                    // 确保 change 存在且具有所需的属性
                                    if (change && change.type) {
                                        if (change.type === 'change') {
                                            diffContent += `${change.content}\n`;
                                        } else if (change.type === 'add' || change.type === 'remove') {
                                            diffContent += `${change.type === 'add' ? '+' : '-'} ${change.content}\n`;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    return diffContent;
                } else {
                    // 如果变更较多，使用标准diff格式
                    const execAsync = promisify(exec);
                    try {
                        // 尝试使用git diff命令生成更精简的diff
                        const { stdout } = await execAsync(
                            `git diff --unified=3 --minimal ${commitHash}^ ${commitHash} -- "${filePath}"`,
                            { cwd: this.repoPath, maxBuffer: 10 * 1024 * 1024 }
                        );
                        
                        if (stdout && stdout.trim().length > 0) {
                            return stdout;
                        }
                    } catch (error) {
                        // 如果失败，回退到简单的diff格式
                    }
                    
                    // 生成简单的diff格式
                    let diffContent = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${parentLines.length} +1,${currentLines.length} @@\n`;
                    
                    // 添加父版本内容（前缀为-）
                    for (const line of parentLines) {
                        diffContent += `-${line}\n`;
                    }
                    
                    // 添加当前版本内容（前缀为+）
                    for (const line of currentLines) {
                        diffContent += `+${line}\n`;
                    }
                    
                    return diffContent;
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }


    


    /**
     * 获取文件差异的主方法 - 优化版本
     * 使用策略模式根据文件大小和环境选择最佳方法
     * 对大型文件使用压缩算法生成摘要差异，以提高性能
     */
    /**
     * 从文件路径中提取文件扩展名
     * @param filePath 文件路径
     * @returns 文件扩展名（带点，如 .py）
     */
    private getFileExtension(filePath: string): string {
        return path.extname(filePath).toLowerCase();
    }

    /**
     * 根据文件扩展名生成文件类型过滤器
     * @param ext 文件扩展名（如 .py）
     * @returns 配置给git diff的文件类型过滤器（如 '*.py'）
     */
    private getFileTypeFilter(ext: string): string | undefined {
        if (!ext) return undefined;
        return `'*${ext}'`;
    }

    /**
     * 获取指定提交中文件的差异
     * 使用多种策略尝试获取差异，优先使用Git命令
     * @param commitHash 提交哈希
     * @param filePath 文件路径
     * @returns 文件差异内容
     */
    public async getFileDiff(commitHash: string, filePath: string): Promise<string> {
        try {
            if (!this.git) {
                throw new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED);
            }

            // 获取文件扩展名以用于类型过滤
            const fileExt = this.getFileExtension(filePath);
            const fileTypeFilter = this.getFileTypeFilter(fileExt);
            
            // 记录试图的方法和结果
            const diagnostics: string[] = [];
            
            // 策略1: 尝试VS Code Git API (最快)
            const vscodeDiff = await this.getVSCodeGitDiff(filePath);
            if (vscodeDiff) {
                return vscodeDiff;
            }
            diagnostics.push("VS Code Git API方法失败");
            
            // 策略2: 使用优化的Git命令
            const directDiff = await this.getDirectCommandDiff(
                commitHash, 
                filePath, 
                true, // 忽略空白字符变更
                fileTypeFilter // 文件类型过滤
            );
            if (directDiff) {
                return directDiff;
            }
            diagnostics.push("直接Git命令方法失败");
            
            // 策略3: 使用simple-git库
            try {
                const diffContent = await this.git.diff([
                    '--unified=3',
                    '-b', // 忽略空白字符变更
                    `${commitHash}^`,
                    commitHash,
                    '--',
                    filePath
                ]);
                
                if (diffContent && diffContent.trim().length > 0) {
                    return diffContent;
                }
                diagnostics.push("simple-git库方法失败");
            } catch (error) {
                diagnostics.push(`simple-git库方法异常: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // 检查提交是否存在
            try {
                const commitExists = await this.doesCommitExist(commitHash);
                if (!commitExists) {
                    return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,3 @@\n+// 提交 ${commitHash} 不存在\n+// 请确认提交哈希是否正确\n+// 或者该提交可能尚未推送到当前仓库\n`;
                }
            } catch (error) {
                diagnostics.push(`检查提交存在异常: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // 策略4: 处理新增文件的特殊情况
            try {
                // 检查文件在当前提交中是否存在
                const fileContent = await this.getFileContent(commitHash, filePath);
                if (!fileContent) {
                    return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,0 +1,2 @@\n+// 文件在提交 ${commitHash} 中不存在\n+// 请确认文件路径是否正确或者该文件可能在该提交中被删除`;
                }
                
                // 检查是否为新增文件（在父提交中不存在）
                const parentExists = await this.doesFileExistInCommit(`${commitHash}^`, filePath).catch(() => false);
                if (!parentExists) {
                    const lines = fileContent.split('\n');
                    return `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n+${fileContent.replace(/\n/g, '\n+')}`;  
                }
                
                // 文件存在但无法获取差异
                diagnostics.push("文件存在于当前提交和父提交中，但无法获取差异");
            } catch (error) {
                diagnostics.push(`检查文件存在异常: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // 所有方法都失败，返回详细的错误信息
            return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,${diagnostics.length + 4} @@\n+// 无法获取文件差异\n+// 文件: ${filePath}\n+// 提交: ${commitHash}\n+// 试图的方法和结果:\n+${diagnostics.map(d => `// - ${d}`).join('\n+')}\n+// 建议: 尝试使用 git show ${commitHash}:${filePath} 查看文件内容`;
        } catch (error) {
            return `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,1 +1,3 @@\n+// 获取差异时发生未预期错误: ${error instanceof Error ? error.message : String(error)}\n+// 文件: ${filePath}\n+// 提交: ${commitHash}\n`;
        }
    }
    
    /**
     * 检查提交是否存在
     * @param commitHash 提交哈希
     * @returns 如果提交存在返回 true，否则返回 false
     */
    private async doesCommitExist(commitHash: string): Promise<boolean> {
        try {
            const { stdout } = await promisify(exec)(
                `git cat-file -t ${commitHash}`,
                { cwd: this.repoPath }
            );
            return stdout.trim() === 'commit';
        } catch (error) {
            return false;
        }
    }

    public getCommitInfo(commitHash: string): CommitInfo | undefined {
        return this.commits.find(commit => commit.hash === commitHash);
    }

    public async setDateFilter(since: string, until: string): Promise<void> {
        this.logDebug(OUTPUT.GIT.SETTING_DATE_FILTER(since, until));
        this.currentFilter = {
            ...this.currentFilter,
            since,
            until
        };
        
        // Clear cached commits when filter changes
        this.commits = [];
    }

    public async setBranchFilter(branch: string): Promise<void> {
        this.logDebug(OUTPUT.GIT.SETTING_BRANCH_FILTER(branch));
        this.currentFilter = {
            ...this.currentFilter,
            branch
        };
        
        // Clear cached commits when filter changes
        this.commits = [];
    }

    public clearFilters(): void {
        console.log(OUTPUT.GIT.CLEARING_FILTERS);
        this.currentFilter = {};
        
        // Clear cached commits when filter changes
        this.commits = [];
    }

    public async getCommitsWithSimpleGit(filter: CommitFilter): Promise<CommitInfo[]> {
        if (!this.git) {
            throw new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED);
        }
        
        const filterStr = filter && Object.keys(filter).length > 0 ? JSON.stringify(filter) : OUTPUT.GIT.EMPTY_FILTER;
        this.logDebug(OUTPUT.GIT.GETTING_COMMITS_WITH_SIMPLE_GIT(filterStr));
        
        const logOptions: any = {};
        
        if (filter.since) {
            logOptions.from = filter.since;
        }
        
        if (filter.until) {
            logOptions.to = filter.until;
        }
        
        if (filter.maxCount) {
            logOptions.maxCount = filter.maxCount;
        } else {
            // 设置默认最大数量，避免获取过多commit
            logOptions.maxCount = 50;
        }
        
        if (filter.branch) {
            // 如果需要使用branch，可以在这里添加相关逻辑
        }
        
        console.log(OUTPUT.GIT.CALLING_SIMPLE_GIT_LOG_I18N(JSON.stringify(filter)));
        const log = await this.git.log(logOptions);
        console.log(OUTPUT.GIT.SIMPLE_GIT_LOG_RETURNED(log.all.length));
        
        const commits: CommitInfo[] = [];
        
        for (const commit of log.all) {
            // Get files changed in this commit
            console.log(OUTPUT.GIT.GETTING_FILES_FOR_COMMIT(commit.hash?.substring(0, 7) ?? 'unknown'));
            const filesChanged = await this.getFilesForCommit(commit.hash ?? '');
            console.log(OUTPUT.GIT.FOUND_FILES_FOR_COMMIT_I18N(filesChanged.length.toString(), commit.hash?.substring(0, 7) ?? 'unknown'));
            
            commits.push({
                hash: commit.hash ?? '',
                date: commit.date ?? '',
                message: commit.message ?? '',
                author: commit.author_name ?? '',
                authorEmail: commit.author_email ?? '',
                files: filesChanged
            });
        }
        
        return commits;
    }

    public async getCommitsWithDirectCommand(filter: CommitFilter): Promise<CommitInfo[]> {
        console.log(OUTPUT.GIT.GETTING_COMMITS_WITH_DIRECT_COMMAND(JSON.stringify(filter)));
        
        let command = 'git log --pretty=format:"%H|%ad|%an|%ae|%s" --date=iso';
        
        if (filter.since) {
            command += ` --since="${filter.since}"`;
        }
        
        if (filter.until) {
            command += ` --until="${filter.until}"`;
        }
        
        if (filter.maxCount) {
            command += ` -n ${filter.maxCount}`;
        }
        
        if (filter.branch) {
            command += ` ${filter.branch}`;
        }
        
        console.log(`Executing command: ${command}`);
        const { stdout } = await execAsync(command, { cwd: this.repoPath });
        
        const commits: CommitInfo[] = [];
        
        const lines = stdout.split('\n').filter(line => line.trim() !== '');
        console.log(`Command returned ${lines.length} commits`);
        
        for (const line of lines) {
            const [hash, date, author, email, ...messageParts] = line.split('|');
            const message = messageParts.join('|'); // In case message contains |
            
            // Get files changed in this commit
            console.log(OUTPUT.GIT.GETTING_FILES_FOR_COMMIT(hash?.substring(0, 7) ?? 'unknown'));
            const filesChanged = await this.getFilesForCommit(hash ?? '');
            console.log(OUTPUT.GIT.FOUND_FILES_FOR_COMMIT_I18N(filesChanged.length, hash?.substring(0, 7) ?? 'unknown'));
            
            commits.push({
                hash: hash ?? '',
                date: date ?? '',
                message: message ?? '',
                author: author ?? '',
                authorEmail: email ?? '',
                files: filesChanged
            });
        }
        
        return commits;
    }

    private async getCommitByIdWithSimpleGit(commitId: string): Promise<CommitInfo[]> {
        if (!this.git) {
            throw new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED);
        }
        
        // First, try to find the commit in the cached list of commits
        // This is much more likely to succeed than the direct lookup
        if (this.commits.length === 0) {
            // Load commits if we haven't yet
            try {
                await this.getCommits();
                
                // Now check if the commit is in our newly loaded cache
                const cachedCommit = this.commits.find(c => c.hash.startsWith(commitId));
                if (cachedCommit) {
                    this.logDebug(`Found commit ${commitId} in cache after loading commits`);
                    return [cachedCommit];
                }
            } catch (loadError) {
                this.logDebug(`Error loading commits: ${loadError}`);
                // Continue to try direct lookup even if loading commits failed
            }
        } else {
            // Search in our commits using startsWith for partial hash matching
            const cachedCommit = this.commits.find(c => c.hash.startsWith(commitId));
            if (cachedCommit) {
                this.logDebug(`Found commit ${commitId} in existing cache`);
                return [cachedCommit];
            }
        }
        
        // If not found in cache, try direct lookup with simple-git
        try {
            this.logDebug(`Trying direct lookup for commit ${commitId} with simple-git`);
            const log = await this.git.log({
                maxCount: 1,
                from: commitId,
                to: commitId
            });
            
            if (log.all.length === 0) {
                return [];
            }
            
            const commit: Commit = log.all[0] as Commit || {
                hash: '',
                date: '',
                message: '',
                author_name: '',
                author_email: ''
            };
            
            // Get files changed in this commit
            const filesChanged = await this.getFilesForCommit(commit.hash ?? '');
            
            const result = {
                hash: commit.hash ?? '',
                date: commit.date ?? '',
                message: commit.message ?? '',
                author: commit.author_name ?? '',
                authorEmail: commit.author_email ?? '',
                files: filesChanged
            };
            
            // Add the commit to our cache to avoid future lookups
            this.commits.push(result);
            
            return [result];
        } catch (error) {
            this.logDebug(`Error in simple-git direct commit lookup: ${error}`);
            throw error;
        }
    }

    private async getCommitByIdWithDirectCommand(commitId: string): Promise<CommitInfo[]> {
        const command = `git log -n 1 --pretty=format:"%H|%ad|%an|%ae|%s" --date=iso ${commitId}`;
        
        try {
            const { stdout } = await execAsync(command, { cwd: this.repoPath });
            
            if (!stdout.trim()) {
                return [];
            }
            
            const [hash, date, author, email, ...messageParts] = stdout.split('|');
            const message = messageParts.join('|'); // In case message contains |
            
            // Get files changed in this commit
            const filesChanged = await this.getFilesForCommit(hash ?? '');
            
            return [{
                hash: hash ?? '',
                date: date ?? '',
                message: message ?? '',
                author: author ?? '',
                authorEmail: email ?? '',
                files: filesChanged
            }];
        } catch (error) {
            console.error(OUTPUT.GIT.ERROR_GETTING_COMMIT_BY_ID_WITH_DIRECT_COMMAND(String(error)));
            return [];
        }
    }

    /**
     * 获取文件的blame信息，包括每一行的作者、修改时间和提交消息
     * @param filePath 文件路径
     * @param commitHash 可选的commit hash，如果指定，将获取该commit中文件的blame信息
     * @returns 文件每一行的blame信息，包括作者、时间、内容和提交消息
     */
    public async getFileBlameInfo(filePath: string, commitHash?: string): Promise<Array<{line: number; author: string; time: string; content: string; hash: string; message: string}>> {
        try {
            if (!this.git) {
                throw new Error('Git service not initialized');
            }

            // 构建git blame命令，使用-p获取详细信息
            let blameCommand = ['blame', '--line-porcelain'];
            
            // 如果指定了commitHash，则获取该commit中文件的blame信息
            if (commitHash) {
                blameCommand.push(commitHash);
            }
            
            blameCommand.push('--', filePath);
            
            // 执行git blame命令
            const blameOutput = await this.git.raw(blameCommand);
            
            // 解析blame输出
            const lines = blameOutput.split('\n');
            const blameInfo: Array<{line: number; author: string; time: string; content: string; hash: string; message: string}> = [];
            
            let currentHash = '';
            let currentAuthor = '';
            let currentTime = '';
            let currentLine = 0;
            let currentContent = '';
            let currentMessage = '';
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // 新的blame块开始，格式为: <hash> <original_line> <final_line> <line_count>
                if (line && line.match(/^[0-9a-f]{40}\s/)) {
                    const parts = line.split(' ');
                    if (parts.length >= 3) {
                        currentHash = parts[0] || '';
                        currentLine = parseInt(parts[2] || '0', 10) || 0;
                    }
                }
                
                // 作者
                if (line && line.startsWith('author ')) {
                    currentAuthor = line.substring(7);
                }
                
                // 作者时间（Unix时间戳）
                if (line && line.startsWith('author-time ')) {
                    const timestamp = parseInt(line.substring(12), 10) || 0;
                    const date = new Date(timestamp * 1000);
                    currentTime = date.toLocaleString();
                }
                
                // 提交消息
                if (line && line.startsWith('summary ')) {
                    currentMessage = line.substring(8);
                }
                
                // 实际内容行，以\t开头
                if (line && line.startsWith('\t')) {
                    currentContent = line.substring(1) || '';
                    
                    // 添加当前行的blame信息
                    blameInfo.push({
                        line: currentLine,
                        author: currentAuthor,
                        time: currentTime,
                        content: currentContent,
                        hash: currentHash,
                        message: currentMessage
                    });
                }
            }
            
            return blameInfo;
        } catch (error) {
            this.logError(error as Error, `Error getting blame info for ${filePath}`);
            return [];
        }
    }

    // Improved file change detection with multiple methods
    public async getFilesForCommit(commitHash: string): Promise<string[]> {
        try {
            console.log(OUTPUT.GIT.GETTING_FILES_FOR_COMMIT(commitHash));
            
            if (!this.git) {
                throw new Error(OUTPUT.GIT.GIT_NOT_INITIALIZED);
            }
            
            // 使用simple-git的show命令获取文件列表，这是最直接和可靠的方法
            const show = await this.git.show([commitHash, '--name-only', '--pretty=format:']);
            
            const files = show
                .split('\n')
                .filter(line => line.trim() !== '');
            
            console.log(OUTPUT.GIT.FOUND_FILES_FOR_COMMIT_I18N(files.length, commitHash));
            return files;
        } catch (error) {
            console.error(OUTPUT.GIT.ERROR_GETTING_FILES_FOR_COMMIT(String(error)));
            // 如果simple-git方法失败，尝试使用git命令行
            try {
                const { stdout } = await execAsync(
                    `git show --name-only --pretty=format: ${commitHash}`,
                    { cwd: this.repoPath }
                );
                
                const files = stdout
                    .split('\n')
                    .filter(line => line.trim() !== '');
                
                // 移除不必要的日志输出
                return files;
            } catch (fallbackError) {
                // 保留错误日志，但使用函数调用而不是字符串替换
                console.error(OUTPUT.GIT.FALLBACK_METHOD_FAILED(String(fallbackError)));
                return [];
            }
        }
    }

    private logDebug(message: string, data?: any): void {
        // 移除不必要的调试日志
        // 在开发模式下保留控制台输出以便于调试
        if (process.env['NODE_ENV'] === 'development') {
            const timestamp = new Date().toISOString();
            console.debug(`[CodeKarmic][${timestamp}] DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : '');
        }
    }

    private logError(error: Error, context: string): void {
        const notificationManager = NotificationManager.getInstance();
        notificationManager.log(`${context}: ${error.message}`, 'error', true);
        notificationManager.log(`${OUTPUT.COMMON.MSG_DETAILS} ${error.stack || 'No stack trace'}`, 'error', false);
    }
}
