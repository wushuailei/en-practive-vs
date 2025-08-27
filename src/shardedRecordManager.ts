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

    // 获取主记录文件路径（不包含章节详细数据）
    private getMainRecordPath(dictId: string, practiceMode: PracticeMode): vscode.Uri {
        return vscode.Uri.joinPath(this.context.extensionUri, 'data', 'userdata', 'records', `${dictId}_${practiceMode}_main.json`);
    }

    // 获取章节记录文件路径
    private getChapterRecordPath(dictId: string, chapterNumber: number, practiceMode: PracticeMode): vscode.Uri {
        return vscode.Uri.joinPath(this.context.extensionUri, 'data', 'userdata', 'records', `${dictId}_${practiceMode}_ch${chapterNumber}.json`);
    }

    // 加载主记录（不包含章节详细数据）
    async loadMainRecord(dictId: string, dictName: string, totalWords: number, practiceMode: PracticeMode = 'normal'): Promise<DictRecord> {
        try {
            const recordPath = this.getMainRecordPath(dictId, practiceMode);
            const fileData = await vscode.workspace.fs.readFile(recordPath);
            const content = Buffer.from(fileData).toString('utf8');
            const record = JSON.parse(content) as DictRecord;
            
            // 数据一致性检查和更新
            if (record.totalWords !== totalWords) {
                console.log(`📊 数据一致性检查: ${dictName} (${practiceMode}模式) 单词数从 ${record.totalWords} 更新为 ${totalWords}`);
                record.totalWords = totalWords;
                record.totalChapters = Math.ceil(totalWords / FIXED_WORDS_PER_CHAPTER);
                await this.saveMainRecord(record);
            }
            
            console.log(`✅ 加载词典记录: ${dictName} (${dictId}) - ${practiceMode}模式`);
            
            return record;
        } catch (error) {
            console.log(`🆕 词典记录不存在，自动创建: ${dictName} (${dictId}) - ${practiceMode}模式`);
            const newRecord = createDefaultDictRecord(dictId, dictName, totalWords, practiceMode);
            await this.saveMainRecord(newRecord);
            console.log(`✅ 词典记录创建完成: ${dictName} - ${totalWords}个单词，${newRecord.totalChapters}个章节 - ${practiceMode}模式`);
            return newRecord;
        }
    }

    // 保存主记录
    async saveMainRecord(record: DictRecord): Promise<void> {
        try {
            const recordPath = this.getMainRecordPath(record.dictId, record.practiceMode);
            // 直接保存记录，不包含章节数据
            const content = JSON.stringify(record, null, 2);
            await vscode.workspace.fs.writeFile(recordPath, Buffer.from(content, 'utf8'));
        } catch (error) {
            console.error(`保存主记录失败: ${record.dictId} - ${record.practiceMode}模式`, error);
        }
    }

    // 加载章节记录
    async loadChapterRecord(dictId: string, chapterNumber: number, practiceMode: PracticeMode = 'normal'): Promise<ChapterRecord> {
        try {
            const chapterPath = this.getChapterRecordPath(dictId, chapterNumber, practiceMode);
            const fileData = await vscode.workspace.fs.readFile(chapterPath);
            const content = Buffer.from(fileData).toString('utf8');
            return JSON.parse(content) as ChapterRecord;
        } catch (error) {
            // 创建默认章节记录
            console.log(`🆕 创建章节记录: ${dictId} - 第${chapterNumber}章 - ${practiceMode}模式`);
            const defaultChapter: ChapterRecord = {
                chapterNumber,
                totalWordsInChapter: 10,
                completedWordsCount: 0,
                chapterCompletionCount: 0,
                lastPracticeTime: new Date().toISOString(),
                wordRecords: {}
            };
            await this.saveChapterRecord(dictId, defaultChapter, practiceMode);
            return defaultChapter;
        }
    }

    // 保存章节记录
    async saveChapterRecord(dictId: string, chapterRecord: ChapterRecord, practiceMode: PracticeMode = 'normal'): Promise<void> {
        try {
            const chapterPath = this.getChapterRecordPath(dictId, chapterRecord.chapterNumber, practiceMode);
            const content = JSON.stringify(chapterRecord, null, 2);
            await vscode.workspace.fs.writeFile(chapterPath, Buffer.from(content, 'utf8'));
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
            const chapterRecord = await this.loadChapterRecord(dictId, chapterNumber, practiceMode);
            
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

            // 保存章节记录
            await this.saveChapterRecord(dictId, chapterRecord, practiceMode);
            
            // 记录每日练习（每天每个单词只记录一次）
            if (dictName) {
                await this.dayRecordManager.recordWordPractice(dictId, dictName, chapterNumber, word, practiceMode);
            }
        } catch (error) {
            console.error('记录单词练习失败:', error);
        }
    }

    // 记录章节完成（保留用于兼容性）
    async recordChapterCompletion(dictId: string, chapterNumber: number, practiceMode: PracticeMode = 'normal'): Promise<void> {
        try {
            const chapterRecord = await this.loadChapterRecord(dictId, chapterNumber, practiceMode);
            // 重新计算章节完成统计
            const allWordRecords = Object.values(chapterRecord.wordRecords).filter((wr: any) => wr.practiceCount > 0);
            const correctCounts = allWordRecords.map((wr: any) => wr.correctCount);
            chapterRecord.chapterCompletionCount = correctCounts.length > 0 ? Math.min(...correctCounts) : 0;
            chapterRecord.lastPracticeTime = new Date().toISOString();
            await this.saveChapterRecord(dictId, chapterRecord, practiceMode);
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

    // 生成顺序排序数据（保留用于兼容性）
    async generateSequentialOrder(dictId: string, totalWords: number): Promise<number[]> {
        try {
            const sequentialOrder = Array.from({ length: totalWords }, (_, i) => i);
            console.log(`📚 生成顺序排序，单词数: ${totalWords}`);
            return sequentialOrder;
        } catch (error) {
            console.error('生成顺序排序失败:', error);
            return Array.from({ length: totalWords }, (_, i) => i);
        }
    }

// 获取章节统计信息
    async getChapterStats(dictId: string, chapterNumber: number, practiceMode: PracticeMode = 'normal'): Promise<ChapterRecord | null> {
        try {
            return await this.loadChapterRecord(dictId, chapterNumber, practiceMode);
        } catch (error) {
            console.error('获取章节统计失败:', error);
            return null;
        }
    }

    // 获取单词统计信息
    async getWordStats(dictId: string, chapterNumber: number, word: string, practiceMode: PracticeMode = 'normal'): Promise<WordRecord | null> {
        try {
            const chapterRecord = await this.loadChapterRecord(dictId, chapterNumber, practiceMode);
            return chapterRecord.wordRecords[word] || null;
        } catch (error) {
            console.error('获取单词统计失败:', error);
            return null;
        }
    }

    // 获取存储信息（用于调试）
    getStorageInfo(): { strategy: string; description: string } {
        return {
            strategy: 'Sharded Storage',
            description: '每章一个文件，按需加载，简单高效'
        };
    }
}