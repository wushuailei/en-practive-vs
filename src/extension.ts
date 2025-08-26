import * as vscode from 'vscode';
import { PracticeWebviewProvider } from './practiceProvider';
import { showSettingsPanel } from './settingsProvider';
import { AnalyticsProvider } from './analyticsProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('EnPractice extension is now active!');

    // 注册webview视图提供程序
    const provider = new PracticeWebviewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('enpractice.practiceView', provider)
    );

    // 创建数据分析提供者实例
    const analyticsProvider = new AnalyticsProvider(context);

    // 注册设置命令
    let openSettingsCommand = vscode.commands.registerCommand('enpractice.openSettings', () => {
        showSettingsPanel(context, provider);
    });

    // 注册数据分析命令
    let openAnalyticsCommand = vscode.commands.registerCommand('enpractice.openAnalytics', () => {
        analyticsProvider.show();
    });

    context.subscriptions.push(openSettingsCommand, openAnalyticsCommand);
}

export function deactivate() {}