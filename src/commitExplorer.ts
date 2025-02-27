import * as vscode from 'vscode';
import * as path from 'path';
import { GitService, CommitInfo } from './gitService';

export class CommitExplorerProvider implements vscode.TreeDataProvider<CommitTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommitTreeItem | undefined | null | void> = new vscode.EventEmitter<CommitTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommitTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private isLoading: boolean = false;
    private loadingMessage: string = 'Loading commits...';
    private errorMessage: string | undefined = undefined;

    constructor(private gitService: GitService) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setLoading(isLoading: boolean, message?: string): void {
        this.isLoading = isLoading;
        if (message) {
            this.loadingMessage = message;
        }
        this.refresh();
    }

    setError(message: string | undefined): void {
        this.errorMessage = message;
        this.refresh();
    }

    getTreeItem(element: CommitTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CommitTreeItem): Promise<CommitTreeItem[]> {
        if (!element) {
            // Root level: show all commits
            let commits: CommitInfo[] = [];
            
            // Show loading indicator if we're loading
            if (this.isLoading) {
                const loadingItem = new vscode.TreeItem(this.loadingMessage);
                loadingItem.description = 'Please wait...';
                loadingItem.contextValue = 'loading';
                return [loadingItem as any];
            }
            
            // Show error message if we have one
            if (this.errorMessage) {
                const errorItem = new vscode.TreeItem(`Error: ${this.errorMessage}`);
                errorItem.description = 'See console for details';
                errorItem.contextValue = 'error';
                return [errorItem as any];
            }
            
            try {
                // Check if we have a workspace folder
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    console.error('No workspace folder open');
                    const noWorkspaceItem = new vscode.TreeItem('No workspace folder open');
                    noWorkspaceItem.description = 'Please open a Git repository folder';
                    noWorkspaceItem.contextValue = 'noWorkspace';
                    return [noWorkspaceItem as any];
                }
                
                const repoPath = workspaceFolders[0].uri.fsPath;
                console.log(`Using repository path: ${repoPath}`);
                
                // Try to fetch commits
                try {
                    console.log('Fetching commits from repository...');
                    
                    // Ensure repository is set
                    try {
                        await this.gitService.setRepository(repoPath);
                        console.log('Repository set successfully');
                    } catch (repoError) {
                        console.error(`Error setting repository: ${repoError}`);
                        this.setError(`Failed to set repository: ${repoError}`);
                        throw repoError;
                    }
                    
                    // Get commits
                    commits = await this.gitService.getCommits();
                    console.log(`Found ${commits.length} commits`);
                } catch (error) {
                    console.error(`Error fetching commits: ${error}`);
                    this.setError(`Failed to fetch commits: ${error}`);
                    throw error;
                }
                
                if (commits.length === 0) {
                    const noCommitsItem = new vscode.TreeItem('No commits found');
                    noCommitsItem.description = 'Try a different repository or branch';
                    noCommitsItem.contextValue = 'noCommits';
                    return [noCommitsItem as any];
                }
                
                return commits.map(commit => {
                    return new CommitTreeItem(
                        commit,
                        commit.message,
                        vscode.TreeItemCollapsibleState.None
                    );
                });
            } catch (error) {
                console.error(`Error in getChildren: ${error}`);
                const errorItem = new vscode.TreeItem(`Error: ${error}`);
                errorItem.description = 'See console for details';
                errorItem.contextValue = 'error';
                return [errorItem as any];
            }
        } else if (element instanceof CommitTreeItem && !(element instanceof CommitDetailItem)) {
            // Commit details level
            const commit = element.commit;
            
            return [
                new CommitDetailItem('Author', `${commit.author} <${commit.authorEmail}>`, commit),
                new CommitDetailItem('Date', new Date(commit.date).toLocaleString(), commit),
                new CommitDetailItem('Hash', commit.hash, commit),
                new CommitDetailItem('Files Changed', `${commit.files.length} files`, commit)
            ];
        }
        
        return [];
    }
}

export class CommitTreeItem extends vscode.TreeItem {
    constructor(
        public readonly commit: CommitInfo,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        
        // Format the commit message for display
        const shortHash = commit.hash.substring(0, 7);
        const shortDate = new Date(commit.date).toLocaleDateString();
        
        this.description = `${shortHash} - ${shortDate}`;
        this.tooltip = `${commit.message}\n\nAuthor: ${commit.author}\nDate: ${new Date(commit.date).toLocaleString()}\nHash: ${commit.hash}`;
        this.contextValue = 'commit';
        
        // Set the command that will be executed when the tree item is clicked
        this.command = {
            command: 'ai-code-review.selectCommit',
            title: 'Select Commit',
            arguments: [commit.hash]
        };
        
        // Set the icon
        this.iconPath = new vscode.ThemeIcon('git-commit');
    }
}

export class CommitDetailItem extends CommitTreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        commit: CommitInfo
    ) {
        super(commit, label, vscode.TreeItemCollapsibleState.None);
        this.description = value;
        this.tooltip = `${label}: ${value}`;
        this.contextValue = 'commitDetail';
        this.command = undefined;
    }
}
