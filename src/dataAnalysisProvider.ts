import * as vscode from 'vscode';
import { DayRecordManager } from './dayRecordManager';
import { DayAnalysisManager } from './dayAnalysisManager';

export class DataAnalysisProvider {
    private panel: vscode.WebviewPanel | undefined;
    private dayRecordManager: DayRecordManager;
    private dayAnalysisManager: DayAnalysisManager;

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.dayRecordManager = new DayRecordManager(context);
        this.dayAnalysisManager = new DayAnalysisManager(context);
    }

    public show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'enpractice.dataAnalysis',
            'English Practice Analysis',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri]
            }
        );

        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

        this.panel.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'requestDateList':
                    await this.sendDateList();
                    break;
                case 'requestDateData':
                    await this.sendDateData(data.date);
                    break;
                case 'generateTodayData':
                    await this.generateTodayData();
                    break;
                case 'generateAnalysisData':
                    await this.generateAnalysisData(data.date);
                    break;
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 初始化时发送日期列表
        this.sendDateList();
    }

    private async sendDateList() {
        if (!this.panel) return;

        try {
            // 从 globalState 获取日期列表
            const totalRecords = await this.dayRecordManager.getTotalRecords();
            
            // 从 totalRecords 中提取日期并排序
            const dates = totalRecords
                .map((record: any) => record.date)
                .sort((a: string, b: string) => b.localeCompare(a)); // 降序排列，最新的在前

            this.panel.webview.postMessage({
                type: 'dateList',
                dates: dates
            });

        } catch (error) {
            console.error('发送日期列表失败:', error);
        }
    }

    private async sendDateData(date: string) {
        if (!this.panel) return;

        try {
            // 从 globalState 获取快照数据
            const snapshotKey = `enpractice.snapshots.${date}`;
            const data = this.context.globalState.get<any>(snapshotKey);

            this.panel.webview.postMessage({
                type: 'dateData',
                date: date,
                data: data
            });

        } catch (error) {
            console.error(`发送日期数据失败: ${date}`, error);
        }
    }

    private async generateTodayData() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // 获取当日记录数据
            const normalRecord = await this.dayRecordManager.getDayRecord(today, 'normal');
            const dictationRecord = await this.dayRecordManager.getDayRecord(today, 'dictation');
            
            // 创建基于单词的快照数据结构
            const snapshot: any = {
                date: today,
                generatedAt: new Date().toISOString(),
                modes: {
                    normal: {
                        words: [],
                        totalWords: 0
                    },
                    dictation: {
                        words: [],
                        totalWords: 0
                    }
                },
                totalStats: {
                    totalWordsNormal: 0,
                    totalWordsDictation: 0,
                    totalWordsAll: 0
                }
            };

            // 处理正常模式数据
            if (normalRecord && normalRecord.dicts) {
                const normalWords: any[] = [];
                
                Object.entries(normalRecord.dicts).forEach(([dictId, dict]: [string, any]) => {
                    Object.entries(dict.chapters).forEach(([chapterNum, chapter]: [string, any]) => {
                        if (chapter.words && Array.isArray(chapter.words)) {
                            chapter.words.forEach((wordName: string) => {
                                // 获取单词的练习记录（从records文件夹）
                                const wordData = this.getWordPracticeRecord(dictId, parseInt(chapterNum), wordName, 'normal');
                                
                                normalWords.push({
                                    word: wordName,
                                    dictId: dictId,
                                    dictName: dict.dictName,
                                    chapter: parseInt(chapterNum),
                                    chapterName: `第${chapterNum}章`,
                                    practiceRecord: wordData,
                                    practicedToday: true
                                });
                            });
                        }
                    });
                });
                
                snapshot.modes.normal.words = normalWords;
                snapshot.modes.normal.totalWords = normalWords.length;
                snapshot.totalStats.totalWordsNormal = normalWords.length;
            }

            // 处理默写模式数据
            if (dictationRecord && dictationRecord.dicts) {
                const dictationWords: any[] = [];
                
                Object.entries(dictationRecord.dicts).forEach(([dictId, dict]: [string, any]) => {
                    Object.entries(dict.chapters).forEach(([chapterNum, chapter]: [string, any]) => {
                        if (chapter.words && Array.isArray(chapter.words)) {
                            chapter.words.forEach((wordName: string) => {
                                // 获取单词的练习记录（从records文件夹）
                                const wordData = this.getWordPracticeRecord(dictId, parseInt(chapterNum), wordName, 'dictation');
                                
                                dictationWords.push({
                                    word: wordName,
                                    dictId: dictId,
                                    dictName: dict.dictName,
                                    chapter: parseInt(chapterNum),
                                    chapterName: `第${chapterNum}章`,
                                    practiceRecord: wordData,
                                    practicedToday: true
                                });
                            });
                        }
                    });
                });
                
                snapshot.modes.dictation.words = dictationWords;
                snapshot.modes.dictation.totalWords = dictationWords.length;
                snapshot.totalStats.totalWordsDictation = dictationWords.length;
            }
            
            // 计算总单词数
            snapshot.totalStats.totalWordsAll = snapshot.totalStats.totalWordsNormal + snapshot.totalStats.totalWordsDictation;

            // 保存快照数据到 globalState
            const snapshotKey = `enpractice.snapshots.${today}`;
            await this.context.globalState.update(snapshotKey, snapshot);

            // 刷新数据显示
            await this.sendDateList();
            await this.sendDateData(today);

            vscode.window.showInformationMessage(`✅ 已生成 ${today} 的单词级快照数据`);

        } catch (error) {
            console.error('Error generating today data:', error);
            vscode.window.showErrorMessage('生成今日数据失败: ' + error);
        }
    }

    // 生成指定日期的分析数据
    private async generateAnalysisData(date: string) {
        try {
            // 首先复制当日数据到目标日期
            await this.copyCurrentDataToTargetDate(date);
            
            // 然后生成该日期的快照数据（每日数据）
            await this.generateSnapshotData(date);
            
            // 最后生成分析数据
            await this.dayAnalysisManager.generateAnalysis(date, this.dayRecordManager);
            
            // 刷新数据显示
            await this.sendDateList();
            await this.sendDateData(date);
            
            vscode.window.showInformationMessage(`✅ 已生成 ${date} 的分析数据`);
        } catch (error) {
            console.error(`生成分析数据失败 (${date}):`, error);
            vscode.window.showErrorMessage(`生成分析数据失败: ${error}`);
        }
    }

    // 复制当日数据到目标日期
    private async copyCurrentDataToTargetDate(targetDate: string) {
        try {
            const currentDate = new Date().toISOString().split('T')[0];
            
            // 如果目标日期就是今天，则不需要复制
            if (targetDate === currentDate) {
                // 确保今天的记录存在
                await this.ensureTodayRecordsExist();
                return;
            }
            
            // 获取当日的正常模式记录
            const currentNormalRecord = await this.dayRecordManager.getDayRecord(currentDate, 'normal');
            // 获取当日的默写模式记录
            const currentDictationRecord = await this.dayRecordManager.getDayRecord(currentDate, 'dictation');
            
            // 如果当日有正常模式记录，则复制到目标日期
            if (currentNormalRecord) {
                const targetNormalRecordKey = this.dayRecordManager.getDayRecordKey(targetDate, 'normal');
                await this.context.globalState.update(targetNormalRecordKey, {
                    ...currentNormalRecord,
                    date: targetDate
                });
            }
            
            // 如果当日有默写模式记录，则复制到目标日期
            if (currentDictationRecord) {
                const targetDictationRecordKey = this.dayRecordManager.getDayRecordKey(targetDate, 'dictation');
                await this.context.globalState.update(targetDictationRecordKey, {
                    ...currentDictationRecord,
                    date: targetDate
                });
            }
            
            // 更新总记录列表
            await this.updateTotalRecords(targetDate);
        } catch (error) {
            console.error(`复制当日数据到目标日期失败 (${targetDate}):`, error);
            throw error;
        }
    }

    // 确保今天的记录存在
    private async ensureTodayRecordsExist() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // 确保正常模式记录存在
            const normalRecord = await this.dayRecordManager.getDayRecord(today, 'normal');
            if (!normalRecord) {
                const normalRecordKey = this.dayRecordManager.getDayRecordKey(today, 'normal');
                const emptyNormalRecord = {
                    date: today,
                    dicts: {}
                };
                await this.context.globalState.update(normalRecordKey, emptyNormalRecord);
            }
            
            // 确保默写模式记录存在
            const dictationRecord = await this.dayRecordManager.getDayRecord(today, 'dictation');
            if (!dictationRecord) {
                const dictationRecordKey = this.dayRecordManager.getDayRecordKey(today, 'dictation');
                const emptyDictationRecord = {
                    date: today,
                    dicts: {}
                };
                await this.context.globalState.update(dictationRecordKey, emptyDictationRecord);
            }
            
            // 更新总记录列表
            await this.updateTotalRecords(today);
        } catch (error) {
            console.error('确保今日记录存在时出错:', error);
            throw error;
        }
    }

    // 更新总记录
    private async updateTotalRecords(date: string): Promise<void> {
        try {
            await this.dayRecordManager.updateTotalRecords(date);
        } catch (error) {
            console.error(`更新总记录失败 (${date}):`, error);
            throw error;
        }
    }

    // 生成指定日期的快照数据
    private async generateSnapshotData(date: string) {
        try {
            // 获取指定日期的记录数据
            const normalRecord = await this.dayRecordManager.getDayRecord(date, 'normal');
            const dictationRecord = await this.dayRecordManager.getDayRecord(date, 'dictation');
            
            // 创建基于单词的快照数据结构
            const snapshot: any = {
                date: date,
                generatedAt: new Date().toISOString(),
                modes: {
                    normal: {
                        words: [],
                        totalWords: 0
                    },
                    dictation: {
                        words: [],
                        totalWords: 0
                    }
                },
                totalStats: {
                    totalWordsNormal: 0,
                    totalWordsDictation: 0,
                    totalWordsAll: 0
                }
            };

            // 处理正常模式数据
            if (normalRecord && normalRecord.dicts) {
                const normalWords: any[] = [];
                
                Object.entries(normalRecord.dicts).forEach(([dictId, dict]: [string, any]) => {
                    Object.entries(dict.chapters).forEach(([chapterNum, chapter]: [string, any]) => {
                        if (chapter.words && Array.isArray(chapter.words)) {
                            chapter.words.forEach((wordName: string) => {
                                // 获取单词的练习记录（从records文件夹）
                                const wordData = this.getWordPracticeRecord(dictId, parseInt(chapterNum), wordName, 'normal');
                                
                                normalWords.push({
                                    word: wordName,
                                    dictId: dictId,
                                    dictName: dict.dictName,
                                    chapter: parseInt(chapterNum),
                                    chapterName: `第${chapterNum}章`,
                                    practiceRecord: wordData,
                                    practicedToday: true
                                });
                            });
                        }
                    });
                });
                
                snapshot.modes.normal.words = normalWords;
                snapshot.modes.normal.totalWords = normalWords.length;
                snapshot.totalStats.totalWordsNormal = normalWords.length;
            }

            // 处理默写模式数据
            if (dictationRecord && dictationRecord.dicts) {
                const dictationWords: any[] = [];
                
                Object.entries(dictationRecord.dicts).forEach(([dictId, dict]: [string, any]) => {
                    Object.entries(dict.chapters).forEach(([chapterNum, chapter]: [string, any]) => {
                        if (chapter.words && Array.isArray(chapter.words)) {
                            chapter.words.forEach((wordName: string) => {
                                // 获取单词的练习记录（从records文件夹）
                                const wordData = this.getWordPracticeRecord(dictId, parseInt(chapterNum), wordName, 'dictation');
                                
                                dictationWords.push({
                                    word: wordName,
                                    dictId: dictId,
                                    dictName: dict.dictName,
                                    chapter: parseInt(chapterNum),
                                    chapterName: `第${chapterNum}章`,
                                    practiceRecord: wordData,
                                    practicedToday: true
                                });
                            });
                        }
                    });
                });
                
                snapshot.modes.dictation.words = dictationWords;
                snapshot.modes.dictation.totalWords = dictationWords.length;
                snapshot.totalStats.totalWordsDictation = dictationWords.length;
            }
            
            // 计算总单词数
            snapshot.totalStats.totalWordsAll = snapshot.totalStats.totalWordsNormal + snapshot.totalStats.totalWordsDictation;

            // 保存快照数据到 globalState
            const snapshotKey = `enpractice.snapshots.${date}`;
            await this.context.globalState.update(snapshotKey, snapshot);

        } catch (error) {
            console.error(`生成快照数据失败 (${date}):`, error);
            throw error;
        }
    }

    // 获取单词的练习记录
    private getWordPracticeRecord(dictId: string, chapter: number, word: string, mode: string): any {
        try {
            // 使用 globalState 获取记录
            const recordKey = `enpractice.records.${dictId}.${mode}.ch${chapter}`;
            const chapterRecord = this.context.globalState.get<any>(recordKey);
            
            if (chapterRecord && chapterRecord.wordRecords && chapterRecord.wordRecords[word]) {
                return chapterRecord.wordRecords[word];
            }
            
            // 如果没有找到记录，返回默认值
            return {
                word: word,
                practiceCount: 0,
                correctCount: 0,
                errorCount: 0,
                correctRate: 0,
                lastPracticeTime: '从未练习'
            };
        } catch (error) {
            console.error(`获取单词练习记录失败 (${dictId}, ${chapter}, ${word}):`, error);
            return {
                word: word,
                practiceCount: 0,
                correctCount: 0,
                errorCount: 0,
                correctRate: 0,
                lastPracticeTime: '从未练习'
            };
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>English Practice Analysis</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 10px;
                }
                
                .header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 15px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .date-selector {
                    flex: 1;
                }
                
                select {
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                    padding: 4px 8px;
                    border-radius: 2px;
                    min-width: 120px;
                }
                
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 13px;
                }
                
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .stats-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                    margin-bottom: 20px;
                }
                
                .stat-card {
                    background-color: var(--vscode-editor-widget-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 15px;
                }
                
                .stat-title {
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: var(--vscode-foreground);
                }
                
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-charts-green);
                }
                
                .stat-detail {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }
                
                .words-container {
                    background-color: var(--vscode-editor-widget-background);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 15px;
                }
                
                .words-header {
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: var(--vscode-foreground);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .words-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 10px;
                }
                
                .word-item {
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 8px;
                    font-size: 13px;
                }
                
                .word-name {
                    font-weight: bold;
                    color: var(--vscode-foreground);
                    margin-bottom: 4px;
                }
                
                .word-dict {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 2px;
                }
                
                .word-chapter {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 4px;
                }
                
                .word-stats {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .empty-state {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    padding: 40px 20px;
                }
                
                .mode-tabs {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }
                
                .mode-tab {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                }
                
                .mode-tab.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                
                .loading {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .generate-analysis-btn {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 13px;
                    margin-left: 10px;
                }
                
                .generate-analysis-btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                /* 日期选择弹窗样式 */
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                }
                
                .modal-content {
                    background-color: var(--vscode-editor-background);
                    margin: 15% auto;
                    padding: 20px;
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    width: 300px;
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }
                
                .modal-title {
                    font-size: 16px;
                    font-weight: bold;
                }
                
                .close {
                    color: var(--vscode-descriptionForeground);
                    font-size: 24px;
                    font-weight: bold;
                    cursor: pointer;
                }
                
                .close:hover {
                    color: var(--vscode-foreground);
                }
                
                .modal-body {
                    margin-bottom: 20px;
                }
                
                .date-input {
                    width: 100%;
                    padding: 6px 10px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                    box-sizing: border-box;
                }
                
                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                
                .modal-btn {
                    padding: 6px 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 13px;
                }
                
                .modal-confirm {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: 1px solid var(--vscode-button-background);
                }
                
                .modal-cancel {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: 1px solid var(--vscode-button-secondaryBackground);
                }
                
                .modal-confirm:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .modal-cancel:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>📊 数据分析</h2>
                <div class="date-selector">
                    <select id="dateSelector">
                        <option value="">选择日期</option>
                    </select>
                </div>
                <button class="button" id="generateAnalysisBtn">生成分析数据</button>
                <button class="button" id="generateTodayBtn">生成今日数据</button>
                <button class="button" id="refreshBtn">🔄 刷新</button>
            </div>
            
            <!-- 日期选择弹窗 -->
            <div id="dateModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-title">选择日期</div>
                        <span class="close">&times;</span>
                    </div>
                    <div class="modal-body">
                        <input type="date" id="analysisDateInput" class="date-input">
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn modal-cancel" id="cancelDateBtn">取消</button>
                        <button class="modal-btn modal-confirm" id="confirmDateBtn">确认</button>
                    </div>
                </div>
            </div>
            
            <div class="mode-tabs">
                <button class="mode-tab active" data-mode="normal">📝 正常模式</button>
                <button class="mode-tab" data-mode="dictation">✏️ 默写模式</button>
                <button class="mode-tab" data-mode="all">📈 全部数据</button>
            </div>
            
            <div id="content">
                <div class="loading">加载中...</div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                // 当前选择的模式
                let currentMode = 'normal';
                // 当前显示的数据
                let currentData = null;
                // 当前选择的日期
                let selectedDate = '';
                
                // 页面加载时请求日期列表
                window.addEventListener('load', () => {
                    vscode.postMessage({ type: 'requestDateList' });
                });
                
                // 刷新按钮
                document.getElementById('refreshBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'requestDateList' });
                });
                
                // 生成今日数据按钮
                document.getElementById('generateTodayBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'generateTodayData' });
                });
                
                // 生成分析数据按钮
                document.getElementById('generateAnalysisBtn').addEventListener('click', () => {
                    // 显示日期选择弹窗
                    document.getElementById('dateModal').style.display = 'block';
                    // 设置默认日期为今天
                    const today = new Date().toISOString().split('T')[0];
                    document.getElementById('analysisDateInput').value = today;
                });
                
                // 弹窗关闭按钮
                document.querySelector('.close').addEventListener('click', () => {
                    document.getElementById('dateModal').style.display = 'none';
                });
                
                // 取消按钮
                document.getElementById('cancelDateBtn').addEventListener('click', () => {
                    document.getElementById('dateModal').style.display = 'none';
                });
                
                // 确认按钮
                document.getElementById('confirmDateBtn').addEventListener('click', () => {
                    const selectedDate = document.getElementById('analysisDateInput').value;
                    if (selectedDate) {
                        document.getElementById('dateModal').style.display = 'none';
                        vscode.postMessage({ type: 'generateAnalysisData', date: selectedDate });
                    } else {
                        alert('请选择一个日期');
                    }
                });
                
                // 点击弹窗外部关闭弹窗
                window.addEventListener('click', (event) => {
                    const modal = document.getElementById('dateModal');
                    if (event.target === modal) {
                        modal.style.display = 'none';
                    }
                });
                
                // 日期选择器变化
                document.getElementById('dateSelector').addEventListener('change', (e) => {
                    selectedDate = e.target.value;
                    if (selectedDate) {
                        vscode.postMessage({ type: 'requestDateData', date: selectedDate });
                    }
                });
                
                // 模式切换
                document.querySelectorAll('.mode-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        currentMode = tab.dataset.mode;
                        // 更新内容显示
                        if (currentData) {
                            updateContent(currentData);
                        }
                    });
                });
                
                // 接收来自扩展的消息
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'dateList':
                            updateDateSelector(message.dates);
                            break;
                        case 'dateData':
                            currentData = message.data;
                            updateContent(message.data);
                            break;
                    }
                });
                
                function updateDateSelector(dates) {
                    const selector = document.getElementById('dateSelector');
                    selector.innerHTML = '<option value="">选择日期</option>';
                    
                    dates.forEach(date => {
                        const option = document.createElement('option');
                        option.value = date;
                        option.textContent = date;
                        selector.appendChild(option);
                    });
                }
                
                function updateContent(data) {
                    const content = document.getElementById('content');
                    
                    if (!data) {
                        content.innerHTML = '<div class="empty-state">暂无数据</div>';
                        return;
                    }
                    
                    // 根据当前模式过滤数据
                    let normalWords = data.modes.normal.words || [];
                    let dictationWords = data.modes.dictation.words || [];
                    let displayWords = [];
                    
                    switch (currentMode) {
                        case 'normal':
                            displayWords = normalWords;
                            break;
                        case 'dictation':
                            displayWords = dictationWords;
                            break;
                        case 'all':
                        default:
                            displayWords = [...normalWords, ...dictationWords];
                            break;
                    }
                    
                    // 构建统计信息
                    const statsHtml = \`
                        <div class="stats-container">
                            <div class="stat-card">
                                <div class="stat-title">今日练习单词数</div>
                                <div class="stat-value">\${displayWords.length}</div>
                                <div class="stat-detail">正常模式: \${normalWords.length} | 默写模式: \${dictationWords.length}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-title">词典数量</div>
                                <div class="stat-value">\${displayWords.length > 0 ? new Set(displayWords.map(w => w.dictId)).size : 0}</div>
                                <div class="stat-detail">不同词典的练习记录</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-title">章节数量</div>
                                <div class="stat-value">\${displayWords.length > 0 ? new Set(displayWords.map(w => \`\${w.dictId}-\${w.chapter}\`)).size : 0}</div>
                                <div class="stat-detail">不同章节的练习记录</div>
                            </div>
                        </div>
                    \`;
                    
                    // 构建单词列表
                    let wordsHtml = '';
                    if (displayWords.length > 0) {
                        wordsHtml = \`
                            <div class="words-container">
                                <div class="words-header">
                                    <span>今日练习单词</span>
                                    <span>\${displayWords.length} 个单词</span>
                                </div>
                                <div class="words-list">
                                    \${displayWords.map(word => \`
                                        <div class="word-item">
                                            <div class="word-name">\${word.word}</div>
                                            <div class="word-dict">\${word.dictName}</div>
                                            <div class="word-chapter">\${word.chapterName}</div>
                                            <div class="word-stats">练习次数: \${word.practiceRecord.practiceCount} | 正确率: \${Math.round(word.practiceRecord.correctRate)}%</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        \`;
                    } else {
                        wordsHtml = '<div class="empty-state">今日暂无练习记录</div>';
                    }
                    
                    content.innerHTML = statsHtml + wordsHtml;
                }
            </script>
        </body>
        </html>`;
    }
}