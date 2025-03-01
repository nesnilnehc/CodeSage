import * as vscode from 'vscode';

/**
 * Notification Manager - Manages notifications, status bar, and output panel in VS Code
 */
export class NotificationManager {
    private static instance: NotificationManager;
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private showNotifications: boolean = true;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('CodeSage');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
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
     */
    public startSession(showOutputChannel: boolean = true): void {
        this.showNotifications = true;
        this.outputChannel.clear();
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
        const timestamp = new Date().toLocaleTimeString();
        const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : '✨';
        this.outputChannel.appendLine(`[${timestamp}] ${prefix} ${message}`);
        if (showNotification && this.showNotifications) {
            switch (level) {
                case 'info':
                    vscode.window.showInformationMessage(message);
                    break;
                case 'warning':
                    vscode.window.showWarningMessage(message);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(message);
                    break;
            }
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
