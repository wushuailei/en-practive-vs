import * as vscode from 'vscode';
import { DayRecordManager } from './dayRecordManager';

// 测试每日记录功能
export async function testDayRecord(context: vscode.ExtensionContext) {
    try {
        const dayRecordManager = new DayRecordManager(context);
        
        // 创建当天记录文件
        await dayRecordManager.createDayRecordFile();
        
        // 记录一些测试数据
        await dayRecordManager.recordWordPractice('test-dict', '测试词典', 1, 'hello');
        await dayRecordManager.recordWordPractice('test-dict', '测试词典', 1, 'world');
        await dayRecordManager.recordWordPractice('test-dict', '测试词典', 2, 'typescript');
        
        // 获取并显示当天记录
        const record = await dayRecordManager.getCurrentDayRecord();
        
        vscode.window.showInformationMessage('每日记录测试完成，请查看开发者工具控制台');
    } catch (error) {
        console.error('测试失败:', error);
        vscode.window.showErrorMessage(`测试失败: ${error}`);
    }
}