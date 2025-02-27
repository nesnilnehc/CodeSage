import * as vscode from 'vscode';

/**
 * 通知管理器 - 用于管理VS Code中的通知、状态栏和输出面板
 */
export class NotificationManager {
    private static instance: NotificationManager;
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private showNotifications: boolean = true;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('AI 代码审查');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    }

    /**
     * 获取通知管理器实例
     */
    public static getInstance(): NotificationManager {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }

    /**
     * 开始新的会话
     */
    public startSession(showOutputChannel: boolean = true): void {
        this.outputChannel.clear();
        if (showOutputChannel) {
            this.outputChannel.show(true);
        }
        this.statusBarItem.show();
    }

    /**
     * 结束会话
     */
    public endSession(delay: number = 5000): void {
        setTimeout(() => {
            this.statusBarItem.hide();
        }, delay);
    }

    /**
     * 设置是否显示通知
     */
    public setShowNotifications(show: boolean): void {
        this.showNotifications = show;
    }

    /**
     * 记录信息
     * @param message 消息内容
     * @param level 消息级别
     * @param showNotification 是否显示通知
     */
    public log(message: string, level: 'info' | 'warning' | 'error' = 'info', showNotification: boolean = false): void {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : '✨';
        this.outputChannel.appendLine(`[${timestamp}] ${prefix} ${message}`);
        
        if (this.showNotifications && showNotification) {
            const options: vscode.MessageOptions = { modal: false };
            
            if (level === 'error') {
                vscode.window.showErrorMessage(message, options);
            } else if (level === 'warning') {
                vscode.window.showWarningMessage(message, options);
            } else {
                vscode.window.showInformationMessage(message, { modal: false });
            }
        }
    }

    /**
     * 更新状态栏
     * @param message 状态栏消息
     * @param tooltip 悬停提示
     * @param icon 图标
     */
    public updateStatusBar(message: string, tooltip?: string, icon: string = 'sync~spin'): void {
        this.statusBarItem.text = `$(${icon}) ${message}`;
        this.statusBarItem.tooltip = tooltip || message;
    }

    /**
     * 完成状态
     * @param message 完成消息
     */
    public complete(message: string = 'AI 代码审查完成'): void {
        this.statusBarItem.text = `$(check) ${message}`;
        
        // 使用更明显的通知
        const options: vscode.MessageOptions = { modal: false };
        vscode.window.showInformationMessage(`🎉 ${message}`, options);
        
        this.log(`🎉 ${message}`, 'info', false);
    }

    /**
     * 错误状态
     * @param message 错误消息
     */
    public error(message: string): void {
        this.statusBarItem.text = `$(error) 错误`;
        this.log(message, 'error', true);
    }

    /**
     * 获取输出通道
     */
    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    /**
     * 获取状态栏项
     */
    public getStatusBarItem(): vscode.StatusBarItem {
        return this.statusBarItem;
    }

    /**
     * 显示持久通知
     * @param message 通知消息
     * @param level 通知级别
     */
    public showPersistentNotification(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
        // 记录到输出
        this.log(message, level, false);
        
        // 创建带有按钮的通知
        const viewOutput = '查看详情';
        const options = { modal: false };
        
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
