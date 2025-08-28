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

    // 获取分析文件路径
    private getAnalysisFilePath(date: string): vscode.Uri {
        return vscode.Uri.joinPath(this.context.extensionUri, 'data', 'userdata', 'dayRecordsAnalyze', `${date}_analysis.json`);
    }

    // 获取每日记录文件路径（按模式区分）
    private getDayRecordPath(date: string, practiceMode: PracticeMode): vscode.Uri {
        const modeSuffix = practiceMode === 'normal' ? '' : `_${practiceMode}`;
        return vscode.Uri.joinPath(this.context.extensionUri, 'data', 'userdata', 'dayRecords', `${date}${modeSuffix}.json`);
    }

    // 读取指定日期的记录文件
    private async readDayRecord(date: string, practiceMode: PracticeMode): Promise<DayRecord | null> {
        try {
            const recordPath = this.getDayRecordPath(date, practiceMode);
            const fileData = await vscode.workspace.fs.readFile(recordPath);
            const content = Buffer.from(fileData).toString('utf8');
            return JSON.parse(content) as DayRecord;
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
                analysisData.normalMode = await this.processRecordData(normalRecord);
            }

            // 处理默写模式数据
            if (dictationRecord) {
                analysisData.dictationMode = await this.processRecordData(dictationRecord);
            }

            // 计算汇总数据
            const dictSummary: { [key: string]: any } = {};
            
            // 收集所有词典
            const allDicts: Set<string> = new Set();
            if (normalRecord) {
                Object.keys(normalRecord.dicts).forEach(dictId => allDicts.add(dictId));
            }
            if (dictationRecord) {
                Object.keys(dictationRecord.dicts).forEach(dictId => allDicts.add(dictId));
            }

            // 为每个词典收集详细信息
            for (const dictId of Array.from(allDicts)) {
                const dictDetails = await this.getDictDetails(dictId);
                if (dictDetails) {
                    const dictInfo: any = {
                        dictId: dictId,
                        dictName: dictDetails.name,
                        totalWordsInDict: dictDetails.totalWords,
                        normalMode: { chapters: 0, words: 0 },
                        dictationMode: { chapters: 0, words: 0 }
                    };

                    // 统计正常模式数据
                    if (normalRecord && normalRecord.dicts[dictId]) {
                        const normalDict = normalRecord.dicts[dictId];
                        dictInfo.normalMode.chapters = Object.keys(normalDict.chapters).length;
                        dictInfo.normalMode.words = Object.values(normalDict.chapters)
                            .reduce((sum, chapter) => sum + chapter.words.length, 0);
                    }

                    // 统计默写模式数据
                    if (dictationRecord && dictationRecord.dicts[dictId]) {
                        const dictationDict = dictationRecord.dicts[dictId];
                        dictInfo.dictationMode.chapters = Object.keys(dictationDict.chapters).length;
                        dictInfo.dictationMode.words = Object.values(dictationDict.chapters)
                            .reduce((sum, chapter) => sum + chapter.words.length, 0);
                    }

                    dictSummary[dictId] = dictInfo;
                }
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

            // 保存分析文件
            const analysisPath = this.getAnalysisFilePath(date);
            const content = JSON.stringify(analysisData, null, 2);
            await vscode.workspace.fs.writeFile(analysisPath, Buffer.from(content, 'utf8'));
            
            
            // 更新总记录状态
            await dayRecordManager.setAnalysisGenerated(date, true);
        } catch (error) {
            console.error(`生成分析报告失败 (${date}):`, error);
        }
    }

    // 处理记录数据
    private async processRecordData(record: DayRecord): Promise<any> {
        const processed: any = {
            dicts: {}
        };

        for (const dictId in record.dicts) {
            const dict = record.dicts[dictId];
            processed.dicts[dictId] = {
                dictId: dict.dictId,
                dictName: dict.dictName,
                chapters: {}
            };

            for (const chapterNum in dict.chapters) {
                const chapter = dict.chapters[chapterNum];
                processed.dicts[dictId].chapters[chapterNum] = {
                    chapterNumber: chapter.chapterNumber,
                    wordCount: chapter.words.length,
                    words: chapter.words
                };
            }
        }

        return processed;
    }

    // 检查并生成缺失的分析报告
    async checkAndGenerateMissingAnalysis(totalRecords: { date: string; analysisGenerated: boolean }[], dayRecordManager: any): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        
        // 按日期排序，最新的在前
        const sortedRecords = [...totalRecords].sort((a, b) => b.date.localeCompare(a.date));
        
        for (const record of sortedRecords) {
            // 只处理今天之前的日期，并且analysisGenerated为false的记录
            if (record.date < today && !record.analysisGenerated) {
                await this.generateAnalysis(record.date, dayRecordManager);
                break; // 只处理最新的一个
            }
        }
    }
}