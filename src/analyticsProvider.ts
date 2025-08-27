import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WordBookInfo, PracticeMode } from './types';
import { ShardedRecordManager } from './shardedRecordManager';

export class AnalyticsProvider {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private recordManager: ShardedRecordManager;
    private currentPracticeMode: PracticeMode = 'normal';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.recordManager = new ShardedRecordManager(context);
    }

    public show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'enpractice.analytics',
            'Records',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.iconPath = {
            light: vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'record.svg')),
            dark: vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'record.svg'))
        };

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'ready':
                        await this.sendInitialData();
                        break;
                    case 'getWordBooks':
                        await this.sendWordBooks();
                        break;
                    case 'getCurrentDict':
                        await this.sendCurrentDict();
                        break;
                    case 'selectWordBook':
                        await this.loadWordBookData(message.wordBookId);
                        break;
                    case 'selectPracticeMode':
                        await this.loadWordBookDataByMode(message.wordBookId, message.practiceMode);
                        break;
                    case 'getChapterWords':
                        await this.loadChapterWords(message.wordBookId, message.chapter, this.currentPracticeMode);
                        break;
                    case 'refreshData':
                        await this.refreshAnalyticsData(message.wordBookId);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private async sendInitialData() {
        await this.sendWordBooks();
        await this.sendCurrentDict();
    }

    private async sendCurrentDict() {
        try {
            // 从settings获取当前词典ID
            const { getSettings } = await import('./settings');
            const settings = await getSettings(this.context);
            const currentDictId = settings.currentWordbook;
            
            if (currentDictId) {
                this.panel?.webview.postMessage({
                    command: 'setCurrentDict',
                    data: { currentDictId }
                });
            }
        } catch (error) {
            console.error('Error getting current dict:', error);
        }
    }

    private async sendWordBooks() {
        try {
            const wordBooksPath = path.join(this.context.extensionPath, 'data', 'config', 'wordbooks.json');
            if (fs.existsSync(wordBooksPath)) {
                const wordBooksContent = fs.readFileSync(wordBooksPath, 'utf-8');
                const wordBooks: WordBookInfo[] = JSON.parse(wordBooksContent);
                
                this.panel?.webview.postMessage({
                    command: 'updateWordBooks',
                    data: wordBooks
                });
            }
        } catch (error) {
            console.error('Error loading word books:', error);
        }
    }

    private async loadWordBookData(wordBookId: string) {
        try {
            // 获取词典信息
            const wordBooksPath = path.join(this.context.extensionPath, 'data', 'config', 'wordbooks.json');
            const wordBooksContent = fs.readFileSync(wordBooksPath, 'utf-8');
            const wordBooks: WordBookInfo[] = JSON.parse(wordBooksContent);
            const wordBook = wordBooks.find(wb => wb.id === wordBookId);
            
            if (!wordBook) {
                return;
            }

            // 使用当前练习模式加载词典记录
            const record = await this.recordManager.loadDictRecord(wordBookId, wordBook.name || '', wordBook.length || 0, this.currentPracticeMode);
            
            // 从章节记录中计算全局统计数据
            const globalStats = await this.calculateGlobalStats(wordBookId, record.totalChapters, this.currentPracticeMode);
            
            // 计算整体统计数据
            const overallStats = {
                dictName: record.dictName,
                totalWords: record.totalWords,
                totalChapters: record.totalChapters,
                practiceMode: record.practiceMode,
                chapterLoop: record.chapterLoop,
                globalStats: globalStats
            };

            // 获取章节统计数据
            const chapterStats = [];
            for (let i = 1; i <= record.totalChapters; i++) {
                try {
                    const chapterRecord = await this.recordManager.loadChapterRecord(wordBookId, i, this.currentPracticeMode);
                    const chapterStat = {
                        chapter: i,
                        totalWords: chapterRecord.totalWordsInChapter,
                        practiceCount: Object.values(chapterRecord.wordRecords).reduce((sum: number, word: any) => sum + word.practiceCount, 0),
                        errorCount: Object.values(chapterRecord.wordRecords).reduce((sum: number, word: any) => sum + word.errorCount, 0),
                        correctRate: this.calculateChapterCorrectRate(Object.values(chapterRecord.wordRecords)),
                        completionCount: chapterRecord.chapterCompletionCount
                    };
                    chapterStats.push(chapterStat);
                } catch (error) {
                    chapterStats.push({
                        chapter: i,
                        totalWords: 10,
                        practiceCount: 0,
                        errorCount: 0,
                        correctRate: 0,
                        completionCount: 0
                    });
                }
            }

            this.panel?.webview.postMessage({
                command: 'updateAnalytics',
                data: {
                    overallStats,
                    chapterStats,
                    selectedWordBook: wordBookId
                }
            });

        } catch (error) {
            console.error('Error loading word book data:', error);
        }
    }

    private async loadWordBookDataByMode(wordBookId: string, practiceMode: string) {
        try {
            console.log(`📊 记录后端: 开始加载词书 ${wordBookId}, 模式: ${practiceMode}`);
            
            // 更新当前练习模式
            this.currentPracticeMode = practiceMode as PracticeMode;
            console.log(`📊 记录后端: 当前模式更新为 ${this.currentPracticeMode}`);
            
            // 获取词典信息
            const wordBooksPath = path.join(this.context.extensionPath, 'data', 'config', 'wordbooks.json');
            const wordBooksContent = fs.readFileSync(wordBooksPath, 'utf-8');
            const wordBooks: WordBookInfo[] = JSON.parse(wordBooksContent);
            const wordBook = wordBooks.find(wb => wb.id === wordBookId);
            
            if (!wordBook) {
                console.error(`📊 记录后端: 找不到词书 ${wordBookId}`);
                return;
            }
            
            console.log(`📊 记录后端: 找到词书 ${wordBook.name}, 单词数: ${wordBook.length}`);

            // 加载指定模式的词典记录
            const mode = practiceMode as PracticeMode;
            const record = await this.recordManager.loadDictRecord(wordBookId, wordBook.name || '', wordBook.length || 0, mode);
            console.log(`📊 记录后端: 加载主记录成功`, record);
            
            // 从章节记录中计算全局统计数据
            const globalStats = await this.calculateGlobalStats(wordBookId, record.totalChapters, mode);
            console.log(`📊 记录后端: 全局统计计算完成`, globalStats);
            
            // 计算整体统计数据
            const overallStats = {
                dictName: record.dictName,
                totalWords: record.totalWords,
                totalChapters: record.totalChapters,
                practiceMode: record.practiceMode,
                chapterLoop: record.chapterLoop,
                globalStats: globalStats
            };
            
            console.log(`📊 记录后端: 整体统计数据构建完成`, overallStats);

            // 获取章节统计数据
            const chapterStats = [];
            console.log(`📊 记录后端: 开始加载 ${record.totalChapters} 个章节的数据`);
            
            for (let i = 1; i <= record.totalChapters; i++) {
                try {
                    const chapterRecord = await this.recordManager.loadChapterRecord(wordBookId, i, mode);
                    const chapterStat = {
                        chapter: i,
                        mode: mode,
                        totalWords: chapterRecord.totalWordsInChapter,
                        practiceCount: Object.values(chapterRecord.wordRecords).reduce((sum: number, word: any) => sum + word.practiceCount, 0),
                        errorCount: Object.values(chapterRecord.wordRecords).reduce((sum: number, word: any) => sum + word.errorCount, 0),
                        correctRate: this.calculateChapterCorrectRate(Object.values(chapterRecord.wordRecords)),
                        completionCount: chapterRecord.chapterCompletionCount
                    };
                    chapterStats.push(chapterStat);
                    
                    if (i <= 3) {
                        console.log(`📊 记录后端: 第${i}章数据`, chapterStat);
                    }
                } catch (error) {
                    const defaultStat = {
                        chapter: i,
                        mode: mode,
                        totalWords: 10,
                        practiceCount: 0,
                        errorCount: 0,
                        correctRate: 0,
                        completionCount: 0
                    };
                    chapterStats.push(defaultStat);
                    
                    if (i <= 3) {
                        console.log(`📊 记录后端: 第${i}章数据(默认)`, defaultStat);
                    }
                }
            }
            
            console.log(`📊 记录后端: 章节数据加载完成，共 ${chapterStats.length} 个章节`);

            const responseData = {
                overallStats,
                chapterStats,
                selectedWordBook: wordBookId,
                selectedMode: practiceMode
            };
            
            console.log(`📊 记录后端: 发送 updateAnalyticsByMode 消息`, {
                statsCount: Object.keys(overallStats).length,
                chapterCount: chapterStats.length,
                wordBookId: wordBookId,
                mode: practiceMode
            });

            this.panel?.webview.postMessage({
                command: 'updateAnalyticsByMode',
                data: responseData
            });

        } catch (error) {
            console.error('记录后端: 加载词书数据失败:', error);
        }
    }

    private async loadChapterWords(wordBookId: string, chapter: number, practiceMode: PracticeMode = 'normal') {
        try {
            // 获取词典信息
            const wordBooksPath = path.join(this.context.extensionPath, 'data', 'config', 'wordbooks.json');
            const wordBooksContent = fs.readFileSync(wordBooksPath, 'utf-8');
            const wordBooks: WordBookInfo[] = JSON.parse(wordBooksContent);
            const wordBook = wordBooks.find(wb => wb.id === wordBookId);
            
            if (!wordBook) {
                return;
            }

            // 加载完整的词典文件
            const filename = wordBook.url || wordBook.filename;
            if (!filename) {
                console.error('词典文件名不存在');
                return;
            }

            const dictPath = path.join(this.context.extensionPath, 'data', 'dicts', filename);
            const dictContent = fs.readFileSync(dictPath, 'utf-8');
            const allWords = JSON.parse(dictContent);

            // 计算章节范围
            const startIndex = (chapter - 1) * 10;
            const endIndex = Math.min(startIndex + 10, allWords.length);
            const chapterWords = allWords.slice(startIndex, endIndex);
            
            // 获取该章节单词的统计数据
            const chapterWordStats: any[] = [];
            
            for (let i = 0; i < chapterWords.length; i++) {
                const word = chapterWords[i];
                
                // 查找该单词的练习记录
                let wordRecord = null;
                try {
                    const chapterRecord = await this.recordManager.loadChapterRecord(wordBookId, chapter, practiceMode);
                    wordRecord = chapterRecord.wordRecords[word.name];
                } catch (error) {
                    // 章节记录不存在，跳过
                }
                
                // 如果没有练习记录，创建默认记录
                if (!wordRecord) {
                    wordRecord = {
                        word: word.name,
                        practiceCount: 0,
                        correctCount: 0,
                        errorCount: 0,
                        lastPracticeTime: '从未练习',
                        correctRate: 0
                    };
                }
                
                chapterWordStats.push({
                    name: word.name,
                    practiceCount: wordRecord.practiceCount,
                    correctCount: wordRecord.correctCount || 0, // 正确次数
                    errorCount: wordRecord.errorCount,
                    correctRate: wordRecord.correctRate,
                    lastPracticeTime: wordRecord.lastPracticeTime === '从未练习' ? '从未练习' : this.formatTime(wordRecord.lastPracticeTime),
                    chapter: chapter
                });
            }

            this.panel?.webview.postMessage({
                command: 'updateChapterWords',
                data: {
                    wordStats: chapterWordStats,
                    chapter: chapter
                }
            });

        } catch (error) {
            console.error('Error loading chapter words:', error);
            this.panel?.webview.postMessage({
                command: 'updateChapterWords',
                data: {
                    wordStats: [],
                    chapter: chapter
                }
            });
        }
    }

    private async refreshAnalyticsData(wordBookId: string) {
        if (wordBookId) {
            // 根据当前练习模式加载数据
            await this.loadWordBookDataByMode(wordBookId, this.currentPracticeMode);
        }
    }

    private calculateChapterCorrectRate(words: any[]): number {
        const totalPractice = words.reduce((sum: number, word: any) => sum + word.practiceCount, 0);
        const totalCorrect = words.reduce((sum: number, word: any) => sum + word.correctCount, 0);
        
        if (totalPractice === 0) return 0;
        return (totalCorrect / totalPractice * 100);
    }

    // 计算全局统计数据
    private async calculateGlobalStats(dictId: string, totalChapters: number, practiceMode: PracticeMode = 'normal'): Promise<any> {
        let totalPracticeCount = 0;
        let totalCorrectCount = 0;
        let totalErrorCount = 0;
        let totalCompletedWords = 0;
        
        for (let chapter = 1; chapter <= totalChapters; chapter++) {
            try {
                const chapterRecord = await this.recordManager.loadChapterRecord(dictId, chapter, practiceMode);
                
                // 统计该章节的数据
                const chapterWords = Object.values(chapterRecord.wordRecords);
                totalPracticeCount += chapterWords.reduce((sum: number, word: any) => sum + word.practiceCount, 0);
                totalCorrectCount += chapterWords.reduce((sum: number, word: any) => sum + word.correctCount, 0);
                totalErrorCount += chapterWords.reduce((sum: number, word: any) => sum + word.errorCount, 0);
                totalCompletedWords += chapterWords.filter((word: any) => word.practiceCount > 0).length;
                
            } catch (error) {
                // 章节记录不存在，跳过
                continue;
            }
        }
        
        const overallCorrectRate = totalPracticeCount > 0 ? (totalCorrectCount / totalPracticeCount * 100) : 0;
        
        return {
            totalPracticeCount,
            totalErrorCount,
            totalCompletedWords,
            overallCorrectRate
        };
    }

    private formatTime(isoTimeString: string): string {
        if (!isoTimeString || isoTimeString === '从未练习') {
            return '从未练习';
        }
        
        try {
            const date = new Date(isoTimeString);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);
            
            if (diffDays > 0) {
                return `${diffDays}天前`;
            } else if (diffHours > 0) {
                return `${diffHours}小时前`;
            } else {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                if (diffMinutes > 0) {
                    return `${diffMinutes}分钟前`;
                } else {
                    return '刚刚';
                }
            }
        } catch (error) {
            return '无效时间';
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Records</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 15px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            height: calc(100vh - 30px);
            display: flex;
            flex-direction: column;
        }
        
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 15px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
            flex-shrink: 0;
        }
        
        .header-controls {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .refresh-btn {
            padding: 6px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-background);
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            white-space: nowrap;
        }
        
        .refresh-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .wordbook-selector {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .wordbook-selector label {
            font-weight: bold;
        }
        
        .wordbook-selector select {
            padding: 5px 8px;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 3px;
            font-size: 13px;
        }
        
        .mode-selector {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .mode-selector label {
            font-weight: bold;
        }
        
        .mode-selector select {
            padding: 5px 8px;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 3px;
            font-size: 13px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
            flex-shrink: 0;
        }
        
        .stats-card {
            background-color: var(--vscode-editor-widget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 15px;
        }
        
        .stats-card h3 {
            margin-top: 0;
            margin-bottom: 15px;
            color: var(--vscode-foreground);
            font-size: 16px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 8px;
        }
        
        .stat-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 0;
            border-bottom: 1px solid var(--vscode-editor-widget-border);
        }
        
        .stat-item:last-child {
            border-bottom: none;
        }
        
        .stat-label {
            color: var(--vscode-descriptionForeground);
        }
        
        .stat-value {
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        
        .bottom-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            flex: 1;
            min-height: 0;
        }
        
        .data-panel {
            background-color: var(--vscode-editor-widget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 15px;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            flex-shrink: 0;
        }
        
        .panel-title {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        
        .panel-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .cancel-btn {
            padding: 4px 8px;
            background-color: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
        }
        
        .cancel-btn:hover {
            opacity: 0.8;
        }
        
        .search-input {
            padding: 4px 8px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-size: 12px;
            width: 150px;
        }
        
        .search-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .sort-select {
            padding: 4px 6px;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 3px;
            font-size: 12px;
        }
        
        .data-container {
            flex: 1;
            overflow-y: auto;
            min-height: 0;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .data-table th,
        .data-table td {
            padding: 8px 10px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-editor-widget-border);
        }
        
        .data-table th {
            background-color: var(--vscode-editor-background);
            font-weight: bold;
            color: var(--vscode-foreground);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        
        .data-table tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .data-table tr:last-child td {
            border-bottom: none;
        }
        
        .correct-rate {
            font-weight: bold;
        }
        
        .correct-rate.high {
            color: var(--vscode-testing-iconPassed);
        }
        
        .correct-rate.medium {
            color: var(--vscode-testing-iconQueued);
        }
        
        .correct-rate.low {
            color: var(--vscode-testing-iconFailed);
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        
        .no-data {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        
        .chapter-row {
            cursor: pointer;
        }
        
        .chapter-row:hover {
            background-color: var(--vscode-list-hoverBackground) !important;
        }
        
        .chapter-row.selected {
            background-color: var(--vscode-list-activeSelectionBackground) !important;
            color: var(--vscode-list-activeSelectionForeground) !important;
        }
        
        .sortable-header {
            cursor: pointer;
            user-select: none;
            position: relative;
        }
        
        .sortable-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .sort-icon {
            margin-left: 5px;
            opacity: 0.5;
        }
        
        .sort-icon.active {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>📊 记录</h2>
            <div class="header-controls">
                <button class="refresh-btn" id="refreshBtn" onclick="refreshData()" title="刷新数据">🔄 刷新</button>
                <div class="wordbook-selector">
                    <label for="wordbookSelect">选择词书:</label>
                    <select id="wordbookSelect" onchange="selectWordBook(this.value)">
                        <option value="">请选择词书</option>
                    </select>
                </div>
                <div class="mode-selector">
                    <label for="modeSelect">练习模式:</label>
                    <select id="modeSelect" onchange="selectPracticeMode(this.value)">
                        <option value="normal">📝 正常模式</option>
                        <option value="dictation">✏️ 默写模式</option>
                    </select>
                </div>
            </div>
        </div>

        <div id="analyticsContent" style="display: none; flex: 1; display: flex; flex-direction: column;">
            <!-- 词典整体数据 -->
            <div class="stats-grid">
                <div class="stats-card">
                    <h3>📚 词典整体统计</h3>
                    <div class="stat-item">
                        <span class="stat-label">词典名称:</span>
                        <span class="stat-value" id="dictName">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">总单词数:</span>
                        <span class="stat-value" id="totalWords">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">总章节数:</span>
                        <span class="stat-value" id="totalChapters">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">练习模式:</span>
                        <span class="stat-value" id="practiceMode">-</span>
                    </div>
                </div>
                
                <div class="stats-card">
                    <h3>📈 练习统计</h3>
                    <div class="stat-item">
                        <span class="stat-label">总练习次数:</span>
                        <span class="stat-value" id="totalPracticeCount">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">总错误次数:</span>
                        <span class="stat-value" id="totalErrorCount">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">已完成单词:</span>
                        <span class="stat-value" id="totalCompletedWords">-</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">整体正确率:</span>
                        <span class="stat-value" id="overallCorrectRate">-</span>
                    </div>
                </div>
            </div>

            <!-- 底部双栏布局 -->
            <div class="bottom-section">
                <!-- 左侧：章节数据 -->
                <div class="data-panel">
                    <div class="panel-header">
                        <div class="panel-title">📋 章节统计数据</div>
                        <div class="panel-controls">
                            <button class="cancel-btn" id="cancelChapterBtn" onclick="cancelChapterSelection()" style="display: none;">取消选中</button>
                            <select class="sort-select" id="chapterSortSelect" onchange="sortChapterData(this.value)">
                                <option value="chapter-asc">章节 ↑</option>
                                <option value="chapter-desc">章节 ↓</option>
                                <option value="practice-desc">练习次数 ↓</option>
                                <option value="practice-asc">练习次数 ↑</option>
                                <option value="rate-desc">正确率 ↓</option>
                                <option value="rate-asc">正确率 ↑</option>
                            </select>
                        </div>
                    </div>
                    <div class="data-container">
                        <table class="data-table" id="chapterTable">
                            <thead>
                                <tr>
                                    <th>章节</th>
                                    <th>单词数</th>
                                    <th>练习次数</th>
                                    <th>错误次数</th>
                                    <th>正确率</th>
                                    <th>完成次数</th>
                                </tr>
                            </thead>
                            <tbody id="chapterTableBody">
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- 右侧：单词数据 -->
                <div class="data-panel">
                    <div class="panel-header">
                        <div class="panel-title">📝 单词详细数据</div>
                        <div class="panel-controls">
                            <input type="text" class="search-input" id="wordSearchInput" placeholder="搜索单词..." oninput="filterWords(this.value)">
                            <select class="sort-select" id="wordSortSelect" onchange="sortWordData(this.value)">
                                <option value="name-asc">单词 A-Z</option>
                                <option value="name-desc">单词 Z-A</option>
                                <option value="practice-desc">练习次数 ↓</option>
                                <option value="practice-asc">练习次数 ↑</option>
                                <option value="rate-desc">正确率 ↓</option>
                                <option value="rate-asc">正确率 ↑</option>
                            </select>
                        </div>
                    </div>
                    <div class="data-container">
                        <table class="data-table" id="wordTable">
                            <thead>
                                <tr>
                                    <th>单词</th>
                                    <th>练习次数</th>
                                    <th>正确次数</th>
                                    <th>错误次数</th>
                                    <th>正确率</th>
                                    <th>最后练习时间</th>
                                </tr>
                            </thead>
                            <tbody id="wordTableBody">
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <div id="loadingContent" class="loading">
            加载中...
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentWordBookId = '';
        let currentPracticeMode = 'normal';
        let chapterStatsData = [];
        let allWordStats = [];
        let filteredWordStats = [];
        let selectedChapter = null; // 当前选中的章节
        
        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateWordBooks':
                    updateWordBookSelector(message.data);
                    break;
                case 'setCurrentDict':
                    setCurrentDict(message.data.currentDictId);
                    break;
                case 'updateAnalytics':
                    updateAnalyticsDisplay(message.data);
                    break;
                case 'updateAnalyticsByMode':
                    updateAnalyticsDisplay(message.data);
                    break;
                case 'updateChapterWords':
                    updateChapterWordStats(message.data);
                    break;
            }
        });

        function updateWordBookSelector(wordBooks) {
            const select = document.getElementById('wordbookSelect');
            select.innerHTML = '<option value="">请选择词书</option>';
            
            wordBooks.forEach(wordBook => {
                const option = document.createElement('option');
                option.value = wordBook.id;
                option.textContent = wordBook.name + ' (' + wordBook.length + '个单词)';
                select.appendChild(option);
            });
        }
        
        function setCurrentDict(dictId) {
            const select = document.getElementById('wordbookSelect');
            if (select && dictId) {
                select.value = dictId;
                // 自动选中当前词典
                selectWordBook(dictId);
            }
        }

        function selectWordBook(wordBookId) {
            if (wordBookId) {
                currentWordBookId = wordBookId;
                document.getElementById('loadingContent').style.display = 'block';
                document.getElementById('analyticsContent').style.display = 'none';
                
                // 获取当前选中的模式
                const modeSelect = document.getElementById('modeSelect');
                const practiceMode = modeSelect.value;
                
                vscode.postMessage({
                    command: 'selectPracticeMode',
                    wordBookId: wordBookId,
                    practiceMode: practiceMode
                });
            } else {
                document.getElementById('analyticsContent').style.display = 'none';
                document.getElementById('loadingContent').style.display = 'block';
            }
        }
        
        function selectPracticeMode(practiceMode) {
            console.log('📊 记录前端: 选择练习模式', practiceMode, '当前词书ID:', currentWordBookId);
            
            if (currentWordBookId && practiceMode) {
                document.getElementById('loadingContent').style.display = 'block';
                document.getElementById('analyticsContent').style.display = 'none';
                
                vscode.postMessage({
                    command: 'selectPracticeMode',
                    wordBookId: currentWordBookId,
                    practiceMode: practiceMode
                });
            }
        }

        function updateAnalyticsDisplay(data) {
            console.log('📊 记录前端: 接收到数据', data);
            
            document.getElementById('loadingContent').style.display = 'none';
            document.getElementById('analyticsContent').style.display = 'flex';
            
            // 更新整体统计
            const stats = data.overallStats;
            console.log('📊 记录前端: 整体统计', stats);
            
            document.getElementById('dictName').textContent = stats.dictName;
            document.getElementById('totalWords').textContent = stats.totalWords;
            document.getElementById('totalChapters').textContent = stats.totalChapters;
            document.getElementById('practiceMode').textContent = stats.practiceMode === 'normal' ? '📝 正常模式' : '✏️ 默写模式';
            
            // 保存当前练习模式
            currentPracticeMode = stats.practiceMode;
            console.log('📊 记录前端: 当前练习模式设置为', currentPracticeMode);
            
            // 同步模式选择器
            const modeSelect = document.getElementById('modeSelect');
            if (modeSelect) {
                modeSelect.value = currentPracticeMode;
                console.log('📊 记录前端: 模式选择器已同步为', currentPracticeMode);
            }
            
            const globalStats = stats.globalStats;
            console.log('📊 记录前端: 全局统计', globalStats);
            
            document.getElementById('totalPracticeCount').textContent = globalStats.totalPracticeCount;
            document.getElementById('totalErrorCount').textContent = globalStats.totalErrorCount;
            document.getElementById('totalCompletedWords').textContent = globalStats.totalCompletedWords;
            document.getElementById('overallCorrectRate').textContent = globalStats.overallCorrectRate.toFixed(1) + '%';
            
            // 保存章节数据
            chapterStatsData = data.chapterStats;
            console.log('📊 记录前端: 章节统计数据', chapterStatsData.length + '个章节');
            
            // 更新章节表格
            updateChapterTable(chapterStatsData);
            
            // 重置选中状态
            selectedChapter = null;
            document.getElementById('cancelChapterBtn').style.display = 'none';
            
            // 清空单词表格，显示提示信息
            const tbody = document.getElementById('wordTableBody');
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">请选择章节查看单词数据</td></tr>';
        }

        function updateChapterTable(chapterStats) {
            const tbody = document.getElementById('chapterTableBody');
            tbody.innerHTML = '';
            
            chapterStats.forEach(chapter => {
                const row = document.createElement('tr');
                row.className = 'chapter-row';
                row.onclick = () => selectChapterFromTable(chapter.chapter);
                
                const correctRate = chapter.correctRate.toFixed(1);
                const rateClass = correctRate >= 80 ? 'high' : correctRate >= 60 ? 'medium' : 'low';
                
                row.innerHTML = 
                    '<td>第 ' + chapter.chapter + ' 章</td>' +
                    '<td>' + chapter.totalWords + '</td>' +
                    '<td>' + chapter.practiceCount + '</td>' +
                    '<td>' + chapter.errorCount + '</td>' +
                    '<td class="correct-rate ' + rateClass + '">' + correctRate + '%</td>' +
                    '<td>' + chapter.completionCount + '</td>';
                
                tbody.appendChild(row);
            });
        }

        function updateChapterWordStats(data) {
            const wordStats = data.wordStats || [];
            const chapter = data.chapter;
            
            // 更新单词数据
            filteredWordStats = wordStats;
            updateWordTable(filteredWordStats);
            
            // 高亮选中的章节
            if (chapter) {
                const rows = document.querySelectorAll('.chapter-row');
                rows.forEach((row, index) => {
                    row.classList.remove('selected');
                    if (index + 1 === chapter) {
                        row.classList.add('selected');
                    }
                });
                
                selectedChapter = chapter;
                document.getElementById('cancelChapterBtn').style.display = 'inline-block';
            }
        }

        function updateWordTable(wordStats) {
            const tbody = document.getElementById('wordTableBody');
            tbody.innerHTML = '';
            
            if (wordStats.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="6" class="no-data">暂无单词数据</td>';
                tbody.appendChild(row);
                return;
            }
            
            wordStats.forEach(word => {
                const row = document.createElement('tr');
                const correctRate = word.correctRate.toFixed(1);
                const rateClass = correctRate >= 80 ? 'high' : correctRate >= 60 ? 'medium' : 'low';
                
                row.innerHTML = 
                    '<td><strong>' + word.name + '</strong></td>' +
                    '<td>' + word.practiceCount + '</td>' +
                    '<td>' + (word.correctCount || 0) + '</td>' +
                    '<td>' + word.errorCount + '</td>' +
                    '<td class="correct-rate ' + rateClass + '">' + correctRate + '%</td>' +
                    '<td>' + word.lastPracticeTime + '</td>';
                
                tbody.appendChild(row);
            });
        }

        function selectChapterFromTable(chapter) {
            // 记录当前选中的章节
            selectedChapter = chapter;
            
            // 加载该章节的单词数据
            if (currentWordBookId) {
                vscode.postMessage({
                    command: 'getChapterWords',
                    wordBookId: currentWordBookId,
                    chapter: chapter
                });
            }
        }

        function sortChapterData(sortType) {
            let sortedData = [...chapterStatsData];
            
            switch (sortType) {
                case 'chapter-asc':
                    sortedData.sort((a, b) => a.chapter - b.chapter);
                    break;
                case 'chapter-desc':
                    sortedData.sort((a, b) => b.chapter - a.chapter);
                    break;
                case 'practice-desc':
                    sortedData.sort((a, b) => b.practiceCount - a.practiceCount);
                    break;
                case 'practice-asc':
                    sortedData.sort((a, b) => a.practiceCount - b.practiceCount);
                    break;
                case 'rate-desc':
                    sortedData.sort((a, b) => b.correctRate - a.correctRate);
                    break;
                case 'rate-asc':
                    sortedData.sort((a, b) => a.correctRate - b.correctRate);
                    break;
            }
            
            updateChapterTable(sortedData);
        }

        function sortWordData(sortType) {
            let sortedData = [...filteredWordStats];
            
            switch (sortType) {
                case 'name-asc':
                    sortedData.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 'name-desc':
                    sortedData.sort((a, b) => b.name.localeCompare(a.name));
                    break;
                case 'practice-desc':
                    sortedData.sort((a, b) => b.practiceCount - a.practiceCount);
                    break;
                case 'practice-asc':
                    sortedData.sort((a, b) => a.practiceCount - b.practiceCount);
                    break;
                case 'rate-desc':
                    sortedData.sort((a, b) => b.correctRate - a.correctRate);
                    break;
                case 'rate-asc':
                    sortedData.sort((a, b) => a.correctRate - b.correctRate);
                    break;
            }
            
            updateWordTable(sortedData);
        }

        function filterWords(searchValue) {
            if (!searchValue.trim()) {
                // 如果搜索框为空，显示当前选中章节的所有单词或所有单词
                updateWordTable(filteredWordStats);
                return;
            }
            
            const filtered = filteredWordStats.filter(word => 
                word.name.toLowerCase().includes(searchValue.toLowerCase())
            );
            
            updateWordTable(filtered);
        }
        
        function cancelChapterSelection() {
            // 清除章节选中状态
            const rows = document.querySelectorAll('.chapter-row');
            rows.forEach(row => row.classList.remove('selected'));
            
            // 隐藏取消选中按钮
            document.getElementById('cancelChapterBtn').style.display = 'none';
            
            // 重置选中章节
            selectedChapter = null;
            
            // 清空单词表格，显示提示信息
            const tbody = document.getElementById('wordTableBody');
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">请选择章节查看单词数据</td></tr>';
        }
        
        function refreshData() {
            console.log('📊 记录前端: 刷新数据被调用');
            
            if (currentWordBookId) {
                // 获取当前选中的练习模式
                const modeSelect = document.getElementById('modeSelect');
                const practiceMode = modeSelect ? modeSelect.value : 'normal';
                
                console.log('📊 记录前端: 当前词书ID:', currentWordBookId, '选中模式:', practiceMode);
                
                vscode.postMessage({
                    command: 'selectPracticeMode',
                    wordBookId: currentWordBookId,
                    practiceMode: practiceMode
                });
            }
        }

        // 初始化
        vscode.postMessage({ command: 'ready' });
        vscode.postMessage({ command: 'getWordBooks' });
    </script>
</body>
</html>`;
    }
}