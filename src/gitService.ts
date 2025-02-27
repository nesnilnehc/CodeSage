import * as vscode from 'vscode';
import simpleGit, { SimpleGit, LogResult, DefaultLogFields, ListLogLine } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

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
}

export interface CommitInfo {
    hash: string;
    date: string;
    message: string;
    author: string;
    authorEmail: string;
    files: string[];
}

export class GitService {
    private git: SimpleGit | null = null;
    private repoPath: string = '';
    private commits: CommitInfo[] = [];
    private currentFilter: CommitFilter = {};

    constructor() {
        console.log('GitService constructor called');
    }

    public async setRepository(repoPath: string): Promise<void> {
        try {
            console.log(`Setting repository path to: ${repoPath}`);
            
            // Check if path exists
            if (!fs.existsSync(repoPath)) {
                console.error(`Repository path does not exist: ${repoPath}`);
                throw new Error(`Repository path does not exist: ${repoPath}`);
            }
            
            // Check if .git directory exists
            const gitDir = path.join(repoPath, '.git');
            if (!fs.existsSync(gitDir)) {
                console.error(`Not a git repository - .git directory not found in ${repoPath}`);
                throw new Error(`Not a git repository - .git directory not found in ${repoPath}`);
            }
            
            this.repoPath = repoPath;
            this.git = simpleGit(repoPath);
            
            // Clear any existing filter
            this.currentFilter = {};
            
            // Clear cached commits
            this.commits = [];
            
            console.log('Repository set successfully');
        } catch (error) {
            console.error(`Error setting repository: ${error}`);
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
                    // Get the current version of the file
                    const currentContent = await this.git.show([`${commitId}:${file.file}`]);
                    
                    // Get the previous version of the file
                    const previousContent = await this.git.show([`${commitId}^:${file.file}`]).catch(() => '');
                    
                    files.push({
                        path: file.file,
                        content: currentContent,
                        previousContent: previousContent
                    });
                } catch (error) {
                    console.error(`Error getting content for file ${file.file}:`, error);
                }
            }

            return files;
        } catch (error) {
            console.error('Error getting commit files:', error);
            return [];
        }
    }

    public async isGitRepository(): Promise<boolean> {
        try {
            if (!this.git) {
                console.error('Git not initialized');
                return false;
            }
            
            // Try to run a simple git command to verify
            const result = await this.git.raw(['rev-parse', '--is-inside-work-tree']);
            return result.trim() === 'true';
        } catch (error) {
            console.error(`Error checking if git repository: ${error}`);
            return false;
        }
    }

    public async getCommits(filter?: CommitFilter): Promise<CommitInfo[]> {
        try {
            console.log(`Getting commits with filter: ${JSON.stringify(filter || this.currentFilter)}`);
            
            if (!this.git) {
                console.error('Git not initialized');
                throw new Error('Git not initialized');
            }
            
            // Apply filter if provided, otherwise use current filter
            const activeFilter = filter || this.currentFilter;
            
            // If we have cached commits and no new filter is provided, return cached commits
            if (this.commits.length > 0 && !filter) {
                console.log(`Returning ${this.commits.length} cached commits`);
                return this.commits;
            }
            
            // Try different methods to get commits
            try {
                // Method 1: Use simple-git
                console.log('Trying to get commits using simple-git...');
                const commits = await this.getCommitsWithSimpleGit(activeFilter);
                console.log(`Got ${commits.length} commits using simple-git`);
                
                // Cache commits if successful and using current filter
                if (!filter) {
                    this.commits = commits;
                }
                
                return commits;
            } catch (error) {
                console.error(`Error getting commits with simple-git: ${error}`);
                
                // Method 2: Use direct git command
                console.log('Trying to get commits using direct git command...');
                const commits = await this.getCommitsWithDirectCommand(activeFilter);
                console.log(`Got ${commits.length} commits using direct git command`);
                
                // Cache commits if successful and using current filter
                if (!filter) {
                    this.commits = commits;
                }
                
                return commits;
            }
        } catch (error) {
            console.error(`Error getting commits: ${error}`);
            throw error;
        }
    }

    public async getCommitById(commitId: string): Promise<CommitInfo[]> {
        try {
            console.log(`Getting commit by ID: ${commitId}`);
            
            if (!this.git) {
                console.error('Git not initialized');
                throw new Error('Git not initialized');
            }
            
            // First check if the commit is in the cache
            const cachedCommit = this.commits.find(c => c.hash.startsWith(commitId));
            if (cachedCommit) {
                console.log(`Found commit ${commitId} in cache`);
                return [cachedCommit];
            }
            
            // Try different methods to get the commit
            try {
                // Method 1: Use simple-git
                console.log('Trying to get commit using simple-git...');
                return await this.getCommitByIdWithSimpleGit(commitId);
            } catch (error) {
                console.error(`Error getting commit with simple-git: ${error}`);
                
                // Method 2: Use direct git command
                console.log('Trying to get commit using direct git command...');
                return await this.getCommitByIdWithDirectCommand(commitId);
            }
        } catch (error) {
            console.error(`Error getting commit by ID: ${error}`);
            throw error;
        }
    }

    public async getBranches(): Promise<string[]> {
        try {
            console.log('Getting branches');
            
            if (!this.git) {
                console.error('Git not initialized');
                throw new Error('Git not initialized');
            }
            
            // Try different methods to get branches
            try {
                // Method 1: Use simple-git
                console.log('Trying to get branches using simple-git...');
                const branchSummary = await this.git.branch();
                return Object.keys(branchSummary.branches);
            } catch (error) {
                console.error(`Error getting branches with simple-git: ${error}`);
                
                // Method 2: Use direct git command
                console.log('Trying to get branches using direct git command...');
                const { stdout } = await execAsync('git branch', { cwd: this.repoPath });
                
                return stdout
                    .split('\n')
                    .filter(line => line.trim() !== '')
                    .map(line => line.replace('*', '').trim());
            }
        } catch (error) {
            console.error(`Error getting branches: ${error}`);
            throw error;
        }
    }

    public async getFileContent(commitHash: string, filePath: string): Promise<string> {
        try {
            console.log(`Getting file content for ${filePath} at commit ${commitHash}`);
            
            if (!this.git) {
                console.error('Git not initialized');
                throw new Error('Git not initialized');
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
            console.error(`Error getting file content: ${error}`);
            // Return empty string if file doesn't exist
            return '';
        }
    }

    public async getFileDiff(commitHash: string, filePath: string): Promise<string> {
        try {
            console.log(`Getting file diff for ${filePath} at commit ${commitHash}`);
            
            if (!this.git) {
                console.error('Git not initialized');
                throw new Error('Git not initialized');
            }
            
            // Try different methods to get file diff
            try {
                // Method 1: Use simple-git
                console.log('Trying to get file diff using simple-git...');
                // Show the diff of the file in this commit
                const diff = await this.git.show([
                    '--patch',  // Show the patch/diff
                    '--unified=3',  // Show 3 lines of context
                    '--src-prefix=a/',  // Set source prefix
                    '--dst-prefix=b/',  // Set destination prefix
                    `${commitHash}`,  // The commit to show
                    '--',  // Separator between revision and paths
                    filePath  // The file to show diff for
                ]);
                return diff;
            } catch (error) {
                console.error(`Error getting file diff with simple-git: ${error}`);
                
                // Method 2: Use direct git command
                console.log('Trying to get file diff using direct git command...');
                const { stdout } = await execAsync(
                    `git show --patch --unified=3 --src-prefix=a/ --dst-prefix=b/ ${commitHash} -- ${filePath}`,
                    { cwd: this.repoPath }
                );
                return stdout;
            }
        } catch (error) {
            console.error(`Error getting file diff: ${error}`);
            throw error;
        }
    }

    public getCommitInfo(commitHash: string): CommitInfo | undefined {
        return this.commits.find(commit => commit.hash === commitHash);
    }

    public async setDateFilter(since: string, until: string): Promise<void> {
        console.log(`Setting date filter: since=${since}, until=${until}`);
        this.currentFilter = {
            ...this.currentFilter,
            since,
            until
        };
        
        // Clear cached commits when filter changes
        this.commits = [];
    }

    public async setBranchFilter(branch: string): Promise<void> {
        console.log(`Setting branch filter: ${branch}`);
        this.currentFilter = {
            ...this.currentFilter,
            branch
        };
        
        // Clear cached commits when filter changes
        this.commits = [];
    }

    public clearFilters(): void {
        console.log('Clearing all filters');
        this.currentFilter = {};
        
        // Clear cached commits when filter changes
        this.commits = [];
    }

    public async getCommitsWithSimpleGit(filter: CommitFilter): Promise<CommitInfo[]> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        
        console.log(`getCommitsWithSimpleGit called with filter: ${JSON.stringify(filter)}`);
        
        try {
            // First try to get the current branch with timeout
            const branchPromise = this.git.branch();
            const branchResult = await Promise.race([
                branchPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout getting branch')), 5000))
            ]) as { current: string };
            console.log('Current branch info:', branchResult);
            
            // Get commits with timeout
            console.log('Getting commits...');
            const logPromise = this.git.log(['--max-count', '50']);
            const logResult = await Promise.race([
                logPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout getting commits')), 10000))
            ]) as LogResult<DefaultLogFields>;
            console.log(`Found ${logResult.all.length} commits`);
            
            // Apply date filters after getting commits if needed
            let commits = logResult.all;
            if (filter.since) {
                const sinceDate = new Date(filter.since);
                commits = commits.filter(commit => new Date(commit.date) >= sinceDate);
            }
            if (filter.until) {
                const untilDate = new Date(filter.until);
                commits = commits.filter(commit => new Date(commit.date) <= untilDate);
            }
            
            console.log(`After filtering, found ${commits.length} commits`);
        
            const result: CommitInfo[] = [];
            let processed = 0;
            
            for (const commit of commits) {
                try {
                    // Get files changed in this commit with timeout
                    console.log(`Getting files for commit ${commit.hash.substring(0, 7)} (${processed + 1}/${commits.length})`);
                    const filesChangedPromise = this.getFilesForCommit(commit.hash);
                    const filesChanged = await Promise.race([
                        filesChangedPromise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout getting files for commit ${commit.hash}`)), 5000))
                    ]) as string[];
                    
                    result.push({
                        hash: commit.hash,
                        date: commit.date,
                        message: commit.message,
                        author: commit.author_name,
                        authorEmail: commit.author_email,
                        files: filesChanged
                    });
                    
                    processed++;
                    if (processed % 5 === 0 || processed === commits.length) {
                        console.log(`Processed ${processed}/${commits.length} commits`);
                    }
                } catch (error) {
                    console.warn(`Error processing commit ${commit.hash}, skipping:`, error);
                    continue;
                }
            }
            
            console.log(`Successfully processed ${result.length} commits`);
            return result;
        } catch (error) {
            console.error('Error in getCommitsWithSimpleGit:', error);
            throw error;
        }
    }

    public async getCommitsWithDirectCommand(filter: CommitFilter): Promise<CommitInfo[]> {
        console.log(`getCommitsWithDirectCommand called with filter: ${JSON.stringify(filter)}`);
        
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
            console.log(`Getting files for commit: ${hash.substring(0, 7)}`);
            const filesChanged = await this.getFilesForCommit(hash);
            console.log(`Found ${filesChanged.length} files for commit ${hash.substring(0, 7)}`);
            
            commits.push({
                hash,
                date,
                message,
                author,
                authorEmail: email,
                files: filesChanged
            });
        }
        
        return commits;
    }

    private async getCommitByIdWithSimpleGit(commitId: string): Promise<CommitInfo[]> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        
        const log = await this.git.log({
            maxCount: 1,
            from: commitId,
            to: commitId
        });
        
        if (log.all.length === 0) {
            return [];
        }
        
        const commit = log.all[0];
        
        // Get files changed in this commit
        const filesChanged = await this.getFilesForCommit(commit.hash);
        
        return [{
            hash: commit.hash,
            date: commit.date,
            message: commit.message,
            author: commit.author_name,
            authorEmail: commit.author_email,
            files: filesChanged
        }];
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
            const filesChanged = await this.getFilesForCommit(hash);
            
            return [{
                hash,
                date,
                message,
                author,
                authorEmail: email,
                files: filesChanged
            }];
        } catch (error) {
            console.error(`Error getting commit by ID with direct command: ${error}`);
            return [];
        }
    }

    // Improved file change detection with multiple methods
    public async getFilesForCommit(commitHash: string): Promise<string[]> {
        try {
            console.log(`Getting files for commit: ${commitHash}`);
            
            // Try multiple methods to get files and combine results
            const filesFromMethods: string[][] = [];
            
            // Method 1: Use git show
            try {
                console.log('Trying to get files using git show...');
                const { stdout: showOutput } = await execAsync(
                    `git show --name-only --pretty=format: ${commitHash}`,
                    { cwd: this.repoPath }
                );
                
                const filesFromShow = showOutput
                    .split('\n')
                    .filter(line => line.trim() !== '');
                
                console.log(`Found ${filesFromShow.length} files using git show`);
                filesFromMethods.push(filesFromShow);
            } catch (error) {
                console.error(`Error getting files with git show: ${error}`);
            }
            
            // Method 2: Use git log
            try {
                console.log('Trying to get files using git log...');
                const { stdout: logOutput } = await execAsync(
                    `git log -1 --name-only --pretty=format: ${commitHash}`,
                    { cwd: this.repoPath }
                );
                
                const filesFromLog = logOutput
                    .split('\n')
                    .filter(line => line.trim() !== '');
                
                console.log(`Found ${filesFromLog.length} files using git log`);
                filesFromMethods.push(filesFromLog);
            } catch (error) {
                console.error(`Error getting files with git log: ${error}`);
            }
            
            // Method 3: Use git diff-tree
            try {
                console.log('Trying to get files using git diff-tree...');
                const { stdout: diffOutput } = await execAsync(
                    `git diff-tree --no-commit-id --name-only -r ${commitHash}`,
                    { cwd: this.repoPath }
                );
                
                const filesFromDiff = diffOutput
                    .split('\n')
                    .filter(line => line.trim() !== '');
                
                console.log(`Found ${filesFromDiff.length} files using git diff-tree`);
                filesFromMethods.push(filesFromDiff);
            } catch (error) {
                console.error(`Error getting files with git diff-tree: ${error}`);
            }
            
            // Method 4: Use simple-git
            if (this.git) {
                try {
                    console.log('Trying to get files using simple-git...');
                    const show = await this.git.show([commitHash, '--name-only', '--pretty=format:']);
                    
                    const filesFromSimpleGit = show
                        .split('\n')
                        .filter(line => line.trim() !== '');
                    
                    console.log(`Found ${filesFromSimpleGit.length} files using simple-git`);
                    filesFromMethods.push(filesFromSimpleGit);
                } catch (error) {
                    console.error(`Error getting files with simple-git: ${error}`);
                }
            }
            
            // Combine results from all methods and remove duplicates
            const allFiles = new Set<string>();
            for (const files of filesFromMethods) {
                for (const file of files) {
                    allFiles.add(file);
                }
            }
            
            const uniqueFiles = Array.from(allFiles);
            console.log(`Combined ${uniqueFiles.length} unique files from all methods`);
            
            return uniqueFiles;
        } catch (error) {
            console.error(`Error getting files for commit: ${error}`);
            return [];
        }
    }
}
