import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewManager } from './reviewManager';

export class ReviewPanel {
    public static currentPanel: ReviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _reviewManager: ReviewManager;
    private _filePath: string;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        reviewManager: ReviewManager,
        filePath: string
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._reviewManager = reviewManager;
        this._filePath = filePath;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
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
        filePath: string
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (ReviewPanel.currentPanel) {
            ReviewPanel.currentPanel._panel.reveal(column);
            ReviewPanel.currentPanel._filePath = filePath;
            ReviewPanel.currentPanel._update();
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            'codesage',
            'Code Review',
            column || vscode.ViewColumn.One,
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

    private async _update() {
        const webview = this._panel.webview;
        this._panel.title = `Review: ${path.basename(this._filePath)}`;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async performAIReview() {
        const selectedCommit = this._reviewManager.getSelectedCommit();
        
        if (!selectedCommit) {
            vscode.window.showErrorMessage('No commit selected');
            return;
        }
        
        try {
            // Show progress indicator
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Analyzing code...',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0 });
                    
                    // Get file content
                    const fileContent = await this._reviewManager.getSelectedCommit()?.files || [];
                    
                    progress.report({ increment: 30, message: 'Processing file content...' });
                    
                    // Simulate AI analysis (in a real extension, this would call the DeepSeek API)
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    progress.report({ increment: 30, message: 'Generating suggestions...' });
                    
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
                    
                    // In a real extension, this would be calculated based on actual code analysis
                    const reviewData = await this._reviewManager.reviewFile(this._filePath);
                    reviewData.codeQualityScore = 7.5;
                }
            );
            
            vscode.window.showInformationMessage('AI code review completed');
        } catch (error) {
            vscode.window.showErrorMessage(`AI review failed: ${error}`);
        }
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        // Get the file content
        const selectedCommit = this._reviewManager.getSelectedCommit();
        
        if (!selectedCommit) {
            return `<html><body>No commit selected</body></html>`;
        }
        
        // Get the review data for this file
        const reviewData = await this._reviewManager.reviewFile(this._filePath);
        
        // Create HTML content
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Review</title>
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
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Code Review: ${this._filePath}</h1>
                    <div class="commit-info">
                        Commit: ${selectedCommit.hash.substring(0, 7)} - ${selectedCommit.message}<br>
                        Author: ${selectedCommit.author} - ${new Date(selectedCommit.date).toLocaleString()}
                    </div>
                </div>
                
                <div class="review-section">
                    <div class="review-tabs">
                        <button class="tab active" data-tab="comments">Comments</button>
                        <button class="tab" data-tab="ai-suggestions">AI Suggestions</button>
                        <button class="tab" data-tab="add-comment">Add Comment</button>
                    </div>
                    
                    <div class="tab-content">
                        <div class="tab-panel active" id="comments">
                            ${reviewData.comments.length === 0 
                                ? '<p>No comments yet. Add a comment or request an AI review.</p>' 
                                : `<ul class="comment-list">
                                    ${reviewData.comments.map(comment => `
                                        <li class="comment-item">
                                            <div class="comment-header">
                                                <span>Line ${comment.lineNumber}</span>
                                                <span>${comment.author} - ${new Date(comment.timestamp).toLocaleString()}</span>
                                            </div>
                                            <div class="comment-content">${comment.content}</div>
                                        </li>
                                    `).join('')}
                                </ul>`
                            }
                        </div>
                        
                        <div class="tab-panel" id="ai-suggestions">
                            ${reviewData.aiSuggestions.length === 0 
                                ? '<p>No AI suggestions yet. Click "Request AI Review" to analyze this file.</p>' 
                                : `
                                    <ul class="suggestion-list">
                                        ${reviewData.aiSuggestions.map(suggestion => `
                                            <li class="suggestion-item">${suggestion}</li>
                                        `).join('')}
                                    </ul>
                                    
                                    ${reviewData.codeQualityScore !== undefined 
                                        ? `<div class="quality-score">Code Quality Score: ${reviewData.codeQualityScore}/10</div>` 
                                        : ''
                                    }
                                `
                            }
                        </div>
                        
                        <div class="tab-panel" id="add-comment">
                            <div class="comment-form">
                                <textarea id="comment-content" placeholder="Enter your comment here..."></textarea>
                                <div class="form-actions">
                                    <input type="number" id="line-number" placeholder="Line number" min="1" />
                                    <button id="submit-comment">Add Comment</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="actions">
                    <button id="request-ai-review">Request AI Review</button>
                    <button id="generate-report">Generate Report</button>
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
                            alert('Please enter a comment');
                            return;
                        }
                        
                        if (isNaN(lineNumber) || lineNumber < 1) {
                            alert('Please enter a valid line number');
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
                    
                    // Generate report
                    document.getElementById('generate-report').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'generateReport'
                        });
                    });
                })();
            </script>
        </body>
        </html>`;
    }
}
