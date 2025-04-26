import * as vscode from 'vscode';
import { GitService, CommitInfo } from '../../services/git/gitService';
import { OUTPUT } from '../../i18n';

export class CommitExplorerProvider implements vscode.TreeDataProvider<CommitTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommitTreeItem | undefined | null | void> = new vscode.EventEmitter<CommitTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommitTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private isLoading: boolean = false;
    private loadingMessage: string = OUTPUT.COMMIT_EXPLORER.LOADING;
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
                loadingItem.description = OUTPUT.COMMIT_EXPLORER.LOADING_DESCRIPTION;
                loadingItem.contextValue = 'loading';
                return [loadingItem as any];
            }
            
            // Show error message if we have one
            if (this.errorMessage) {
                const errorItem = new vscode.TreeItem(OUTPUT.COMMIT_EXPLORER.ERROR_PREFIX(this.errorMessage));
                errorItem.description = OUTPUT.COMMIT_EXPLORER.ERROR_DESCRIPTION;
                errorItem.contextValue = 'error';
                return [errorItem as any];
            }
            
            try {
                // Check if we have a workspace folder
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    console.error(OUTPUT.COMMIT_EXPLORER.NO_WORKSPACE_FOLDER);
                    const noWorkspaceItem = new vscode.TreeItem(OUTPUT.COMMIT_EXPLORER.NO_WORKSPACE_FOLDER);
                    noWorkspaceItem.description = OUTPUT.COMMIT_EXPLORER.NO_WORKSPACE_DESCRIPTION;
                    noWorkspaceItem.contextValue = 'noWorkspace';
                    return [noWorkspaceItem as any];
                }
                
                const repoPath = workspaceFolders[0]?.uri.fsPath;
                console.log(OUTPUT.COMMIT_EXPLORER.USING_REPOSITORY_PATH(repoPath || ''));
                
                // Try to fetch commits
                try {
                    console.log(OUTPUT.COMMIT_EXPLORER.FETCHING_COMMITS);
                    
                    // Ensure repository is set
                    try {
                        await this.gitService.setRepository(repoPath || '');
                        console.log(OUTPUT.COMMIT_EXPLORER.REPOSITORY_SET_SUCCESS);
                    } catch (repoError) {
                        console.error(OUTPUT.COMMIT_EXPLORER.ERROR_SETTING_REPOSITORY(String(repoError)));
                        this.setError(OUTPUT.COMMIT_EXPLORER.ERROR_SETTING_REPOSITORY(String(repoError)));
                        throw repoError;
                    }
                    
                    // Get commits
                    commits = await this.gitService.getCommits();
                    console.log(OUTPUT.COMMIT_EXPLORER.FOUND_COMMITS(commits.length.toString()));
                } catch (error) {
                    console.error(OUTPUT.COMMIT_EXPLORER.ERROR_FETCHING_COMMITS(String(error)));
                    this.setError(OUTPUT.COMMIT_EXPLORER.ERROR_FETCHING_COMMITS(String(error)));
                    throw error;
                }
                
                if (commits.length === 0) {
                    const noCommitsItem = new vscode.TreeItem(OUTPUT.COMMIT_EXPLORER.NO_COMMITS_FOUND);
                    noCommitsItem.description = OUTPUT.COMMIT_EXPLORER.NO_COMMITS_DESCRIPTION;
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
                console.error(OUTPUT.COMMIT_EXPLORER.ERROR_GET_CHILDREN(String(error)));
                const errorItem = new vscode.TreeItem(OUTPUT.COMMIT_EXPLORER.ERROR_PREFIX(String(error)));
                errorItem.description = OUTPUT.COMMIT_EXPLORER.ERROR_DESCRIPTION;
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
        public override readonly label: string,
        public override readonly collapsibleState: vscode.TreeItemCollapsibleState
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
            command: 'codekarmic.selectCommit',
            title: 'Select Commit',
            arguments: [commit.hash]
        };
        
        // Set the icon
        this.iconPath = new vscode.ThemeIcon('git-commit');
    }
}

export class CommitDetailItem extends CommitTreeItem {
    constructor(
        public override readonly label: string,
        public readonly value: string,
        commit: CommitInfo
    ) {
        super(commit, label, vscode.TreeItemCollapsibleState.None);
        this.description = value;
        this.tooltip = `${label}: ${value}`;
        this.contextValue = 'commitDetail';
        this.command = undefined as unknown as vscode.Command;
    }
}
