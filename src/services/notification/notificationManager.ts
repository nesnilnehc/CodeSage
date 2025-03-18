import * as vscode from 'vscode';

/**
 * Notification Manager - Manages notifications, status bar, and output panel in VS Code
 */
export class NotificationManager {
    private static instance: NotificationManager;
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private showNotifications: boolean = true;
    private debugMode: boolean = false;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('CodeSage');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.debugMode = process.env['NODE_ENV'] === 'development';
    }

    /**
     * Get notification manager instance
     */
    public static getInstance(): NotificationManager {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }

    /**
     * Start a new session
     * @param showOutputChannel Whether to show output channel
     * @param clearOutput Whether to clear output channel
     */
    public startSession(showOutputChannel: boolean = true, clearOutput: boolean = true): void {
        this.showNotifications = true;
        if (clearOutput) {
            this.outputChannel.clear();
        }
        if (showOutputChannel) {
            this.outputChannel.show(true);
        }
        this.statusBarItem.show();
    }

    /**
     * End current session
     * @param delay Delay in milliseconds before hiding status bar
     * @param clearOutput Whether to clear output channel
     * @param keepOutputVisible Whether to keep output channel visible
     */
    public endSession(delay: number = 5000, clearOutput: boolean = false, keepOutputVisible: boolean = true): void {
        this.showNotifications = false;
        setTimeout(() => {
            if (clearOutput) {
                this.outputChannel.clear();
            }
            if (!keepOutputVisible) {
                this.outputChannel.hide();
            }
            this.statusBarItem.hide();
        }, delay);
    }

    /**
     * Set whether to show notifications
     */
    public setShowNotifications(show: boolean): void {
        this.showNotifications = show;
    }

    /**
     * Log message
     * @param message Message content
     * @param level Message level
     * @param showNotification Whether to show notification
     */
    public log(message: string, level: 'info' | 'warning' | 'error' = 'info', showNotification: boolean = false): void {
        const timestamp = new Date().toISOString();
        const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : '✨';
        const simpleMessage = `[${timestamp}] ${prefix} ${message}`;
        
        // Debug Console: 开发调试信息
        if (this.debugMode) {
            console.log(`[CodeSage] ${simpleMessage}`);
        }
        
        // 始终输出到输出通道，确保所有日志都被记录
        this.outputChannel.appendLine(simpleMessage);
        
        // 根据 showNotification 参数和全局设置决定是否显示通知
        if (this.showNotifications && (showNotification || level === 'error')) {
            // 确保 message 是字符串并且处理可能的 undefined
            const safeMessage = message ?? '';
            let notificationMessage = safeMessage;
            
            // 只有当消息是有效字符串且包含 ']' 时才进行分割
            if (safeMessage.startsWith('[') && safeMessage.includes('] ')) {
                const parts = safeMessage.split('] ');
                if (parts.length > 1) {
                    notificationMessage = parts[1] || safeMessage;
                }
            }
            
            switch (level) {
                case 'info':
                    vscode.window.showInformationMessage(notificationMessage);
                    break;
                case 'warning':
                    vscode.window.showWarningMessage(notificationMessage);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(notificationMessage);
                    break;
            }
        }
    }

    public debug(message: string): void {
        if (this.debugMode) {
            const timestamp = new Date().toISOString();
            console.log(`[CodeSage Debug][${timestamp}] ${message}`);
        }
    }

    /**
     * Update status bar
     * @param message Status bar message
     * @param tooltip Tooltip text
     * @param icon Icon name
     */
    public updateStatusBar(message: string, tooltip?: string, icon: string = 'sync~spin'): void {
        this.statusBarItem.text = icon ? `$(${icon}) ${message}` : message;
        if (tooltip) {
            this.statusBarItem.tooltip = tooltip;
        }
        this.statusBarItem.show();
    }

    /**
     * Complete status
     * @param message Completion message
     */
    public complete(message: string = 'Code review completed'): void {
        this.statusBarItem.text = `$(check) ${message}`;
        // Use more prominent notification
        vscode.window.showInformationMessage(`🎉 ${message}`);
        this.log(`🎉 ${message}`, 'info', false);
    }

    /**
     * Error status
     * @param message Error message
     */
    public error(message: string): void {
        this.statusBarItem.text = `$(error) Error`;
        this.log(message, 'error', true);
    }

    /**
     * Get output channel
     */
    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    /**
     * Get status bar item
     */
    public getStatusBarItem(): vscode.StatusBarItem {
        return this.statusBarItem;
    }

    /**
     * Show persistent notification
     * @param message Notification message
     * @param level Notification level
     */
    public showPersistentNotification(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
        // Log to output
        this.log(message, level, false);
        // Create notification with buttons
        const viewOutput = 'View Details';
        const options: vscode.MessageOptions = { modal: false };
        if (level === 'error') {
            vscode.window.showErrorMessage(message, options, viewOutput)
                .then(selection => {
                    if (selection === viewOutput) {
                        this.outputChannel.show();
                    }
                });
        } else if (level === 'warning') {
            vscode.window.showWarningMessage(message, options, viewOutput)
                .then(selection => {
                    if (selection === viewOutput) {
                        this.outputChannel.show();
                    }
                });
        } else {
            vscode.window.showInformationMessage(message, options, viewOutput)
                .then(selection => {
                    if (selection === viewOutput) {
                        this.outputChannel.show();
                    }
                });
        }
    }
}
