import * as vscode from 'vscode';
import { DayRecord, DayWordRecord, PracticeMode, WordData } from './types';
import { loadWordBookData } from './wordbooks';

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

    // 获取每日记录的 globalState 键名（按模式区分）
    public getDayRecordKey(date: string, practiceMode: PracticeMode): string {
        const modeSuffix = practiceMode === 'normal' ? '' : `_${practiceMode}`;
        return `enpractice.dayRecords.${date}${modeSuffix}`;
    }

    // 获取总记录的 globalState 键名
    private getTotalRecordKey(): string {
        return 'enpractice.dayRecords.totalRecords';
    }

    // 创建空的每日记录（如果不存在）
    async createDayRecordFile(practiceMode: PracticeMode = 'normal'): Promise<void> {
        const currentDate = this.getCurrentDate();
        const recordKey = this.getDayRecordKey(currentDate, practiceMode);
        
        try {
            // 检查记录是否存在
            const existingRecord = this.context.globalState.get<DayRecord>(recordKey);
            if (!existingRecord) {
                // 创建空记录
                const emptyRecord: DayRecord = {
                    date: currentDate,
                    words: []
                };
                
                await this.context.globalState.update(recordKey, emptyRecord);
                
                // 更新总记录
                await this.updateTotalRecords(currentDate);
            }
        } catch (error) {
            console.error('创建每日记录失败:', error);
        }
    }

    // 更新总记录
    public async updateTotalRecords(date: string): Promise<void> {
        const totalRecordKey = this.getTotalRecordKey();
        let totalRecords: { date: string; analysisGenerated: boolean }[] = [];
        
        try {
            // 读取现有的总记录
            const existingRecords = this.context.globalState.get<{ date: string; analysisGenerated: boolean }[]>(totalRecordKey);
            if (existingRecords) {
                totalRecords = existingRecords;
            }
        } catch (error) {
            // 如果读取失败，创建空数组
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
            await this.context.globalState.update(totalRecordKey, totalRecords);
        }
    }

    // 记录单词练习（每次练习都记录）
    async recordWordPractice(
        dictId: string, 
        dictName: string, 
        chapterNumber: number, 
        word: string, 
        isCorrect: boolean,  // 添加练习结果参数
        practiceMode: PracticeMode = 'normal'
    ): Promise<void> {
        try {
            const currentDate = this.getCurrentDate();
            const recordKey = this.getDayRecordKey(currentDate, practiceMode);
            
            // 读取当前记录
            let dayRecord = this.context.globalState.get<DayRecord>(recordKey);
            if (!dayRecord) {
                // 如果记录不存在，创建新的记录
                dayRecord = {
                    date: currentDate,
                    words: []
                };
            }
            
            // 获取单词的详细信息
            const wordDetails = await this.getWordDetails(dictId, chapterNumber, word);
            
            // 创建单词记录
            const wordRecord: DayWordRecord = {
                word: word,
                translation: wordDetails.translation,
                usphone: wordDetails.usphone,
                ukphone: wordDetails.ukphone,
                dictId: dictId,
                dictName: dictName,
                chapterNumber: chapterNumber,
                practiceTime: new Date().toISOString(),
                isCorrect: isCorrect  // 记录练习结果
            };
            
            // 添加到记录数组中
            dayRecord.words.push(wordRecord);
            
            // 保存更新后的记录
            await this.context.globalState.update(recordKey, dayRecord);
        } catch (error) {
            console.error('记录每日单词练习失败:', error);
        }
    }

    // 获取单词的详细信息
    private async getWordDetails(dictId: string, chapterNumber: number, word: string): Promise<{ translation: string; usphone: string; ukphone: string }> {
        try {
            // 加载词书数据
            const wordBookData = await loadWordBookData(this.context, dictId);
            
            // 查找单词数据
            const wordData = wordBookData.find(w => w.name === word);
            
            if (wordData) {
                // 合并翻译数组为字符串
                const translation = wordData.trans.join('; ');
                // 获取美式和英式音标
                const usphone = wordData.usphone || '';
                const ukphone = wordData.ukphone || '';
                
                return {
                    translation: translation,
                    usphone: usphone,
                    ukphone: ukphone
                };
            }
        } catch (error) {
            console.error('获取单词详细信息失败:', error);
        }
        
        // 返回默认值
        return {
            translation: '未知',
            usphone: '',
            ukphone: ''
        };
    }

    // 获取指定日期的记录
    async getDayRecord(date: string, practiceMode: PracticeMode = 'normal'): Promise<DayRecord | null> {
        try {
            const recordKey = this.getDayRecordKey(date, practiceMode);
            const record = this.context.globalState.get<DayRecord>(recordKey);
            return record || null;
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
        const totalRecordKey = this.getTotalRecordKey();
        
        try {
            const records = this.context.globalState.get<{ date: string; analysisGenerated: boolean }[]>(totalRecordKey);
            return records || [];
        } catch (error) {
            console.error('获取总记录失败:', error);
            return [];
        }
    }

    // 设置指定日期的分析文件生成状态
    async setAnalysisGenerated(date: string, generated: boolean = true): Promise<void> {
        const totalRecordKey = this.getTotalRecordKey();
        let totalRecords: { date: string; analysisGenerated: boolean }[] = [];
        
        try {
            // 读取现有的总记录
            const existingRecords = this.context.globalState.get<{ date: string; analysisGenerated: boolean }[]>(totalRecordKey);
            if (existingRecords) {
                totalRecords = existingRecords;
            }
        } catch (error) {
            console.error('获取总记录失败:', error);
            return;
        }
        
        // 查找并更新指定日期的记录
        const existingRecord = totalRecords.find(record => record.date === date);
        if (existingRecord) {
            existingRecord.analysisGenerated = generated;
            
            // 保存更新后的总记录
            await this.context.globalState.update(totalRecordKey, totalRecords);
        }
    }
}