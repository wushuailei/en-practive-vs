import * as vscode from 'vscode';
import { DictRecord, WordRecord, ChapterRecord, createDefaultDictRecord, FIXED_WORDS_PER_CHAPTER, PracticeMode } from './types';
import { DayRecordManager } from './dayRecordManager';

/**
 * 分片记录管理器
 * 采用简单的分片存储策略：每章一个文件
 */
export class ShardedRecordManager {
    private context: vscode.ExtensionContext;
    private dayRecordManager: DayRecordManager;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.dayRecordManager = new DayRecordManager(context);
    }

    // 获取主记录的 globalState 键名
    private getMainRecordKey(dictId: string, practiceMode: PracticeMode): string {
        return `enpractice.records.${dictId}.${practiceMode}.main`;
    }

    // 获取章节记录的 globalState 键名
    private getChapterRecordKey(dictId: string, chapterNumber: number, practiceMode: PracticeMode): string {
        return `enpractice.records.${dictId}.${practiceMode}.ch${chapterNumber}`;
    }

    // 加载主记录（不包含章节详细数据）
    async loadMainRecord(dictId: string, dictName: string, totalWords: number, practiceMode: PracticeMode = 'normal'): Promise<DictRecord> {
        try {
            const recordKey = this.getMainRecordKey(dictId, practiceMode);
            const record = this.context.globalState.get<DictRecord>(recordKey);
            
            if (record) {
                // 数据一致性检查和更新
                if (record.totalWords !== totalWords) {
                    record.totalWords = totalWords;
                    record.totalChapters = Math.ceil(totalWords / FIXED_WORDS_PER_CHAPTER);
                    await this.saveMainRecord(record);
                }
                return record;
            }
            
            // 如果 globalState 中没有记录，则创建默认记录
            const newRecord = createDefaultDictRecord(dictId, dictName, totalWords, practiceMode);
            await this.saveMainRecord(newRecord);
            return newRecord;
        } catch (error) {
            const newRecord = createDefaultDictRecord(dictId, dictName, totalWords, practiceMode);
            await this.saveMainRecord(newRecord);
            return newRecord;
        }
    }

    // 保存主记录
    async saveMainRecord(record: DictRecord): Promise<void> {
        try {
            const recordKey = this.getMainRecordKey(record.dictId, record.practiceMode);
            // 直接保存记录到 globalState，不包含章节数据
            await this.context.globalState.update(recordKey, record);
        } catch (error) {
            console.error(`保存主记录失败: ${record.dictId} - ${record.practiceMode}模式`, error);
        }
    }

    // 加载章节记录
    async loadChapterRecord(dictId: string, chapterNumber: number, practiceMode: PracticeMode = 'normal'): Promise<ChapterRecord> {
        try {
            const recordKey = this.getChapterRecordKey(dictId, chapterNumber, practiceMode);
            const record = this.context.globalState.get<ChapterRecord>(recordKey);
            
            if (record) {
                return record;
            }
            
            // 如果 globalState 中没有记录，则返回默认章节记录
            return {
                chapterNumber,
                totalWordsInChapter: 10,
                completedWordsCount: 0,
                chapterCompletionCount: 0,
                lastPracticeTime: new Date().toISOString(),
                wordRecords: {}
            };
        } catch (error) {
            // 返回默认章节记录
            return {
                chapterNumber,
                totalWordsInChapter: 10,
                completedWordsCount: 0,
                chapterCompletionCount: 0,
                lastPracticeTime: new Date().toISOString(),
                wordRecords: {}
            };
        }
    }

    // 保存章节记录
    async saveChapterRecord(dictId: string, chapterRecord: ChapterRecord, practiceMode: PracticeMode = 'normal'): Promise<void> {
        try {
            const recordKey = this.getChapterRecordKey(dictId, chapterRecord.chapterNumber, practiceMode);
            await this.context.globalState.update(recordKey, chapterRecord);
        } catch (error) {
            console.error(`保存章节记录失败: ${dictId}, 章节: ${chapterRecord.chapterNumber} - ${practiceMode}模式`, error);
        }
    }

    // 兼容性方法：加载完整词典记录
    async loadDictRecord(dictId: string, dictName: string, totalWords: number, practiceMode: PracticeMode = 'normal'): Promise<DictRecord> {
        return await this.loadMainRecord(dictId, dictName, totalWords, practiceMode);
    }

    // 更新当前练习位置
    async updateCurrentPosition(dictId: string, chapterNumber: number, wordIndex: number, practiceMode: PracticeMode = 'normal'): Promise<void> {
        try {
            const record = await this.loadMainRecord(dictId, '', 0, practiceMode);
            record.currentChapter = chapterNumber;
            record.currentWordIndex = wordIndex;
            record.lastPracticeTime = new Date().toISOString();
            await this.saveMainRecord(record);
        } catch (error) {
            console.error('更新练习位置失败:', error);
        }
    }

    // 记录单词练习结果
    async recordWordPractice(
        dictId: string, 
        chapterNumber: number, 
        word: string, 
        isCorrect: boolean,
        practiceMode: PracticeMode = 'normal',
        dictName: string = '' // 添加词典名称参数
    ): Promise<void> {
        try {
            // 加载章节记录
            let chapterRecord = await this.loadChapterRecord(dictId, chapterNumber, practiceMode);
            
            // 检查是否是默认记录（没有实际练习数据）
            const isEmptyRecord = Object.keys(chapterRecord.wordRecords).length === 0;
            
            // 确保单词记录存在
            if (!chapterRecord.wordRecords[word]) {
                chapterRecord.wordRecords[word] = {
                    word,
                    practiceCount: 0,
                    correctCount: 0,
                    errorCount: 0,
                    lastPracticeTime: new Date().toISOString(),
                    correctRate: 0
                };
            }

            const wordRecord = chapterRecord.wordRecords[word];
            
            // 更新单词记录
            wordRecord.practiceCount++;
            if (isCorrect) {
                wordRecord.correctCount++;
            } else {
                wordRecord.errorCount++;
            }
            wordRecord.lastPracticeTime = new Date().toISOString();
            wordRecord.correctRate = wordRecord.practiceCount > 0 ? (wordRecord.correctCount / wordRecord.practiceCount) * 100 : 0;

            // 更新章节记录
            chapterRecord.totalWordsInChapter = 10; // 固定每章节10个单词
            chapterRecord.completedWordsCount = Object.values(chapterRecord.wordRecords)
                .filter((wr: any) => wr.practiceCount > 0).length;
            
            // 计算章节完成次数（所有单词正确次数中的最小值）
            const allWordRecords = Object.values(chapterRecord.wordRecords).filter((wr: any) => wr.practiceCount > 0);
            const correctCounts = allWordRecords.map((wr: any) => wr.correctCount);
            chapterRecord.chapterCompletionCount = correctCounts.length > 0 ? Math.min(...correctCounts) : 0;
            
            chapterRecord.lastPracticeTime = new Date().toISOString();

            // 保存章节记录（只有在有实际练习数据时才保存）
            if (!isEmptyRecord || Object.keys(chapterRecord.wordRecords).length > 0) {
                await this.saveChapterRecord(dictId, chapterRecord, practiceMode);
            }
            
            // 记录每日练习（每天每个单词只记录一次）
            if (dictName) {
                // 传递练习结果到每日记录管理器
                await this.dayRecordManager.recordWordPractice(dictId, dictName, chapterNumber, word, isCorrect, practiceMode);
            }
        } catch (error) {
            console.error('记录单词练习失败:', error);
        }
    }

    // 记录章节完成（保留用于兼容性）
    async recordChapterCompletion(dictId: string, chapterNumber: number, practiceMode: PracticeMode = 'normal'): Promise<void> {
        try {
            const chapterRecord = await this.loadChapterRecord(dictId, chapterNumber, practiceMode);
            
            // 只有在章节记录包含实际数据时才保存
            if (Object.keys(chapterRecord.wordRecords).length > 0) {
                // 重新计算章节完成统计
                const allWordRecords = Object.values(chapterRecord.wordRecords).filter((wr: any) => wr.practiceCount > 0);
                const correctCounts = allWordRecords.map((wr: any) => wr.correctCount);
                chapterRecord.chapterCompletionCount = correctCounts.length > 0 ? Math.min(...correctCounts) : 0;
                chapterRecord.lastPracticeTime = new Date().toISOString();
                await this.saveChapterRecord(dictId, chapterRecord, practiceMode);
            }
        } catch (error) {
            console.error('记录章节完成失败:', error);
        }
    }

    // 更新章节循环设置
    async updateChapterLoop(dictId: string, chapterLoop: boolean, practiceMode: PracticeMode = 'normal'): Promise<void> {
        try {
            const record = await this.loadMainRecord(dictId, '', 0, practiceMode);
            record.chapterLoop = chapterLoop;
            record.lastPracticeTime = new Date().toISOString();
            await this.saveMainRecord(record);
        } catch (error) {
            console.error('更新章节循环设置失败:', error);
        }
    }
}