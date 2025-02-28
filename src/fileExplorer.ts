import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewManager } from './reviewManager';

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
                console.log('No commit selected in FileExplorerProvider');
                return [];
            }
            
            if (!selectedCommit.files || selectedCommit.files.length === 0) {
                console.log(`Selected commit ${selectedCommit.hash.substring(0, 7)} has no files`);
                return [];
            }
            
            console.log(`FileExplorerProvider: showing ${selectedCommit.files.length} files for commit ${selectedCommit.hash.substring(0, 7)}`);
            
            return selectedCommit.files.map(filePath => {
                const extension = path.extname(filePath).toLowerCase();
                const fileName = path.basename(filePath);
                
                return new FileTreeItem(
                    filePath,
                    fileName,
                    extension,
                    vscode.TreeItemCollapsibleState.None
                );
            });
        }
        
        return [];
    }
}

export class FileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly filePath: string,
        public readonly label: string,
        public readonly fileExtension: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        
        this.tooltip = filePath;
        this.description = path.dirname(filePath);
        
        // Set icon based on file extension
        this.iconPath = this.getIconForFileExtension(fileExtension);
        
        this.contextValue = 'file';
        
        this.command = {
            command: 'codesage.viewFile',
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
