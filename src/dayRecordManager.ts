import * as vscode from 'vscode';
import { DayRecord, DayDictRecord, DayChapterRecord, PracticeMode } from './types';

/**
 * 每日记录管理器
 * 用于记录每天练习过的单词
 */
export class DayRecordManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // 获取当天日期字符串 (YYYY-MM-DD)
    private getCurrentDate(): string {
        const now = new Date();
        return now.toISOString().split('T')[0];
    }

    // 获取每日记录文件路径（按模式区分）
    private getDayRecordPath(date: string, practiceMode: PracticeMode): vscode.Uri {
        const modeSuffix = practiceMode === 'normal' ? '' : `_${practiceMode}`;
        return vscode.Uri.joinPath(this.context.extensionUri, 'data', 'userdata', 'dayRecords', `${date}${modeSuffix}.json`);
    }

    // 获取总记录文件路径
    private getTotalRecordPath(): vscode.Uri {
        return vscode.Uri.joinPath(this.context.extensionUri, 'data', 'userdata', 'dayRecords', 'totalRecords.json');
    }

    // 创建空的每日记录文件（如果不存在）
    async createDayRecordFile(practiceMode: PracticeMode = 'normal'): Promise<void> {
        const currentDate = this.getCurrentDate();
        const recordPath = this.getDayRecordPath(currentDate, practiceMode);
        
        try {
            // 检查文件是否存在
            await vscode.workspace.fs.stat(recordPath);
            console.log(`📅 每日记录文件已存在: ${currentDate}${practiceMode === 'normal' ? '' : `_${practiceMode}`}.json`);
        } catch (error) {
            // 文件不存在，创建空文件
            const emptyRecord: DayRecord = {
                date: currentDate,
                dicts: {}
            };
            
            const content = JSON.stringify(emptyRecord, null, 2);
            await vscode.workspace.fs.writeFile(recordPath, Buffer.from(content, 'utf8'));
            console.log(`📅 创建每日记录文件: ${currentDate}${practiceMode === 'normal' ? '' : `_${practiceMode}`}.json`);
            
            // 更新总记录
            await this.updateTotalRecords(currentDate);
        }
    }

    // 更新总记录文件
    private async updateTotalRecords(date: string): Promise<void> {
        const totalRecordPath = this.getTotalRecordPath();
        let totalRecords: { date: string; analysisGenerated: boolean }[] = [];
        
        try {
            // 读取现有的总记录
            const fileData = await vscode.workspace.fs.readFile(totalRecordPath);
            const content = Buffer.from(fileData).toString('utf8');
            totalRecords = JSON.parse(content);
        } catch (error) {
            // 如果文件不存在或读取失败，创建空数组
            totalRecords = [];
        }
        
        // 查找是否已存在该日期的记录
        const existingRecord = totalRecords.find(record => record.date === date);
        
        if (!existingRecord) {
            // 如果该日期不存在记录，添加新记录
            totalRecords.push({
                date: date,
                analysisGenerated: false  // 默认不生成分析文件
            });
            
            // 保存更新后的总记录
            const content = JSON.stringify(totalRecords, null, 2);
            await vscode.workspace.fs.writeFile(totalRecordPath, Buffer.from(content, 'utf8'));
            console.log(`📅 更新总记录文件: ${date}`);
        }
    }

    // 记录单词练习（每天每个单词只记录一次）
    async recordWordPractice(dictId: string, dictName: string, chapterNumber: number, word: string, practiceMode: PracticeMode = 'normal'): Promise<void> {
        try {
            const currentDate = this.getCurrentDate();
            const recordPath = this.getDayRecordPath(currentDate, practiceMode);
            
            // 读取当前记录
            let dayRecord: DayRecord;
            try {
                const fileData = await vscode.workspace.fs.readFile(recordPath);
                const content = Buffer.from(fileData).toString('utf8');
                dayRecord = JSON.parse(content) as DayRecord;
            } catch (error) {
                // 如果文件不存在或读取失败，创建新的记录
                dayRecord = {
                    date: currentDate,
                    dicts: {}
                };
            }
            
            // 确保词典记录存在
            if (!dayRecord.dicts[dictId]) {
                dayRecord.dicts[dictId] = {
                    dictId,
                    dictName,
                    chapters: {}
                };
            }
            
            const dictRecord = dayRecord.dicts[dictId];
            
            // 确保章节记录存在
            const chapterKey = chapterNumber.toString();
            if (!dictRecord.chapters[chapterKey]) {
                dictRecord.chapters[chapterKey] = {
                    chapterNumber,
                    words: []
                };
            }
            
            const chapterRecord = dictRecord.chapters[chapterKey];
            
            // 检查单词是否已记录（避免重复记录）
            if (!chapterRecord.words.includes(word)) {
                chapterRecord.words.push(word);
                console.log(`📅 记录单词练习: ${dictName} - 第${chapterNumber}章 - ${word} (${practiceMode}模式)`);
                
                // 保存更新后的记录
                const content = JSON.stringify(dayRecord, null, 2);
                await vscode.workspace.fs.writeFile(recordPath, Buffer.from(content, 'utf8'));
            }
        } catch (error) {
            console.error('记录每日单词练习失败:', error);
        }
    }

    // 获取指定日期的记录
    async getDayRecord(date: string, practiceMode: PracticeMode = 'normal'): Promise<DayRecord | null> {
        try {
            const recordPath = this.getDayRecordPath(date, practiceMode);
            const fileData = await vscode.workspace.fs.readFile(recordPath);
            const content = Buffer.from(fileData).toString('utf8');
            return JSON.parse(content) as DayRecord;
        } catch (error) {
            console.error(`获取每日记录失败 (${date}):`, error);
            return null;
        }
    }

    // 获取当前日期的记录
    async getCurrentDayRecord(practiceMode: PracticeMode = 'normal'): Promise<DayRecord | null> {
        const currentDate = this.getCurrentDate();
        return await this.getDayRecord(currentDate, practiceMode);
    }

    // 获取总记录
    async getTotalRecords(): Promise<{ date: string; analysisGenerated: boolean }[]> {
        const totalRecordPath = this.getTotalRecordPath();
        
        try {
            const fileData = await vscode.workspace.fs.readFile(totalRecordPath);
            const content = Buffer.from(fileData).toString('utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('获取总记录失败:', error);
            return [];
        }
    }

    // 设置指定日期的分析文件生成状态
    async setAnalysisGenerated(date: string, generated: boolean = true): Promise<void> {
        const totalRecordPath = this.getTotalRecordPath();
        let totalRecords: { date: string; analysisGenerated: boolean }[] = [];
        
        try {
            // 读取现有的总记录
            const fileData = await vscode.workspace.fs.readFile(totalRecordPath);
            const content = Buffer.from(fileData).toString('utf8');
            totalRecords = JSON.parse(content);
        } catch (error) {
            console.error('获取总记录失败:', error);
            return;
        }
        
        // 查找并更新指定日期的记录
        const existingRecord = totalRecords.find(record => record.date === date);
        if (existingRecord) {
            existingRecord.analysisGenerated = generated;
            
            // 保存更新后的总记录
            const content = JSON.stringify(totalRecords, null, 2);
            await vscode.workspace.fs.writeFile(totalRecordPath, Buffer.from(content, 'utf8'));
            console.log(`📅 更新分析文件生成状态: ${date} - ${generated}`);
        }
    }
}