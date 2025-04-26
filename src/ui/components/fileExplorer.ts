import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewManager } from '../../services/review/reviewManager';
import { OUTPUT } from '../../i18n';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileTreeItem | undefined | null | void> = new vscode.EventEmitter<FileTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private reviewManager: ReviewManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
        if (!element) {
            // Root level: show all files in the selected commit
            const selectedCommit = this.reviewManager.getSelectedCommit();
            
            if (!selectedCommit) {
                console.log(OUTPUT.FILE_EXPLORER.NO_COMMIT_SELECTED);
                return [];
            }
            
            if (!selectedCommit.files || selectedCommit.files.length === 0) {
                console.log(OUTPUT.FILE_EXPLORER.COMMIT_NO_FILES(selectedCommit.hash.substring(0, 7)));
                return [];
            }
            
            console.log(OUTPUT.FILE_EXPLORER.SHOWING_FILES(selectedCommit.files.length.toString(), selectedCommit.hash.substring(0, 7)));
            
            // 获取文件状态和变更统计
            const gitService = this.reviewManager.getGitService();
            
            // 确保Git服务已初始化
            try {
                // 获取当前工作区路径
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    console.error(OUTPUT.FILE_EXPLORER.NO_WORKSPACE_FOLDER);
                    return [];
                }
                
                const repoPath = workspaceFolders[0]?.uri.fsPath;
                if (!repoPath) {
                    console.error(OUTPUT.FILE_EXPLORER.REPOSITORY_PATH_UNDEFINED);
                    return [];
                }
                
                // 检查Git服务是否已初始化，如果没有则初始化
                try {
                    // 直接尝试初始化Git服务，而不是先检查isGitRepository
                    if (!repoPath) {
                        console.error(OUTPUT.FILE_EXPLORER.REPOSITORY_PATH_UNDEFINED);
                        return [];
                    }
                    
                    // 直接设置仓库路径，确保Git服务被初始化
                    await gitService.setRepository(repoPath);
                } catch (error) {
                    console.error(OUTPUT.FILE_EXPLORER.ERROR_INITIALIZING_GIT(String(error)));
                    return [];
                }
            } catch (error) {
                console.error(OUTPUT.FILE_EXPLORER.ERROR_INITIALIZING_GIT(String(error)));
                return [];
            }
            
            const commitFiles = await gitService.getCommitFiles(selectedCommit.hash);
            console.log(OUTPUT.FILE_EXPLORER.COMMIT_FILES(JSON.stringify(commitFiles)));
            
            return selectedCommit.files.map((filePath: string) => {
                const extension = path.extname(filePath).toLowerCase();
                const fileName = path.basename(filePath);
                
                // 查找文件状态
                const fileInfo = commitFiles.find((f: { path: string }) => f.path === filePath);
                console.log(OUTPUT.FILE_EXPLORER.FILE_PATH_AND_INFO(filePath, JSON.stringify(fileInfo)));
                
                return new FileTreeItem(
                    filePath,
                    fileName,
                    extension,
                    vscode.TreeItemCollapsibleState.None,
                    fileInfo?.status,
                    fileInfo?.insertions,
                    fileInfo?.deletions
                );
            });
        }
        
        return [];
    }
}

export class FileTreeItem extends vscode.TreeItem {
    public color?: vscode.ThemeColor;
    constructor(
        public readonly filePath: string,
        public override readonly label: string,
        public readonly fileExtension: string,
        public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly status?: string,
        public readonly insertions?: number,
        public readonly deletions?: number
    ) {
        super(label, collapsibleState);
        
        console.log(OUTPUT.FILE_EXPLORER.CREATING_FILE_TREE_ITEM(filePath, status || 'unknown'));
        
        // Set file change statistics
        const stats = status && status !== 'binary' && (insertions || deletions) ?
            `(+${insertions} -${deletions})` : '';
        
        this.tooltip = `${filePath}\n${status || 'unknown'} ${stats}`;        
        // Set status code and description
        let statusCode = '';
        switch (status) {
            case 'added':
                statusCode = '[A] ';
                break;
            case 'modified':
                statusCode = '[M] ';
                break;
            case 'deleted':
                statusCode = '[D] ';
                break;
            case 'renamed':
                statusCode = '[R] ';
                break;
            case 'copied':
                statusCode = '[C] ';
                break;
            case 'binary':
                statusCode = '[B] ';
                break;
        }
        
        this.description = `${statusCode}${stats}`;
        
        // Set label with status
        this.label = label;
        
        // Apply color based on status
        this.resourceUri = vscode.Uri.parse(`file:///${filePath}`);
        if (status) {
            this.iconPath = this.getIconForFileExtension(fileExtension);
            // 应用颜色 - 直接设置 iconPath 的颜色属性
            this.iconPath = {
                light: this.getIconForFileExtension(fileExtension).light,
                dark: this.getIconForFileExtension(fileExtension).dark
            };
            // 设置文件颜色
            this.resourceUri = vscode.Uri.parse(`file:///${filePath}`);
            // 不再设置标签颜色，保持VS Code默认的Git样式
            // this.color = this.getColorForStatus(status);
        } else {
            // Use file extension icon
            this.iconPath = this.getIconForFileExtension(fileExtension);
        }
        
        this.contextValue = 'file';
        
        this.command = {
            command: 'codekarmic.viewFile',
            title: 'View File',
            arguments: [filePath]
        };
    }
    
    private getIconForFileExtension(extension: string): { light: vscode.Uri; dark: vscode.Uri } {
        let iconName = 'file';
        
        // Map common file extensions to icons
        switch (extension) {
            case '.js':
            case '.ts':
            case '.jsx':
            case '.tsx':
                iconName = 'javascript';
                break;
            case '.html':
            case '.htm':
                iconName = 'html';
                break;
            case '.css':
            case '.scss':
            case '.less':
                iconName = 'css';
                break;
            case '.json':
                iconName = 'json';
                break;
            case '.md':
                iconName = 'markdown';
                break;
            case '.py':
                iconName = 'python';
                break;
            case '.java':
                iconName = 'java';
                break;
            case '.c':
            case '.cpp':
            case '.h':
            case '.hpp':
                iconName = 'cpp';
                break;
            default:
                iconName = 'file';
        }
        
        return {
            light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', `${iconName}.svg`)),
            dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', `${iconName}.svg`))
        };
    }
}
