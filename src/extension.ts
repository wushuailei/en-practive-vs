import * as vscode from 'vscode';
import { PracticeWebviewProvider } from './practiceProvider';
import { showSettingsPanel } from './settingsProvider';
import { AnalyticsProvider } from './analyticsProvider';
import { DataAnalysisProvider } from './dataAnalysisProvider';
import { DayRecordManager } from './dayRecordManager';
import { DayAnalysisManager } from './dayAnalysisManager';
import { DataViewerProvider } from './dataViewerProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('EnPractice extension is now active!');

    // 注册webview视图提供程序
    const provider = new PracticeWebviewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('enpractice.practiceView', provider)
    );

    // 创建记录提供者实例
    const analyticsProvider = new AnalyticsProvider(context);
    
    // 创建数据分析提供者实例
    const dataAnalysisProvider = new DataAnalysisProvider(context);

    // 创建每日记录管理器实例
    const dayRecordManager = new DayRecordManager(context);
    
    // 创建日常分析管理器实例
    const dayAnalysisManager = new DayAnalysisManager(context);

    // 创建数据查看器实例
    const dataViewerProvider = new DataViewerProvider(context);
    
    // 设置数据查看器重置数据后的回调函数
    dataViewerProvider.setOnDidResetDataCallback(() => {
        // 刷新练习面板
        provider.refreshWordBooks().catch(error => {
            console.error('刷新练习面板失败:', error);
        });
    });

    // 注册设置命令
    let openSettingsCommand = vscode.commands.registerCommand('enpractice.openSettings', () => {
        showSettingsPanel(context, provider);
    });

    // 注册记录命令
    let openAnalyticsCommand = vscode.commands.registerCommand('enpractice.openAnalytics', () => {
        analyticsProvider.show();
    });
    
    // 注册数据分析命令
    const openDataAnalysisCommand = vscode.commands.registerCommand('enpractice.openDataAnalysis', () => {
        dataAnalysisProvider.show();
    });

    // 注册数据查看器命令
    const openDataViewerCommand = vscode.commands.registerCommand('enpractice.openDataViewer', () => {
        dataViewerProvider.show();
    });

    // 在插件激活时自动创建当天的记录文件（为两种模式都创建）
    dayRecordManager.createDayRecordFile('normal').catch(error => {
        console.error('创建每日记录文件(正常模式)失败:', error);
    });
    
    dayRecordManager.createDayRecordFile('dictation').catch(error => {
        console.error('创建每日记录文件(默写模式)失败:', error);
    });
    
    // 移除了插件激活时检查并生成缺失的分析报告的逻辑

    context.subscriptions.push(
        openSettingsCommand, 
        openAnalyticsCommand, 
        openDataAnalysisCommand,
        openDataViewerCommand
    );
}

export function deactivate() {}