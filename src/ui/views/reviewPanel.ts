import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewManager } from '../../services/review/reviewManager';

export class ReviewPanel {
    public static currentPanel: ReviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _reviewManager: ReviewManager;
    private _filePath: string;
    private _codiconUri: vscode.Uri | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        _extensionUri: vscode.Uri,
        reviewManager: ReviewManager,
        filePath: string
    ) {
        this._panel = panel;
        this._reviewManager = reviewManager;
        this._filePath = filePath;
        
        // 创建Codicon CSS的URI
        this._codiconUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(_extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            () => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'addComment':
                        await this._reviewManager.addComment(
                            this._filePath,
                            message.lineNumber,
                            message.content
                        );
                        this._update();
                        return;
                    case 'requestAIReview':
                        await this.performAIReview();
                        this._update();
                        return;
                    case 'generateReport':
                        const selectedCommit = this._reviewManager.getSelectedCommit();
                        if (!selectedCommit || !selectedCommit.hash) {
                            // 发送消息到 webview，通知用户需要先选择一个有效的commit
                            this._panel.webview.postMessage({ command: 'showError', message: '请先选择一个有效的commit' });
                            return;
                        }
                        await this._reviewManager.generateReport();
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        reviewManager: ReviewManager,
        filePath: string,
        aiResult?: any
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (ReviewPanel.currentPanel) {
            ReviewPanel.currentPanel._panel.reveal(column);
            ReviewPanel.currentPanel._filePath = filePath;
            
            // 如果有预先生成的AI审查结果，应用它
            if (aiResult) {
                ReviewPanel.currentPanel.applyAIResult(aiResult);
            }
            
            ReviewPanel.currentPanel._update();
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            'codekarmic',
            'Code Review',
            column || vscode.ViewColumn.Two,
            {
                // Enable javascript in the webview
                enableScripts: true,
                // Restrict the webview to only loading content from our extension's directory
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'resources')
                ]
            }
        );

        ReviewPanel.currentPanel = new ReviewPanel(panel, extensionUri, reviewManager, filePath);
        
        // 如果有预先生成的AI审查结果，应用它
        if (aiResult) {
            ReviewPanel.currentPanel.applyAIResult(aiResult);
        }
    }

    public dispose() {
        ReviewPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    public getFilePath(): string {
        return this._filePath;
    }

    private async _update() {
        this._panel.title = `Review: ${path.basename(this._filePath)}`;
        this._panel.webview.html = await this._getHtmlForWebview();
    }

    public async performAIReview() {
        const selectedCommit = this._reviewManager.getSelectedCommit();
        
        // 检查是否是独立文件审查模式
        const isStandaloneMode = !selectedCommit;
        
        try {
            // 如果是Git提交模式但未选择提交，则显示错误
            if (!isStandaloneMode && !selectedCommit) {
                vscode.window.showErrorMessage('未选择提交');
                return;
            }
            
            // Show progress indicator
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: '正在分析代码...',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0 });
                    
                    progress.report({ increment: 30, message: '处理文件内容...' });
                    
                    // 如果是独立模式，则获取当前文件内容并执行分析
                    if (isStandaloneMode) {
                        try {
                            // 获取当前文件的内容
                            const documentUri = vscode.Uri.file(this._filePath);
                            const document = await vscode.workspace.openTextDocument(documentUri);
                            const content = document.getText();
                            
                            progress.report({ increment: 30, message: '执行AI分析...' });
                            
                            // 导入并使用AIService分析代码
                            const { AIService } = await import('../../services/ai/aiService');
                            const result = await AIService.getInstance().reviewCode({
                                filePath: this._filePath,
                                currentContent: content,
                                previousContent: content, // 对于独立模式，当前内容和以前内容相同
                                includeDiffAnalysis: false // 不进行差异分析
                            });
                            
                            progress.report({ increment: 20, message: '处理分析结果...' });
                            
                            // 应用AI结果
                            await this.applyAIResult(result);
                            
                            progress.report({ increment: 20, message: '更新视图...' });
                        } catch (error) {
                            this._reviewManager.getNotificationManager().log(`独立文件审查失败: ${error}`, 'error', true);
                        }
                    } else {
                        // 原有的模拟审查逻辑 (现有的模拟实现)
                        // Simulate AI analysis
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        progress.report({ increment: 30, message: '生成建议...' });
                        
                        // Add some example AI suggestions
                        await this._reviewManager.addAISuggestion(
                            this._filePath,
                            'Consider adding more comprehensive error handling for edge cases.'
                        );
                        
                        await this._reviewManager.addAISuggestion(
                            this._filePath,
                            'The function could be optimized for better performance by caching results.'
                        );
                        
                        await this._reviewManager.addAISuggestion(
                            this._filePath,
                            'Variable naming could be improved for better code readability.'
                        );
                        
                        progress.report({ increment: 40, message: 'Finalizing review...' });
                        
                        // 直接设置质量评分
                        await this._reviewManager.setCodeQualityScore(this._filePath, 7.5);
                        
                        // 确保更新UI
                        this._update();
                    }
                }
            );
            
            this._reviewManager.getNotificationManager().log('AI代码审查已完成', 'info', true);
        } catch (error) {
            this._reviewManager.getNotificationManager().log(`AI审查失败: ${error}`, 'error', true);
        }
    }

    private async _getHtmlForWebview() {
        // Get the file content
        const selectedCommit = this._reviewManager.getSelectedCommit();
        
        // Get the review data for this file
        const fileReview = await this._reviewManager.reviewFile(this._filePath);
        
        // 确定是否为独立文件审查模式（没有选定的提交）
        const isStandaloneMode = !selectedCommit;

        // Create HTML content
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Review</title>
            ${this._codiconUri ? `<link href="${this._codiconUri}" rel="stylesheet" />` : ''}
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    padding: 0;
                    margin: 0;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    padding: 20px;
                    box-sizing: border-box;
                }
                
                .header {
                    margin-bottom: 20px;
                }
                
                .header h1 {
                    margin: 0;
                    font-size: 1.5em;
                }
                
                .header .commit-info {
                    margin-top: 10px;
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                
                .review-section {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    overflow: hidden;
                }
                
                .review-tabs {
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .tab {
                    padding: 8px 16px;
                    cursor: pointer;
                    background-color: transparent;
                    border: none;
                    color: var(--vscode-foreground);
                    font-size: 1em;
                }
                
                .tab.active {
                    border-bottom: 2px solid var(--vscode-button-background);
                    font-weight: bold;
                }
                
                .tab-content {
                    flex: 1;
                    overflow: auto;
                    padding: 16px 0;
                }
                
                .tab-panel {
                    display: none;
                }
                
                .tab-panel.active {
                    display: block;
                }
                
                .comment-list {
                    margin: 0;
                    padding: 0;
                    list-style: none;
                }
                
                .comment-item {
                    margin-bottom: 16px;
                    padding: 12px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                }
                
                .comment-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                
                .comment-content {
                    white-space: pre-wrap;
                }
                
                .suggestion-list {
                    margin: 0;
                    padding: 0;
                    list-style: none;
                }
                
                .suggestion-item {
                    margin-bottom: 16px;
                    padding: 12px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                }
                
                .quality-score {
                    margin-top: 20px;
                    font-size: 1.2em;
                }
                
                .actions {
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                }
                
                button {
                    padding: 8px 16px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                }
                
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                /* Codicon 图标样式 */
                .codicon {
                    font-size: 16px;
                    margin-right: 5px;
                }
                
                button .codicon {
                    display: inline-block;
                    vertical-align: middle;
                    line-height: normal;
                }
                
                .comment-form {
                    margin-top: 20px;
                }
                
                .comment-form textarea {
                    width: 100%;
                    min-height: 100px;
                    padding: 8px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                    resize: vertical;
                }
                
                .comment-form .form-actions {
                    margin-top: 10px;
                    display: flex;
                    justify-content: flex-end;
                }
                
                .standalone-mode {
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 0.8em;
                    margin-left: 8px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>
                        代码审查: ${this._filePath}
                        ${isStandaloneMode ? '<span class="standalone-mode">独立审查模式</span>' : ''}
                    </h1>
                    ${isStandaloneMode ? 
                        '<div class="commit-info">工作区文件直接审查（不依赖Git提交）</div>' : 
                        `<div class="commit-info">
                            提交: ${selectedCommit.hash.substring(0, 7)} - ${selectedCommit.message}<br>
                            作者: ${selectedCommit.author} - ${new Date(selectedCommit.date).toLocaleString()}
                        </div>`
                    }
                </div>
                
                <div class="review-section">
                    <div class="review-tabs">
                        <button class="tab active" data-tab="comments">$(comment-discussion) 评论</button>
                        <button class="tab" data-tab="ai-suggestions">$(lightbulb) AI建议</button>
                        <button class="tab" data-tab="add-comment">$(edit) 添加评论</button>
                    </div>
                    
                    <div class="tab-content">
                        <div class="tab-panel active" id="comments">
                            ${fileReview.comments.length === 0 
                                ? '<p>还没有评论。添加评论或请求AI审查。</p>' 
                                : `<ul class="comment-list">
                                    ${fileReview.comments.map(comment => `
                                        <li class="comment-item">
                                            <div class="comment-header">
                                                <span>行 ${comment.lineNumber}</span>
                                                <span>${comment.author} - ${new Date(comment.timestamp).toLocaleString()}</span>
                                            </div>
                                            <div class="comment-content">${comment.content}</div>
                                        </li>
                                    `).join('')}
                                </ul>`
                            }
                        </div>
                        
                        <div class="tab-panel" id="ai-suggestions">
                            ${fileReview.aiSuggestions.length === 0 
                                ? '<p>还没有AI建议。点击"请求AI审查"来分析此文件。</p>' 
                                : `
                                    <ul class="suggestion-list">
                                        ${fileReview.aiSuggestions.map(suggestion => `
                                            <li class="suggestion-item">${suggestion}</li>
                                        `).join('')}
                                    </ul>
                                    
                                    ${fileReview.codeQualityScore !== undefined 
                                        ? `<div class="quality-score">代码质量评分: ${fileReview.codeQualityScore}/10</div>` 
                                        : ''
                                    }
                                `
                            }
                        </div>
                        
                        <div class="tab-panel" id="add-comment">
                            <div class="comment-form">
                                <textarea id="comment-content" placeholder="在此输入您的评论..."></textarea>
                                <div class="form-actions">
                                    <input type="number" id="line-number" placeholder="行号" min="1" />
                                    <button id="submit-comment">$(check) 添加评论</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="actions">
                    <button id="request-ai-review">$(lightbulb) 请求AI审查</button>
                    ${!isStandaloneMode ? '<button id="generate-report">$(notebook) 生成报告</button>' : ''}
                </div>
            </div>
            
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // Tab switching
                    document.querySelectorAll('.tab').forEach(tab => {
                        tab.addEventListener('click', () => {
                            // Deactivate all tabs
                            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                            
                            // Activate the clicked tab
                            tab.classList.add('active');
                            const tabId = tab.getAttribute('data-tab');
                            document.getElementById(tabId).classList.add('active');
                        });
                    });
                    
                    // Add comment
                    document.getElementById('submit-comment').addEventListener('click', () => {
                        const content = document.getElementById('comment-content').value.trim();
                        const lineNumber = parseInt(document.getElementById('line-number').value, 10);
                        
                        if (!content) {
                            alert('请输入评论内容');
                            return;
                        }
                        
                        if (isNaN(lineNumber) || lineNumber < 1) {
                            alert('请输入有效的行号');
                            return;
                        }
                        
                        vscode.postMessage({
                            command: 'addComment',
                            content,
                            lineNumber
                        });
                        
                        // Clear the form
                        document.getElementById('comment-content').value = '';
                        document.getElementById('line-number').value = '';
                    });
                    
                    // Request AI review
                    document.getElementById('request-ai-review').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'requestAIReview'
                        });
                    });
                    
                    // Generate report (only in Git commit mode)
                    const generateReportBtn = document.getElementById('generate-report');
                    if (generateReportBtn) {
                        generateReportBtn.addEventListener('click', () => {
                            vscode.postMessage({
                                command: 'generateReport'
                            });
                        });
                    }
                })();
            </script>
        </body>
        </html>`;
    }

    private async applyAIResult(aiResult: any) {
        try {
            // 在开始处理之前打印审查数据状态（使用变量，避免警告）
            const fileReview = await this._reviewManager.reviewFile(this._filePath);
            console.log(`审查数据状态: 评论数=${fileReview.comments.length}, AI建议数=${fileReview.aiSuggestions.length}`);
            
            // 添加AI建议
            if (aiResult.suggestions && aiResult.suggestions.length > 0) {
                for (const suggestion of aiResult.suggestions) {
                    await this._reviewManager.addAISuggestion(this._filePath, suggestion);
                }
            }
            
            // 添加差异分析建议
            if (aiResult.diffSuggestions && aiResult.diffSuggestions.length > 0) {
                for (const suggestion of aiResult.diffSuggestions) {
                    await this._reviewManager.addAISuggestion(this._filePath, `[差异分析] ${suggestion}`);
                }
            }
            
            // 添加整个文件分析建议
            if (aiResult.fullFileSuggestions && aiResult.fullFileSuggestions.length > 0) {
                for (const suggestion of aiResult.fullFileSuggestions) {
                    await this._reviewManager.addAISuggestion(this._filePath, `[文件分析] ${suggestion}`);
                }
            }
            
            // 设置代码质量评分
            if (aiResult.score !== undefined) {
                await this._reviewManager.setCodeQualityScore(this._filePath, aiResult.score);
            }
            
            // 更新面板内容
            this._update();
            
            this._reviewManager.getNotificationManager().log('AI代码审查已完成', 'info', true);
        } catch (error) {
            this._reviewManager.getNotificationManager().log(`AI审查应用失败: ${error}`, 'error', true);
        }
    }
}
