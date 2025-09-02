import * as vscode from 'vscode';
import { DayRecord, PracticeMode } from './types';
import { ShardedRecordManager } from './shardedRecordManager';
import { getStoredWordBooks } from './wordbooks';

/**
 * 日常分析管理器
 * 用于生成每日练习数据的分析报告
 */
export class DayAnalysisManager {
    private context: vscode.ExtensionContext;
    private shardedRecordManager: ShardedRecordManager;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.shardedRecordManager = new ShardedRecordManager(context);
    }

    // 获取分析数据的 globalState 键名
    private getAnalysisKey(date: string): string {
        return `enpractice.dayRecordsAnalyze.${date}_analysis`;
    }

    // 获取每日记录的 globalState 键名（按模式区分）
    private getDayRecordKey(date: string, practiceMode: PracticeMode): string {
        const modeSuffix = practiceMode === 'normal' ? '' : `_${practiceMode}`;
        return `enpractice.dayRecords.${date}${modeSuffix}`;
    }

    // 读取指定日期的记录
    private async readDayRecord(date: string, practiceMode: PracticeMode): Promise<DayRecord | null> {
        try {
            const recordKey = this.getDayRecordKey(date, practiceMode);
            const record = this.context.globalState.get<DayRecord>(recordKey);
            return record || null;
        } catch (error) {
            console.error(`读取每日记录失败 (${date} - ${practiceMode}):`, error);
            return null;
        }
    }

    // 获取词典详细信息
    private async getDictDetails(dictId: string): Promise<{ name: string; totalWords: number } | null> {
        try {
            const wordBooks = await getStoredWordBooks(this.context);
            const wordBook = wordBooks.find((book: any) => book.id === dictId);
            
            if (wordBook) {
                // 获取词典的单词总数
                const wordBookData = await vscode.workspace.fs.readFile(
                    vscode.Uri.joinPath(this.context.extensionUri, 'data', 'dicts', `${dictId}.json`)
                );
                const words = JSON.parse(Buffer.from(wordBookData).toString('utf8'));
                return {
                    name: wordBook.name,
                    totalWords: words.length
                };
            }
            return null;
        } catch (error) {
            console.error(`获取词典详细信息失败 (${dictId}):`, error);
            return null;
        }
    }

    // 生成指定日期的分析报告
    async generateAnalysis(date: string, dayRecordManager: any): Promise<void> {
        try {
            // 读取两种模式的记录
            const normalRecord = await this.readDayRecord(date, 'normal');
            const dictationRecord = await this.readDayRecord(date, 'dictation');

            // 构建分析数据
            const analysisData: any = {
                date: date,
                generatedAt: new Date().toISOString(),
                normalMode: null,
                dictationMode: null,
                summary: {
                    totalDicts: 0,
                    totalChapters: 0,
                    totalWords: 0,
                    dicts: []
                }
            };

            // 处理正常模式数据
            if (normalRecord) {
                analysisData.normalMode = await this.processRecordData(normalRecord, 'normal');
            }

            // 处理默写模式数据
            if (dictationRecord) {
                analysisData.dictationMode = await this.processRecordData(dictationRecord, 'dictation');
            }

            // 计算汇总数据
            const dictSummary: { [key: string]: any } = {};
            
            // 收集所有词典
            const allDicts: Set<string> = new Set();
            
            // 从处理后的数据中收集词典信息
            if (analysisData.normalMode) {
                Object.keys(analysisData.normalMode.dicts).forEach(dictId => allDicts.add(dictId));
            }
            if (analysisData.dictationMode) {
                Object.keys(analysisData.dictationMode.dicts).forEach(dictId => allDicts.add(dictId));
            }

            // 为每个词典收集详细信息
            for (const dictId of Array.from(allDicts)) {
                // 获取词典名称
                let dictName = 'Unknown';
                if (analysisData.normalMode && analysisData.normalMode.dicts[dictId]) {
                    dictName = analysisData.normalMode.dicts[dictId].dictName;
                } else if (analysisData.dictationMode && analysisData.dictationMode.dicts[dictId]) {
                    dictName = analysisData.dictationMode.dicts[dictId].dictName;
                }

                const dictDetails = await this.getDictDetails(dictId);
                const dictInfo: any = {
                    dictId: dictId,
                    dictName: dictName,
                    totalWordsInDict: dictDetails ? dictDetails.totalWords : 0,
                    normalMode: { chapters: 0, words: 0 },
                    dictationMode: { chapters: 0, words: 0 }
                };

                // 统计正常模式数据
                if (analysisData.normalMode && analysisData.normalMode.dicts[dictId]) {
                    const normalDict = analysisData.normalMode.dicts[dictId];
                    dictInfo.normalMode.chapters = Object.keys(normalDict.chapters).length;
                    dictInfo.normalMode.words = Object.values(normalDict.chapters)
                        .reduce((sum: number, chapter: any) => sum + chapter.wordCount, 0);
                }

                // 统计默写模式数据
                if (analysisData.dictationMode && analysisData.dictationMode.dicts[dictId]) {
                    const dictationDict = analysisData.dictationMode.dicts[dictId];
                    dictInfo.dictationMode.chapters = Object.keys(dictationDict.chapters).length;
                    dictInfo.dictationMode.words = Object.values(dictationDict.chapters)
                        .reduce((sum: number, chapter: any) => sum + chapter.wordCount, 0);
                }

                dictSummary[dictId] = dictInfo;
            }

            // 构建汇总信息
            analysisData.summary.dicts = Object.values(dictSummary);
            analysisData.summary.totalDicts = analysisData.summary.dicts.length;
            analysisData.summary.totalChapters = analysisData.summary.dicts.reduce(
                (sum: number, dict: any) => sum + dict.normalMode.chapters + dict.dictationMode.chapters, 0
            );
            analysisData.summary.totalWords = analysisData.summary.dicts.reduce(
                (sum: number, dict: any) => sum + dict.normalMode.words + dict.dictationMode.words, 0
            );

            // 保存分析数据到 globalState
            const analysisKey = this.getAnalysisKey(date);
            await this.context.globalState.update(analysisKey, analysisData);
            
            // 更新总记录状态
            await dayRecordManager.setAnalysisGenerated(date, true);
        } catch (error) {
            console.error(`生成分析报告失败 (${date}):`, error);
        }
    }

    // 处理记录数据，包含详细的练习统计数据
    private async processRecordData(record: DayRecord, practiceMode: PracticeMode): Promise<any> {
        const processed: any = {
            dicts: {}
        };

        // 根据每日记录中的单词构建词典和章节信息
        for (const wordRecord of record.words) {
            const dictId = wordRecord.dictId;
            const chapterNum = wordRecord.chapterNumber.toString();
            
            // 初始化词典信息
            if (!processed.dicts[dictId]) {
                processed.dicts[dictId] = {
                    dictId: dictId,
                    dictName: wordRecord.dictName,
                    chapters: {}
                };
            }
            
            // 初始化章节信息
            if (!processed.dicts[dictId].chapters[chapterNum]) {
                processed.dicts[dictId].chapters[chapterNum] = {
                    chapterNumber: wordRecord.chapterNumber,
                    wordCount: 0,
                    words: []
                };
            }
            
            // 添加单词到章节中
            processed.dicts[dictId].chapters[chapterNum].wordCount++;
            processed.dicts[dictId].chapters[chapterNum].words.push({
                word: wordRecord.word,
                practiceCount: 0,
                correctCount: 0,
                errorCount: 0,
                correctRate: 0,
                lastPracticeTime: wordRecord.practiceTime
            });
        }

        // 获取每个单词的详细练习统计数据
        for (const dictId in processed.dicts) {
            const dict = processed.dicts[dictId];
            
            for (const chapterNum in dict.chapters) {
                const chapter = dict.chapters[chapterNum];
                
                // 获取章节的详细练习数据
                const chapterRecord = await this.shardedRecordManager.loadChapterRecord(dictId, parseInt(chapterNum), practiceMode);
                
                // 更新单词的详细统计数据
                chapter.words = chapter.words.map((wordInfo: any) => {
                    const wordRecord = chapterRecord.wordRecords[wordInfo.word];
                    if (wordRecord) {
                        return {
                            word: wordInfo.word,
                            practiceCount: wordRecord.practiceCount,
                            correctCount: wordRecord.correctCount,
                            errorCount: wordRecord.errorCount,
                            correctRate: wordRecord.correctRate,
                            lastPracticeTime: wordRecord.lastPracticeTime
                        };
                    } else {
                        // 如果没有找到单词记录，返回默认值
                        return {
                            word: wordInfo.word,
                            practiceCount: 0,
                            correctCount: 0,
                            errorCount: 0,
                            correctRate: 0,
                            lastPracticeTime: wordInfo.lastPracticeTime
                        };
                    }
                });
            }
        }

        return processed;
    }

    // 移除了 checkAndGenerateMissingAnalysis 方法，该方法用于自动检查和生成缺失的分析报告
}