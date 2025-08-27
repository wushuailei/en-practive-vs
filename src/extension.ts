import * as vscode from 'vscode';
import { PracticeWebviewProvider } from './practiceProvider';
import { showSettingsPanel } from './settingsProvider';
import { AnalyticsProvider } from './analyticsProvider';
import { DataAnalysisProvider } from './dataAnalysisProvider';
import { DayRecordManager } from './dayRecordManager';
import { DayAnalysisManager } from './dayAnalysisManager';

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

    // 添加调试命令：重新计算章节完成次数
    let fixChapterCompletionCommand = vscode.commands.registerCommand('enpractice.fixChapterCompletion', async () => {
        try {
            const recordManager = provider.getRecordManager();
            const currentDictId = provider.getCurrentDictId();
            
            if (!currentDictId) {
                vscode.window.showErrorMessage('请先选择一个词典');
                return;
            }

            // 重新计算第1章的完成次数
            const chapterRecord = await recordManager.loadChapterRecord(currentDictId, 1, 'normal');
            const allWordRecords = Object.values(chapterRecord.wordRecords).filter((wr: any) => wr.practiceCount > 0);
            const correctCounts = allWordRecords.map((wr: any) => wr.correctCount);
            const newCompletionCount = correctCounts.length > 0 ? Math.min(...correctCounts) : 0;
            
            console.log('修复前章节完成次数:', chapterRecord.chapterCompletionCount);
            console.log('所有单词正确次数:', correctCounts);
            console.log('修复后章节完成次数:', newCompletionCount);
            
            chapterRecord.chapterCompletionCount = newCompletionCount;
            chapterRecord.lastPracticeTime = new Date().toISOString();
            
            await recordManager.saveChapterRecord(currentDictId, chapterRecord, 'normal');
            
            vscode.window.showInformationMessage(`章节完成次数已修复: ${chapterRecord.chapterCompletionCount}`);
        } catch (error) {
            vscode.window.showErrorMessage(`修复失败: ${error}`);
        }
    });

    // 在插件激活时自动创建当天的记录文件（为两种模式都创建）
    dayRecordManager.createDayRecordFile('normal').catch(error => {
        console.error('创建每日记录文件(正常模式)失败:', error);
    });
    
    dayRecordManager.createDayRecordFile('dictation').catch(error => {
        console.error('创建每日记录文件(默写模式)失败:', error);
    });
    
    // 在插件激活时检查并生成缺失的分析报告
    dayRecordManager.getTotalRecords().then(async (totalRecords) => {
        await dayAnalysisManager.checkAndGenerateMissingAnalysis(totalRecords, dayRecordManager);
    }).catch(error => {
        console.error('检查缺失分析报告失败:', error);
    });


    context.subscriptions.push(openSettingsCommand, openAnalyticsCommand, openDataAnalysisCommand, fixChapterCompletionCommand);
}

export function deactivate() {}