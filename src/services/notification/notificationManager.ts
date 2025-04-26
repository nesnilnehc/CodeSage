import * as vscode from 'vscode';
import { BilingualMessage } from '../../i18n/types';
import { LOG_LEVEL, DEFAULT_LOG_LEVEL, EXTENSION_NAME } from '../../constants/constants';

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
        this.outputChannel = vscode.window.createOutputChannel('CodeKarmic');
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
     * Log a message to the output channel and optionally show a notification.
     * @param message Message to log
     * @param level Log level (INFO, WARNING, ERROR)
     * @param showNotification Whether to show a notification
     */
    public log(message: string | BilingualMessage, level: LOG_LEVEL = DEFAULT_LOG_LEVEL, showNotification: boolean = false): void {
        const timestamp = new Date().toLocaleTimeString();
        let displayMessage = '';
        let englishMessage = '';
        
        if (typeof message === 'string') {
            displayMessage = message;
            englishMessage = message;
        } else {
            // 处理双语消息
            displayMessage = message.zh;
            englishMessage = message.en;
        }

        // 构建日志消息，避免重复显示相同内容
        let logMessage: string;
        if (typeof message === 'string' || displayMessage === englishMessage) {
            logMessage = displayMessage;
        } else {
            logMessage = `${displayMessage} (${englishMessage})`;
        }

        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${logMessage}`);
        
        // 只有在日志级别高于或等于配置的日志级别时才显示通知
        const configuredLogLevel = vscode.workspace.getConfiguration(EXTENSION_NAME).get<string>('logLevel', DEFAULT_LOG_LEVEL);
        
        if (LOG_LEVEL[level] >= LOG_LEVEL[configuredLogLevel as keyof typeof LOG_LEVEL] && showNotification) {
            if (level === 'ERROR') {
                // 使用错误消息
                vscode.window.showErrorMessage(displayMessage);
            } else if (level === 'WARNING') {
                // 使用警告消息
                vscode.window.showWarningMessage(displayMessage);
            } else {
                // 使用信息消息
                vscode.window.showInformationMessage(displayMessage);
            }
        }

        // 更新状态栏
        this.updateStatusBar(displayMessage, level);
    }

    public debug(message: string): void {
        if (this.debugMode) {
            const timestamp = new Date().toISOString();
            console.log(`[CodeKarmic Debug][${timestamp}] ${message}`);
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
